/**
 * A modell felé eső tool-felület: MILYEN toolok vannak, és hogyan futtatjuk
 * őket. Egyetlen hely, ami ezt megmondja — új tool hozzáadása = új fájl
 * ebben a mappában + felvétel a `tools` tömbbe és az `executeTool`
 * dispatchbe. Az agent-loop maga nem változik tőle.
 *
 * A kimenet alakja (`ToolOutcome`) SZÁNDÉKOSAN a JSONL-logger `ToolStep`
 * szerződését szolgálja ki (`sql`, `rowCount`, `resultSummary`), nem a
 * kurzus `{ content, isError }` alakját: a saját naplózásunk így a refaktor
 * után is pontosan azt rögzíti, amit a modell ténylegesen "látott".
 *
 * A `deps` opcionális harmadik paraméter a tesztinjektálást tartja életben
 * (`DbReadonlyDeps`); elhagyva a hívási alak azonos a kurzuséval.
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { DbReadonlyDeps } from './db-readonly.js';
import {
  executeRunSqlTool,
  runSqlToolDefinition,
  RUN_SQL_TOOL_NAME,
} from './run-sql.js';
import {
  executeListCategoriesTool,
  listCategoriesToolDefinition,
  LIST_CATEGORIES_TOOL_NAME,
} from './list-categories.js';

/** A modellnek felkínált tool-definíciók, egy helyen. */
export const tools: Anthropic.Tool[] = [
  runSqlToolDefinition,
  listCategoriesToolDefinition,
];

/**
 * Egyetlen tool-futás kimenetele, tool-típustól függetlenül — a loop és a
 * naplózás ezt az egy alakot kezeli.
 */
export interface ToolOutcome {
  readonly ok: boolean;
  readonly sql?: string;
  readonly rowCount?: number;
  readonly resultSummary: string;
}

/**
 * A modell egy toolt kért (name + input) → lefuttatjuk.
 *
 * Ismeretlen toolra NEM dobunk kivételt, hanem hibaszöveget adunk vissza a
 * modellnek: így tud hibából tanulni és újrapróbálkozni ahelyett, hogy a
 * folyamat elszállna.
 */
export async function executeTool(
  name: string,
  input: unknown,
  deps: DbReadonlyDeps = {},
): Promise<ToolOutcome> {
  if (name === RUN_SQL_TOOL_NAME) {
    const result = await executeRunSqlTool(input, deps);
    return {
      ok: result.ok,
      sql: result.sql,
      rowCount: result.ok ? result.rowCount : undefined,
      resultSummary: result.ok ? JSON.stringify(result.rows) : result.error,
    };
  }

  if (name === LIST_CATEGORIES_TOOL_NAME) {
    const result = await executeListCategoriesTool(input, deps);
    return {
      ok: result.ok,
      rowCount: result.ok ? result.categories.length : undefined,
      resultSummary: result.ok
        ? JSON.stringify(result.categories)
        : result.error,
    };
  }

  return { ok: false, resultSummary: `Ismeretlen tool: "${name}".` };
}
