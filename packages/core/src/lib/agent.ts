import Anthropic from '@anthropic-ai/sdk';
import { loadConfig, type Config } from './config.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import {
  executeRunSqlTool,
  runSqlToolDefinition,
  RUN_SQL_TOOL_NAME,
} from './runsql-tool.js';
import {
  executeListCategoriesTool,
  listCategoriesToolDefinition,
  LIST_CATEGORIES_TOOL_NAME,
} from './list-categories-tool.js';
import type { DbReadonlyDeps } from './db-readonly.js';
import {
  logInteraction,
  type ChatMessage,
  type ChatMessageContentBlock,
  type LogEntryInput,
  type ToolStep,
  type UsageInfo,
} from './logger.js';

// Szándékosan kicsi és rögzített (nincs streaming, nincs retry) — a B3
// tool-hurok miatt indokolt konfigurálhatóság a max iterációszám (lásd
// lent), a válaszhossz-limit változatlan marad.
const MAX_TOKENS = 1024;

// A hurok-elszabadulás elleni védelem (B3.5 döntés #5): egy kérdés
// legfeljebb ennyi `messages.create` kört futhat, mielőtt feladjuk. Ha az
// utolsó kör is `tool_use`-szal zárul, egyértelmű hibával hibázunk ki
// ahelyett, hogy a végtelenségig (és API-költség mellett) várnánk egy
// végleges válaszra. 5 kör bőven elég egy egyszerű "kérdés → SQL →
// válasz" folyamathoz, még akkor is, ha a modell egyszer hibás SQL-t ír és
// javítja magát.
export const MAX_TOOL_ITERATIONS = 5;

export interface AskAgentDeps {
  readonly client?: Anthropic;
  readonly config?: Config;
  readonly log?: (entry: LogEntryInput) => Promise<void>;
  // A runSql tool adatbázis-kapcsolatának injektálása teszteléshez (lásd
  // db-readonly.ts) — alapból a valódi, lustán létrehozott, megosztott pool.
  readonly dbPool?: DbReadonlyDeps['pool'];
}

export interface AskAgentResult {
  readonly answer: string;
  readonly systemPrompt: string;
  readonly messages: readonly ChatMessage[];
  readonly usage: UsageInfo;
  readonly toolSteps: readonly ToolStep[];
}

function extractText(content: readonly Anthropic.ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text.trim())
    .join('\n')
    .trim();
}

/**
 * Az SDK válasz-blokkjait (`TextBlock`/`ToolUseBlock`/...) a naplózható,
 * `ChatMessage`-kompatibilis blokk-alakra képezi. Szándékosan csak a `text`
 * és `tool_use` blokkokat tartja meg (a modellnek ebben az alkalmazásban
 * csak ez a kettő releváns — nincs extended thinking, nincs szerver-oldali
 * tool) — explicit mezőnkénti másolással, nem a válasz-objektum
 * újrafelhasználásával, hogy a napló alakja stabil és kiszámítható maradjon.
 */
function toChatContentBlocks(
  content: readonly Anthropic.ContentBlock[],
): readonly ChatMessageContentBlock[] {
  return content.flatMap((block): ChatMessageContentBlock[] => {
    if (block.type === 'text') {
      return [{ type: 'text', text: block.text }];
    }
    if (block.type === 'tool_use') {
      return [
        { type: 'tool_use', id: block.id, name: block.name, input: block.input },
      ];
    }
    return [];
  });
}

function toApiMessages(
  messages: readonly ChatMessage[],
): Anthropic.MessageParam[] {
  return messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === 'string'
        ? message.content
        : [...message.content],
  }));
}

/**
 * Egy tool-végrehajtás eredményét a naplózáshoz (`ToolStep`) és a
 * modellnek visszaküldhető `tool_result` blokkhoz szükséges egységes
 * alakra hozza — `runSql`-nél a lefuttatott SQL-t és a sorok JSON-ját,
 * `listCategories`-nél a kategórianevek JSON-ját adja vissza. Hiba esetén
 * mindkét tool ugyanazt a hibaüzenetet adja tovább.
 */
interface ToolDispatchResult {
  readonly ok: boolean;
  readonly sql?: string;
  readonly rowCount?: number;
  readonly resultSummary: string;
}

async function dispatchToolUse(
  block: Anthropic.ToolUseBlock,
  dbDeps: DbReadonlyDeps,
): Promise<ToolDispatchResult> {
  if (block.name === RUN_SQL_TOOL_NAME) {
    const result = await executeRunSqlTool(block.input, dbDeps);
    return {
      ok: result.ok,
      sql: result.sql,
      rowCount: result.ok ? result.rowCount : undefined,
      resultSummary: result.ok ? JSON.stringify(result.rows) : result.error,
    };
  }

  const result = await executeListCategoriesTool(block.input, dbDeps);
  return {
    ok: result.ok,
    rowCount: result.ok ? result.categories.length : undefined,
    resultSummary: result.ok
      ? JSON.stringify(result.categories)
      : result.error,
  };
}

/**
 * Kézzel írt tool-use hurok (B3.5) a hivatalos Anthropic SDK kliensén
 * keresztül — nincs `toolRunner`/`betaZodTool` SDK-segéd, a mechanika
 * végig látható marad:
 *
 * 1. `messages.create` hívás a teljes, tool-os `SYSTEM_PROMPT`-tal és a
 *    `runSql` + `listCategories` tool-definíciókkal.
 * 2. Amíg a válasz `stop_reason`-je `"tool_use"`, minden `tool_use`
 *    blokkra lefuttatjuk a megfelelő tool-t (`dispatchToolUse`, kizárólag a
 *    read-only DB-kapcsolaton), és egy `tool_result` user-üzenetként
 *    visszaküldjük — majd újra hívjuk a modellt a bővített
 *    üzenet-előzménnyel.
 * 3. Amint a `stop_reason` nem `"tool_use"`, a szöveges tartalom a
 *    végleges, természetes nyelvű válasz.
 *
 * A kör-számot `MAX_TOOL_ITERATIONS` korlátozza (döntés #5) — ha elérjük
 * anélkül, hogy végleges válasz született volna, hibával hibázunk ki,
 * ahelyett hogy a végtelenségig hurkolnánk.
 *
 * Minden hívást naplóz (`logInteraction`), a generált SQL-lel és minden
 * tool-lépés kimenetelével együtt (B3.6).
 */
export async function askAgent(
  question: string,
  deps: AskAgentDeps = {},
): Promise<AskAgentResult> {
  const config = deps.config ?? loadConfig();
  const client =
    deps.client ?? new Anthropic({ apiKey: config.anthropicApiKey });
  const log = deps.log ?? logInteraction;
  const dbDeps: DbReadonlyDeps = { config, pool: deps.dbPool };

  let messages: ChatMessage[] = [{ role: 'user', content: question }];
  const toolSteps: ToolStep[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    const response = await client.messages.create({
      model: config.anthropicModel,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: toApiMessages(messages),
      tools: [runSqlToolDefinition, listCategoriesToolDefinition],
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    messages = [
      ...messages,
      { role: 'assistant', content: toChatContentBlocks(response.content) },
    ];

    if (response.stop_reason !== 'tool_use') {
      const answer = extractText(response.content);
      const usage: UsageInfo = {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      };

      await log({
        systemPrompt: SYSTEM_PROMPT,
        messages,
        answer,
        usage,
        toolSteps,
      });

      return { answer, systemPrompt: SYSTEM_PROMPT, messages, usage, toolSteps };
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    const toolResultBlocks: ChatMessageContentBlock[] = [];
    for (const block of toolUseBlocks) {
      if (
        block.name !== RUN_SQL_TOOL_NAME &&
        block.name !== LIST_CATEGORIES_TOOL_NAME
      ) {
        toolResultBlocks.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: `Ismeretlen tool: "${block.name}".`,
          is_error: true,
        });
        continue;
      }

      const { ok, sql, rowCount, resultSummary } = await dispatchToolUse(
        block,
        dbDeps,
      );

      toolSteps.push({
        toolName: block.name,
        input: block.input,
        sql,
        ok,
        rowCount,
        resultSummary,
      });

      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: resultSummary,
        is_error: !ok,
      });
    }

    messages = [...messages, { role: 'user', content: toolResultBlocks }];
  }

  const usage: UsageInfo = {
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
  const failureAnswer = `A runSql tool-hurok elérte a maximális iterációszámot (${MAX_TOOL_ITERATIONS}) anélkül, hogy végleges választ kapott volna.`;

  await log({
    systemPrompt: SYSTEM_PROMPT,
    messages,
    answer: failureAnswer,
    usage,
    toolSteps,
  });

  throw new Error(failureAnswer);
}
