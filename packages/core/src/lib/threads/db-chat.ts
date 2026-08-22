import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { loadConfig, type Config } from '../config.js';

/**
 * A beszélgetés-tár EGYETLEN adatbázis-kapcsolati rétege: kizárólag a
 * `DATABASE_URL_CHAT` (a `szoba-kertesz_chat` szerep) kapcsolati stringjét
 * használja. A `db-readonly.ts` és a `db-readwrite.ts` mintája, harmadszor.
 *
 * MIÉRT EGY POOL, ÉS NEM KETTŐ (mint a rag/knowledge-store.ts-ben)? Mert ott az
 * olvasás és az írás KÉT bizalmi szint (a keresést a nyilvános szerver hívja, a
 * betöltést csak a szkript). Itt mindkettő ugyanaz a szint: a beszélgetést az
 * olvassa, aki írja is.
 */
export interface DbChatDeps {
  readonly pool?: Pool;
  readonly config?: Config;
}

let sharedPool: Pool | undefined;

function resolvePool(deps: DbChatDeps): Pool {
  if (deps.pool) {
    return deps.pool;
  }

  if (!sharedPool) {
    const config = deps.config ?? loadConfig();
    if (!config.databaseUrlChat) {
      throw new Error(
        'Hiányzó DATABASE_URL_CHAT — a beszélgetés mentése ezen a kapcsolaton megy ' +
          '(szoba-kertesz_chat szerep). Vedd fel a .env fájlba; az egylövetű ' +
          '`pnpm cli ask` enélkül is működik.',
      );
    }
    sharedPool = new Pool({
      connectionString: config.databaseUrlChat,
      max: 5,
    });
  }

  return sharedPool;
}

/** Lefuttat egy paraméterezett SQL-t a chat-kapcsolaton. */
export async function queryChat<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
  deps: DbChatDeps = {},
): Promise<QueryResult<T>> {
  const pool = resolvePool(deps);
  return pool.query<T>(sql, values);
}

/** Lezárja a megosztott pool-t (folyamat-leállításhoz és tesztekhez). */
export async function closeChatPool(): Promise<void> {
  if (!sharedPool) {
    return;
  }
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
}
