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
import type { DbReadonlyDeps } from './db-readonly.js';
import { executeRunSqlTool, RUN_SQL_TOOL_NAME } from './run-sql.js';
import {
  executeListCategoriesTool,
  LIST_CATEGORIES_TOOL_NAME,
} from './list-categories.js';
import {
  executeGetClientPreferencesTool,
  GET_CLIENT_PREFERENCES_TOOL_NAME,
} from './client-preferences.js';

// A 04. alkalom óta a modell felé eső tool-listát NEM ez a fájl adja: az AI SDK
// tool-factory-i (`runSqlTool`, `listCategoriesTool`, `getClientPreferencesTool`)
// szolgáltatják a sémát, és az agent maga állítja össze a toolkészletét. Az
// egykori `tools: Anthropic.Tool[]` tömb ezzel halott kóddá vált, ezért törölve —
// vele az utolsó `@anthropic-ai/sdk` import is kikerült a forrásból.
//
// Ami maradt: az `executeTool` dispatch, amit a regressziós manifeszt hajt meg.
// Ez a fájl a Task 5-ben tűnik el, amikor minden agent maga mondja meg a toolkészletét.

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

  if (name === GET_CLIENT_PREFERENCES_TOOL_NAME) {
    const result = await executeGetClientPreferencesTool(input);
    return {
      ok: result.ok,
      resultSummary: result.ok
        ? JSON.stringify(result.preference)
        : result.error,
    };
  }

  return { ok: false, resultSummary: `Ismeretlen tool: "${name}".` };
}
