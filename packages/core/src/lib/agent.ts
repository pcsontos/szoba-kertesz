import Anthropic from '@anthropic-ai/sdk';
import { loadConfig, type Config } from './config.js';
import { SYSTEM_PROMPT } from './prompts.js';
import { executeTool, tools } from './tools/index.js';
import { Trace } from './trace.js';
import type { DbReadonlyDeps } from './tools/db-readonly.js';
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
  /**
   * Élő, színes konzol-nyom (Trace). Alapból `true`; a CLI `--quiet`
   * kapcsolójára `false`. A watch-log és a JSONL ettől függetlenül ír.
   */
  readonly print?: boolean;
  /**
   * A `logs/<ts>.json` Trace-nyom kiírása. Alapból `true`; a tesztek
   * `false`-szal futnak, hogy ne gyártsanak artifactot.
   */
  readonly persistTrace?: boolean;
  /**
   * Korábbi beszélgetés (interaktív mód) — ezt folytatjuk. A visszakapott
   * `AskAgentResult.messages`-t kell visszaadni a következő híváshoz, így a
   * modell látja az előzményt és a visszautaló kérdés ("és olcsóbbat?")
   * értelmezhető.
   */
  readonly history?: readonly ChatMessage[];
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

  let messages: ChatMessage[] = [
    ...(deps.history ?? []),
    { role: 'user', content: question },
  ];
  const toolSteps: ToolStep[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  // Élő nyom a konzolra és a watch-logba. A JSONL-naplózás (`log`) ettől
  // FÜGGETLENÜL fut tovább — a kettő egymást kiegészíti, nem váltja ki.
  const trace = new Trace({
    question,
    model: config.anthropicModel,
    systemPrompt: SYSTEM_PROMPT,
    print: deps.print ?? true,
    persist: deps.persistTrace ?? true,
  });

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration += 1) {
    // A kérés egyben — így a Trace pontosan azt tudja kiírni, amit elküldünk.
    const request = {
      model: config.anthropicModel,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: toApiMessages(messages),
      tools,
    };
    trace.request(iteration + 1, request);

    const response = await client.messages.create(request);
    const turn = trace.modelTurn(iteration + 1, response);

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

      // Két, egymást kiegészítő nyom: JSONL (token usage, költségbecsléshez)
      // és a kör-strukturált Trace-JSON.
      await log({
        systemPrompt: SYSTEM_PROMPT,
        messages,
        answer,
        usage,
        toolSteps,
      });
      trace.finish(answer, usage);

      return { answer, systemPrompt: SYSTEM_PROMPT, messages, usage, toolSteps };
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    const toolResultBlocks: ChatMessageContentBlock[] = [];
    for (const block of toolUseBlocks) {
      // Az ismeretlen tool kezelése is az `executeTool` dolga — az agent-loop
      // nem tud arról, MILYEN toolok léteznek.
      const outcome = await executeTool(block.name, block.input, dbDeps);
      const { ok, sql, rowCount, resultSummary } = outcome;
      trace.toolStep(turn, block, outcome);

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
