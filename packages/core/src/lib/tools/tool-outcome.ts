/**
 * A KÖZÖS tool-eredmény alak. Minden tool `execute`-ja ezt adja vissza, és SOHA
 * nem dob: a hiba is a modellnek visszaadható magyar szöveg (`isError: true`).
 * Ettől tud a loop és a Trace BÁRMILYEN toolt egyformán kezelni — az agent-loop
 * nem tudja, milyen toolok léteznek.
 *
 * Ez az alak a `tools/index.ts` régi `ToolOutcome`-ja MELLETT él a 04. alkalom
 * Task 5-éig: a régi (`ok`/`sql`/`rowCount`/`resultSummary`) a JSONL-logger
 * `ToolStep` szerződését szolgálja ki, ez pedig a Trace-ét és a loopét. A
 * `tools/index.ts` a Task 5-ben tűnik el, és vele a régi alak is.
 */

export interface ToolOutcome {
  /** Amit a modell visszakap (a tool_result tartalma). EZ a közös lényeg. */
  readonly content: string;
  readonly isError: boolean;
  /** Egysoros humán összegzés a Trace-nek (pl. a guardolt SQL, vagy "UPSERT (created)"). */
  readonly summary: string | null;
  /** Érintett sorok/találatok száma a Trace-nek (ha értelmezhető). */
  readonly rowCount: number | null;
}

/**
 * A tool ezzel jelenti a futását a Trace-nek. A modell CSAK a `content`-et
 * látja; a Trace viszont a teljes outcome-ot megkapja — ez a mellék-csatorna
 * teszi lehetővé, hogy a guardolt SQL és a sorszám a nyomban is megjelenjen.
 */
export type ToolReporter = (
  toolCallId: string,
  name: string,
  input: unknown,
  outcome: ToolOutcome,
) => void;
