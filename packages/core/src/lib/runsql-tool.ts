import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { guardSql } from './sql-guard.js';
import { queryReadonly, type DbReadonlyDeps } from './db-readonly.js';

export const RUN_SQL_TOOL_NAME = 'runSql';

/**
 * A modelltől visszakapott tool-input `unknown` — nem bízunk benne, Zod-dal
 * validáljuk, mielőtt bármit kezdenénk vele (konvenció: `unknown` a nem
 * megbízható bemenetre, sosem `any`).
 */
const RunSqlInputSchema = z.object({
  query: z.string().min(1, 'Az SQL lekérdezés nem lehet üres.'),
});

/**
 * A `runSql` tool Anthropic-kompatibilis definíciója — ez kerül a
 * `messages.create` hívás `tools` tömbjébe. A leírás szándékosan tükrözi a
 * `docs/system-prompt.md` `<tools>` szekcióját.
 */
export const runSqlToolDefinition: Anthropic.Tool = {
  name: RUN_SQL_TOOL_NAME,
  description:
    'Read-only SQL lekérdezés futtatása a products növénykatalógus-táblán. ' +
    'Csak SELECT engedélyezett — a generált SQL-t mindig ezzel a tool-lal kell ' +
    'lefuttatni, sosem csak kiírni. A visszaadott sorokat használd a válaszhoz.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description:
          'Egyetlen SELECT SQL utasítás a products táblán (LIMIT-tel).',
      },
    },
    required: ['query'],
  },
};

export interface RunSqlToolSuccess {
  readonly ok: true;
  readonly sql: string;
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
}

export interface RunSqlToolFailure {
  readonly ok: false;
  readonly sql?: string;
  readonly error: string;
}

export type RunSqlToolResult = RunSqlToolSuccess | RunSqlToolFailure;

/**
 * Végrehajtja a `runSql` tool-hívást: Zod-dal validálja a nyers (`unknown`)
 * bemenetet, átengedi a SELECT-only guardon (`sql-guard.ts`), majd — ha a
 * guard engedélyezte — lefuttatja a read-only kapcsolaton
 * (`db-readonly.ts`).
 *
 * Szándékosan SOSEM dob: érvénytelen bemenet, guard-elutasítás vagy
 * adatbázis-/SQL-hiba esetén is egy `{ ok: false, error }` eredményt ad
 * vissza, amit a hívó (`agent.ts`) `tool_result`-ként (`is_error: true`)
 * küld vissza a modellnek — így a modell reagálhat rá természetes nyelven
 * (pl. elnézést kér, újrapróbálja), a teljes `askAgent` hívás nem szakad
 * meg egy rossz SQL vagy egy elutasított módosítási kísérlet miatt.
 */
export async function executeRunSqlTool(
  input: unknown,
  deps: DbReadonlyDeps = {},
): Promise<RunSqlToolResult> {
  const parsedInput = RunSqlInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: `Érvénytelen runSql bemenet: ${parsedInput.error.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    };
  }

  const guard = guardSql(parsedInput.data.query);
  if (!guard.allowed) {
    return { ok: false, sql: parsedInput.data.query, error: guard.reason };
  }

  try {
    const result = await queryReadonly(guard.sql, deps);
    return {
      ok: true,
      sql: guard.sql,
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
    };
  } catch (error) {
    return {
      ok: false,
      sql: guard.sql,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
