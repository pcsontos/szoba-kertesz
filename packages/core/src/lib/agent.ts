import {
  generateText,
  isStepCount,
  type LanguageModel,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from 'ai';
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { loadConfig, type Config } from './config.js';
import { SYSTEM_PROMPT } from './prompts.js';
import { runSqlTool } from './tools/run-sql.js';
import { listCategoriesTool } from './tools/list-categories.js';
import { getClientPreferencesTool } from './tools/client-preferences.js';
import type { ToolOutcome } from './tools/tool-outcome.js';
import { Trace } from './trace.js';
import {
  logInteraction,
  type LogEntryInput,
  type ToolStep,
  type UsageInfo,
} from './logger.js';

// agent.ts — az agent-loop a Vercel AI SDK-n. A 2–3. órán KÉZZEL írtuk meg ugyanezt
// (prompt → hívás → stop_reason → tool → tool_result → vissza) a nyers Anthropic SDK fölött —
// ezért pontosan tudjuk, mit csinál helyettünk a framework:
//   - a loopot a `generateText` pörgeti, amíg a modell toolt kér (finishReason: 'tool-calls'),
//   - a kör-limitünk a `stopWhen: isStepCount(n)` (régen: MAX_TOOL_ITERATIONS for-ciklus),
//   - a tool-dispatch a tool-definíciók `execute`-ja (régen: executeTool switch),
//   - a kontextus-görgetést (üzenetek hozzáfűzése körről körre) az SDK végzi.
// A TRANSZPARENCIA marad: a `prepareStep` hookban látjuk, MIT küldünk ki minden körben,
// az `onStepEnd`-ben pedig, MI történt — a Trace ugyanazt a színes nyomot írja, mint eddig.
//
// AI SDK 7 eltérések a 4. óra doksijához képest (ami SDK 6-ra íródott):
//   stepCountIs → isStepCount · onStepFinish → onStepEnd · totalUsage → usage
//   response.messages → responseMessages
//   (a v7-ben a `response.messages` CSAK az utolsó kört tartalmazza — a teljes
//    beszélgetés a `responseMessages`; az interaktív memória ezen áll vagy bukik.)

const MAX_TOKENS = 1024;

/** A kör-limit. Régen a for-ciklus felső határa; most deklaratívan a `stopWhen`. */
export const MAX_TOOL_ITERATIONS = 6;

export type Message = ModelMessage;

export interface AskAgentDeps {
  readonly config?: Config;
  readonly log?: (entry: LogEntryInput) => Promise<void>;
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
   * `AskAgentResult.messages`-t kell visszaadni a következő híváshoz.
   */
  readonly history?: readonly Message[];
  /**
   * Teszt-szeam: kész modell (pl. `MockLanguageModelV4` az `ai/test`-ből) a
   * valódi Anthropic-provider helyett. A kézi loop `deps.client`-jének utódja.
   * A `deps.dbPool` viszont MEGSZŰNT: a tool-factory-k a produkciós utat kötik
   * be, a DB-injektálást a tool-szintű specek fedik (`run-sql.spec.ts` stb.).
   */
  readonly model?: LanguageModel;
}

export interface AskAgentResult {
  readonly answer: string;
  readonly systemPrompt: string;
  readonly messages: readonly Message[];
  readonly usage: UsageInfo;
  readonly toolSteps: readonly ToolStep[];
  readonly stopReason: string | null;
}

let provider: AnthropicProvider | null = null;
function getProvider(apiKey: string): AnthropicProvider {
  if (!provider) {
    provider = createAnthropic({ apiKey });
  }
  return provider;
}

/**
 * Egy kérdés → válasz, a közös tool-use loopon keresztül.
 *
 * A két, egymást KIEGÉSZÍTŐ nyom megmarad: a JSONL-napló (`logInteraction`,
 * token usage-dzsel — a HF3 költségbecslés bizonyítékbázisa) és a kör-
 * strukturált Trace. A framework egyiket sem váltja ki.
 */
export async function askAgent(
  question: string,
  deps: AskAgentDeps = {},
): Promise<AskAgentResult> {
  const trimmed = question.trim();
  if (trimmed === '') {
    throw new Error('Üres kérdést nem lehet feltenni.');
  }

  const config = deps.config ?? loadConfig();
  const log = deps.log ?? logInteraction;
  const systemPrompt = SYSTEM_PROMPT;

  const trace = new Trace({
    question: trimmed,
    model: config.anthropicModel,
    systemPrompt,
    print: deps.print ?? true,
    persist: deps.persistTrace ?? true,
  });

  const messages: Message[] = [
    ...(deps.history ?? []),
    { role: 'user', content: trimmed },
  ];

  // A tool-futások MELLÉK-csatornája: a modell csak a `content`-et kapja vissza, a teljes
  // outcome-ot (guardolt SQL, sorszám, hiba) itt gyűjtjük toolCallId szerint, és az
  // onStepEnd-ben párosítjuk a kör tool-hívásaihoz — a Trace ÉS a JSONL-napló ebből él.
  const outcomes = new Map<
    string,
    { name: string; input: unknown; outcome: ToolOutcome }
  >();
  const report = (
    toolCallId: string,
    name: string,
    input: unknown,
    outcome: ToolOutcome,
  ): void => {
    outcomes.set(toolCallId, { name, input, outcome });
  };

  const tools: ToolSet = {
    runSql: runSqlTool(report),
    listCategories: listCategoriesTool(report),
    getClientPreferences: getClientPreferencesTool(report),
  };
  const toolNames = Object.keys(tools);

  // A JSONL-napló tool-lépései (saját kiegészítés #6). Az AI SDK nem gyűjti ezt
  // ilyen alakban, tehát mi gyűjtjük, körről körre.
  const toolSteps: ToolStep[] = [];

  const result = await generateText({
    model: deps.model ?? getProvider(config.anthropicApiKey)(config.anthropicModel),
    maxOutputTokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
    tools,
    // Régen: for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) — most deklaratívan
    // mondjuk meg, meddig mehet a loop.
    stopWhen: isStepCount(MAX_TOOL_ITERATIONS),

    // HÍVÁS ELŐTT: ezt küldjük ki — a teljes, körről körre növekvő kontextus.
    // A stepNumber 0-alapú, ezért +1 megy a Trace-nek.
    prepareStep: ({ stepNumber, messages: outgoing }) => {
      trace.request(stepNumber + 1, {
        model: config.anthropicModel,
        maxOutputTokens: MAX_TOKENS,
        system: systemPrompt,
        toolNames,
        messages: outgoing,
      });
      return {};
    },

    // HÍVÁS UTÁN: mi történt a körben — a modell szövege, tool-kérései, tool-eredményei.
    onStepEnd: (step: StepResult<ToolSet>) => {
      const turn = trace.modelTurn(trace.turnCount + 1, {
        finishReason: step.finishReason,
        text: step.text,
        toolCalls: step.toolCalls.map((call) => ({
          toolName: call.toolName,
          input: call.input,
        })),
        usage: {
          inputTokens: step.usage.inputTokens,
          outputTokens: step.usage.outputTokens,
        },
      });
      for (const toolResult of step.toolResults) {
        const record = outcomes.get(toolResult.toolCallId);
        if (!record) {
          continue;
        }
        trace.toolStep(
          turn,
          { toolName: record.name, input: record.input },
          record.outcome,
        );
        // Ugyanaz az adat a JSONL-napló ToolStep alakjában (saját kiegészítés #6).
        toolSteps.push({
          toolName: record.name,
          input: record.input,
          sql: record.outcome.summary ?? undefined,
          ok: !record.outcome.isError,
          rowCount: record.outcome.rowCount ?? undefined,
          resultSummary: record.outcome.content,
        });
      }
    },
  });

  const answer =
    result.text.trim() !== ''
      ? result.text.trim()
      : `Nem sikerült végső választ adni a megengedett lépésszámon belül (${MAX_TOOL_ITERATIONS} kör). Pontosítsd a kérdést.`;

  // ⚠️ AI SDK 7: a `result.response.messages` CSAK az utolsó kört tartalmazza.
  // A teljes beszélgetés (assistant + tool üzenetek együtt) a `responseMessages`.
  const updatedMessages: readonly Message[] = [
    ...messages,
    ...result.responseMessages,
  ];

  const usage: UsageInfo = {
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
  };

  await log({
    systemPrompt,
    messages: updatedMessages,
    answer,
    usage,
    toolSteps,
  });
  trace.finish(answer, usage);

  return {
    answer,
    systemPrompt,
    messages: updatedMessages,
    usage,
    toolSteps,
    stopReason: result.finishReason,
  };
}
