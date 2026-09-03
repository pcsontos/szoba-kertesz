import {
  isStepCount,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from 'ai';
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { loadConfig, type Config } from '../config.js';
import type { ToolOutcome, ToolReporter } from '../tools/tool-outcome.js';
import { setQuiet, Trace } from '../trace.js';
import {
  logInteraction,
  type LogEntryInput,
  type ToolStep,
  type UsageInfo,
} from '../logger.js';

// agent-loop.ts — AZ agent-loop, egy helyen. MINDEN agent (query, ingest, …) EZT
// futtatja; a különbség köztük csak annyi, hogy mit adnak be:
//
//     egy agent = system prompt + toolkészlet + (közös) loop
//
// A 2–3. órán KÉZZEL írtuk meg ugyanezt (prompt → hívás → stop_reason → tool →
// tool_result → vissza) a nyers Anthropic SDK fölött — ezért pontosan tudjuk, mit
// csinál helyettünk a framework:
//   - a loopot a `streamText` pörgeti, amíg a modell toolt kér (finishReason: 'tool-calls'),
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
//
// A 05. alkalomtól `streamText` fut `generateText` helyett, EGY úton: ha nincs
// `onTextDelta`, akkor is elfogyasztjuk a streamet. A váltásnak van egy MÉRT
// csapdája (ai@7.0.66): a `streamText` NEM dobja tovább a hibát — sem szinkron,
// sem a stream fogyasztásakor. Első köri hibánál az `await result.text` az SDK
// becsomagolt üzenetével rejectel ("No output generated…"), és az eredeti ok
// elveszik; MÁSODIK köri hibánál pedig egyáltalán nem rejectel, tehát a futás
// sikeresnek LÁTSZANA, üres válasszal — és a `[MEGSZAKADT]` naplósor (saját
// kiegészítés #6) némán eltűnne. Az egyetlen hely, ahol az eredeti hiba
// látszik, az `onError`; ezért ott kapjuk el, és a stream lefutása után magunk
// döntünk. Ezt három teszt is rögzíti (`agent-loop.spec.ts`).

export type Message = ModelMessage;

/**
 * Amivel egy AGENT paraméterezi a közös loopot: a személyisége és a képességei.
 * Ez a négy-öt mező KÜLÖNBÖZTETI MEG az agenteket egymástól — minden más közös.
 */
export interface AgentDefinition {
  /** Az agent szerepe és szabályai (a system prompt). */
  readonly systemPrompt: string;
  /**
   * Az agent toolkészlete. A `report`-ot minden tool megkapja — ezen jelent a
   * Trace-nek és a JSONL-naplónak, a modell felé eső `content`-től függetlenül.
   */
  readonly buildTools: (report: ToolReporter) => ToolSet;
  /** Max hány kört mehet a loop (tool-hívásokkal együtt). */
  readonly maxSteps: number;
  /** A modell válaszának token-kerete. Nagy tool-argumentumhoz (upsert) nagyobb kell. */
  readonly maxOutputTokens: number;
  /** Ha a loop a limit miatt válasz nélkül áll meg, ezt mondjuk a felhasználónak. */
  readonly emptyAnswer: string;
  /**
   * Kényszerített tool-választás. Az ÖSSZES eddigi agent hallgatólagosan 'auto'-n fut (a
   * modell dönt, hívjon-e toolt) — ezt a mezőt EGYELŐRE csak az orchestrátor tölti ki
   * ('required'): ő SOSEM válaszolhat tool nélkül, mindig pontosan egy route-tool-t kell
   * hívnia. Alapértelmezés nélkül (undefined) a streamText saját alapértelmezése ('auto')
   * érvényesül — a meglévő agentek viselkedése ezért változatlan.
   */
  readonly toolChoice?: 'auto' | 'none' | 'required';
}

export interface AskOptions {
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
   * `AskResult.messages`-t kell visszaadni a következő híváshoz.
   */
  readonly history?: readonly Message[];
  /**
   * Teszt-szeam: kész modell (pl. `MockLanguageModelV4` az `ai/test`-ből) a
   * valódi Anthropic-provider helyett. A kézi loop `deps.client`-jének utódja.
   * A `deps.dbPool` viszont MEGSZŰNT: a tool-factory-k a produkciós utat kötik
   * be, a DB-injektálást a tool-szintű specek fedik (`run-sql-tool.spec.ts` stb.).
   */
  readonly model?: LanguageModel;
  /**
   * Tokenenkénti kimenet: minden szöveg-darabot AZONNAL megkap, ahogy a modelltől
   * megérkezik. A szerver ezt írja ki `res.write()`-tal, a böngésző így látja
   * szavanként épülni a választ. Megadása nélkül a viselkedés változatlan
   * (a stream akkor is lefut, csak nem jelentünk róla).
   */
  readonly onTextDelta?: (delta: string) => void;
  /**
   * ÜZENET-csatorna: a hívó megkapja a `streamText` eredményét, és abból az AI SDK
   * üzenet-streamjét (text ÉS tool-részek) továbbíthatja — ettől tud a böngésző
   * kártyát rajzolni a tool-eredményből (lásd apps/server/src/app.ts).
   *
   * Ha meg van adva, a stream FOGYASZTÁSA a hívó dolga: mi nem hívunk
   * `consumeStream()`-et, csak megvárjuk a stream végét. A Trace és a JSONL-napló
   * ettől függetlenül fut — a `prepareStep` / `onStepEnd` hookokat az SDK hívja,
   * ahogy az `onChunk`-ot (és rajta az `onTextDelta`-t) is.
   */
  readonly onStream?: (result: ReturnType<typeof streamText>) => void;
}

export interface AskResult {
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
 * Egy kérdés → válasz, a KÖZÖS tool-use loopon keresztül, tetszőleges agenttel.
 *
 * A loop nem tudja, MELYIK agentet futtatja, és nem tudja, milyen toolok
 * léteznek — csak azt, hogy minden tool ugyanazt a `ToolOutcome` alakot jelenti
 * vissza a `report` mellék-csatornán. Ettől tud a Trace és a napló BÁRMILYEN
 * agentet egyformán megmutatni.
 *
 * A két, egymást KIEGÉSZÍTŐ nyom megmarad: a JSONL-napló (`logInteraction`,
 * token usage-dzsel — a HF3 költségbecslés bizonyítékbázisa) és a kör-
 * strukturált Trace. A framework egyiket sem váltja ki.
 */
export async function runAgentLoop(
  question: string,
  agent: AgentDefinition,
  options: AskOptions = {},
): Promise<AskResult> {
  const trimmed = question.trim();
  if (trimmed === '') {
    throw new Error('Üres kérdést nem lehet feltenni.');
  }

  const config = options.config ?? loadConfig();
  const log = options.log ?? logInteraction;
  const systemPrompt = agent.systemPrompt;

  const print = options.print ?? true;
  // A `traceLog` MODUL-SZINTŰ (a Trace `print`-je csak per-példány), és a RAG-nyomot
  // a retrieve.ts azon keresztül írja. `--quiet` alatt tehát a konzolra ömlött volna,
  // pedig a `--quiet` szerződése a néma konzol. A watch-log ettől függetlenül megtelik.
  setQuiet(!print);

  const trace = new Trace({
    question: trimmed,
    model: config.anthropicModel,
    systemPrompt,
    print,
    persist: options.persistTrace ?? true,
  });

  const messages: Message[] = [
    ...(options.history ?? []),
    { role: 'user', content: trimmed },
  ];

  // A tool-futások MELLÉK-csatornája: a modell csak a `content`-et kapja vissza, a teljes
  // outcome-ot (guardolt SQL, sorszám, hiba) itt gyűjtjük toolCallId szerint, és az
  // onStepEnd-ben párosítjuk a kör tool-hívásaihoz — a Trace ÉS a JSONL-napló ebből él.
  const outcomes = new Map<
    string,
    { name: string; input: unknown; outcome: ToolOutcome }
  >();
  const report: ToolReporter = (toolCallId, name, input, outcome): void => {
    outcomes.set(toolCallId, { name, input, outcome });
  };

  // A toolkészletet az AGENT adja — a loop csak megkapja és felkínálja a modellnek.
  const tools = agent.buildTools(report);
  const toolNames = Object.keys(tools);

  // A JSONL-napló tool-lépései (saját kiegészítés #6). Az AI SDK nem gyűjti ezt
  // ilyen alakban, tehát mi gyűjtjük, körről körre.
  const toolSteps: ToolStep[] = [];

  // Körönként összegzett token-fogyás. A `result.usage` CSAK sikeres futásnál
  // létezik — egy megszakadt futás (rate limit, API-hiba, tool-kivétel) tokenjei
  // viszont ugyanúgy elmentek, és a JSONL a költségbecslés bizonyítékbázisa.
  // Ezért párhuzamosan mi is számoljuk, hogy a hibaágon legyen mit naplózni.
  let spentInput = 0;
  let spentOutput = 0;

  // A megszakadt futás közös lezárása: napló + Trace, majd az EREDETI hiba tovább.
  // (Saját kiegészítés #6: az elköltött tokeneknek nyoma kell maradjon.)
  const finishInterrupted = async (error: unknown): Promise<never> => {
    const message = error instanceof Error ? error.message : String(error);
    const interrupted = `[MEGSZAKADT] ${message}`;
    const partial: UsageInfo = {
      inputTokens: spentInput,
      outputTokens: spentOutput,
    };
    // A naplózás saját hibáját ITT elnyeljük: az eredeti hibát nem maszkolhatja
    // egy naplózási gond, és a Trace-nek is le kell zárulnia.
    await log({
      systemPrompt,
      messages,
      answer: interrupted,
      usage: partial,
      toolSteps,
    }).catch(() => undefined);
    trace.finish(interrupted, partial);
    throw error;
  };

  // ⚠️ MÉRT TÉNY (ai@7.0.66): a streamText NEM dobja tovább a hibát — sem
  // szinkron, sem a stream fogyasztásakor. Az EGYETLEN hely, ahol az eredeti
  // hiba látszik, az onError. Ezért itt elkapjuk, és a stream lefutása után
  // MAGUNK döntünk. Enélkül egy második körben elhasalt futás sikeresnek
  // látszana, üres válasszal — és a [MEGSZAKADT] naplósor némán eltűnne.
  let streamError: unknown = null;

  let result: ReturnType<typeof streamText>;
  try {
    result = streamText({
      model:
        options.model ??
        getProvider(config.anthropicApiKey)(config.anthropicModel),
      maxOutputTokens: agent.maxOutputTokens,
      system: systemPrompt,
      messages,
      tools,
      toolChoice: agent.toolChoice,
      // Régen: for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) — most deklaratívan
      // mondjuk meg, meddig mehet a loop. A limit is az AGENTÉ.
      stopWhen: isStepCount(agent.maxSteps),

      // HÍVÁS ELŐTT: ezt küldjük ki — a teljes, körről körre növekvő kontextus.
      // A stepNumber 0-alapú, ezért +1 megy a Trace-nek.
      prepareStep: ({ stepNumber, messages: outgoing }) => {
        trace.request(stepNumber + 1, {
          model: config.anthropicModel,
          maxOutputTokens: agent.maxOutputTokens,
          system: systemPrompt,
          toolNames,
          messages: outgoing,
        });
        return {};
      },

      // HÍVÁS UTÁN: mi történt a körben — a modell szövege, tool-kérései, tool-eredményei.
      // A step alakja ugyanaz streamText alatt: lapos finishReason, lapos usage-számok.
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
        // Amint egy kör lezárult, a tokenjei már elmentek — ide könyveljük, hogy
        // egy későbbi körben bekövetkező hiba után is tudjunk róluk számot adni.
        spentInput += step.usage.inputTokens ?? 0;
        spentOutput += step.usage.outputTokens ?? 0;
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
            sql: record.outcome.sql ?? undefined,
            ok: !record.outcome.isError,
            rowCount: record.outcome.rowCount ?? undefined,
            resultSummary: record.outcome.content,
          });
        }
      },

      // A tokenenkénti kimenet. A chunk mezője itt `text` — provider-szinten
      // ugyanez `delta` (ezért néz ki másképp a mock és a hook).
      onChunk: ({ chunk }) => {
        if (chunk.type === 'text-delta') {
          options.onTextDelta?.(chunk.text);
        }
      },

      onError: ({ error }) => {
        streamError ??= error;
      },
    });

    if (options.onStream) {
      // A hívó fogyasztja a streamet (ő továbbítja a böngészőnek). MEGVÁRJUK a végét:
      // az onError-ban elkapott hiba és a körök usage-e csak azután van a helyén.
      options.onStream(result);
      await result.finishReason;
    } else {
      // A streamet EL KELL fogyasztani — ez pörgeti a loopot körről körre.
      await result.consumeStream();
    }
  } catch (error: unknown) {
    return finishInterrupted(streamError ?? error);
  }

  if (streamError !== null) {
    return finishInterrupted(streamError);
  }

  const text = await result.text;
  const answer = text.trim() !== '' ? text.trim() : agent.emptyAnswer;

  // ⚠️ AI SDK 7: a `result.response.messages` CSAK az utolsó kört tartalmazza.
  // A teljes beszélgetés (assistant + tool üzenetek együtt) a `responseMessages`
  // — streamText alatt PromiseLike, ezért az await nem elhagyható.
  const updatedMessages: readonly Message[] = [
    ...messages,
    ...(await result.responseMessages),
  ];

  const totals = await result.usage;
  const usage: UsageInfo = {
    inputTokens: totals.inputTokens ?? 0,
    outputTokens: totals.outputTokens ?? 0,
  };

  // A két nyom FÜGGETLEN: ha a JSONL-írás elhasal, a Trace-nek attól még le kell
  // zárulnia (és fordítva) — egyik sem váltja ki a másikat.
  try {
    await log({
      systemPrompt,
      messages: updatedMessages,
      answer,
      usage,
      toolSteps,
    });
  } finally {
    trace.finish(answer, usage);
  }

  return {
    answer,
    systemPrompt,
    messages: updatedMessages,
    usage,
    toolSteps,
    stopReason: await result.finishReason,
  };
}
