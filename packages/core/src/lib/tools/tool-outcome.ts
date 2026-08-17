/**
 * A KÖZÖS tool-eredmény alak. Minden tool `execute`-ja ezt adja vissza, és SOHA
 * nem dob: a hiba is a modellnek visszaadható magyar szöveg (`isError: true`).
 * Ettől tud a loop és a Trace BÁRMILYEN toolt egyformán kezelni — az agent-loop
 * nem tudja, milyen toolok léteznek.
 *
 * A 04. alkalomig egy központi `tools/index.ts` dispatch adta a tool-eredményt
 * a JSONL-logger alakjában (`ok`/`sql`/`rowCount`/`resultSummary`). Az a fájl
 * megszűnt: a toolkészletét mostantól minden agent maga állítja össze, és ez az
 * EGY alak szolgálja ki mind a hármat — a modellt (`content`), a Trace-t
 * (`summary`/`rowCount`) és a naplót. A loopban történik a `ToolStep`-re
 * képezés, egy helyen.
 */

export interface ToolOutcome {
  /** Amit a modell visszakap (a tool_result tartalma). EZ a közös lényeg. */
  readonly content: string;
  readonly isError: boolean;
  /** Egysoros humán összegzés a Trace-nek (pl. a guardolt SQL, vagy "UPSERT (created)"). */
  readonly summary: string | null;
  /**
   * A ténylegesen lefuttatott SQL — és KIZÁRÓLAG az. Csak az SQL-t generáló tool
   * (`runSql`) tölti ki a guardolt lekérdezéssel; minden más tool `null`-t ad.
   *
   * Miért külön mező, ha van `summary`? Mert a kettő két különböző kérdésre
   * válaszol. A `summary` humán, tool-függő egysoros a Trace-nek ("8 kategória",
   * "UPSERT products (created) · …"), az `sql` pedig gépi bizonyíték a
   * JSONL-naplóba (`ToolStep.sql`), amiből a lefuttatott lekérdezés
   * visszakövethető. Amíg a kettő egy mező volt, a nem-SQL toolok összegzése
   * folyt a napló `sql` mezőjébe ("sql": "8 kategória"), a Trace pedig a
   * bemenet `query` mezőjéből szimatolta ki, SQL-es tool-e — mindkettő itt,
   * a forrásnál szűnik meg.
   */
  readonly sql: string | null;
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
