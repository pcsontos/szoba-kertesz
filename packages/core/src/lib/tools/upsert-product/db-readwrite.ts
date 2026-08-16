import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { loadConfig, type Config } from '../../config.js';

/**
 * READ-WRITE adatkapcsolat az INGEST-agent upsertProduct-jához. KÜLÖN a query-agent
 * read-only kapcsolatától (`../run-sql/db-readonly.ts`), és KÜLÖN a Prisma admin
 * kapcsolatától: a `szoba-kertesz_rw` szerep SELECT/INSERT/UPDATE-et tud a products
 * táblán — DELETE-et és DDL-t NEM. Ez a harmadik jogosultsági szint; a három
 * útvonal fizikailag nem keveredik, és a query-agent nem is látja ezt a fájlt.
 *
 * A határokat nem a prompt őrzi, hanem a Postgres szerepkör — a `db-readwrite.spec.ts`
 * valódi adatbázison bizonyítja, hogy a DELETE és az ALTER tényleg elhasal.
 */
export interface DbReadWriteDeps {
  readonly pool?: Pool;
  readonly config?: Config;
}

const STATEMENT_TIMEOUT_MS = 5000;

let sharedPool: Pool | undefined;

function resolvePool(deps: DbReadWriteDeps): Pool {
  if (deps.pool) {
    return deps.pool;
  }
  if (!sharedPool) {
    const config = deps.config ?? loadConfig();
    if (!config.databaseUrlReadWrite) {
      throw new Error(
        'Hiányzó DATABASE_URL_READWRITE. Az ingest-agent íráshoz ezt igényli — ' +
          'vedd fel a .env-be (a szoba-kertesz_rw szerep kapcsolati stringje).',
      );
    }
    sharedPool = new Pool({
      connectionString: config.databaseUrlReadWrite,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      application_name: 'szoba-kertesz-agent-ingest',
      max: 4,
    });
  }
  return sharedPool;
}

/** Paraméterezett lekérdezés a read-write kapcsolaton. String-konkatenáció SOHA. */
export async function queryReadWrite<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
  deps: DbReadWriteDeps = {},
): Promise<QueryResult<T>> {
  return resolvePool(deps).query<T>(sql, [...params]);
}

/** Lezárja a megosztott pool-t (a CLI a futás végén hívja). */
export async function closeReadWritePool(): Promise<void> {
  if (!sharedPool) {
    return;
  }
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
}
