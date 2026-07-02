import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { loadConfig, type Config } from './config.js';

/**
 * A `runSql` tool egyetlen adatbázis-kapcsolati rétege: kizárólag a
 * `DATABASE_URL_READONLY` (a `szoba-kertesz_ro` szerepkör) kapcsolati
 * stringjét használja — sosem a `DATABASE_URL`-t (admin/RW, Prisma-nak
 * való). Ez a fájl az egyetlen hely a `packages/core`-ban, ahol `pg`
 * import szerepel; a Prisma-t (`@prisma/client`, `packages/db`) a core
 * réteg sosem importálja.
 *
 * A pool egyetlen, modul-szintű, lustán létrehozott példány (kicsi
 * `max`-szal) — az interaktív CLI mód sok kérdésen át egy folyamatban él,
 * kérdésenkénti újracsatlakozás pazarló lenne. Teszteléshez `deps.pool`-lal
 * (vagy `deps.config`-gal) felülírható, hogy ne kelljen valódi kapcsolat a
 * legtöbb teszthez — de legalább egy teszt (`db-readonly.spec.ts`) a valódi,
 * futó helyi adatbázis ellen fut.
 */
export interface DbReadonlyDeps {
  readonly pool?: Pool;
  readonly config?: Config;
}

let sharedPool: Pool | undefined;

function resolvePool(deps: DbReadonlyDeps): Pool {
  if (deps.pool) {
    return deps.pool;
  }

  if (!sharedPool) {
    const config = deps.config ?? loadConfig();
    sharedPool = new Pool({
      connectionString: config.databaseUrlReadonly,
      max: 5,
    });
  }

  return sharedPool;
}

/**
 * Lefuttat egy SQL-stringet a read-only kapcsolaton. Nem végez SQL-ellenőrzést
 * (SELECT-only, LIMIT stb.) — az a hívó felelőssége (`sql-guard.ts`,
 * `runsql-tool.ts`); ez a függvény kizárólag a kapcsolatkezelést végzi.
 *
 * Ha a lekérdezés módosító (INSERT/UPDATE/DELETE/DDL), maga a Postgres
 * `szoba-kertesz_ro` szerepköre utasítja el "permission denied" hibával —
 * ez a második, alkalmazás-szinttől független védelmi vonal (NFR1, lásd
 * `db-readonly.spec.ts` "double protection" tesztje).
 */
export async function queryReadonly<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  deps: DbReadonlyDeps = {},
): Promise<QueryResult<T>> {
  const pool = resolvePool(deps);
  return pool.query<T>(sql);
}

/**
 * Lezárja a megosztott pool-t (ha létrejött), és felszabadítja a
 * kapcsolatokat. Elsősorban teszteléshez / folyamat-leálláshoz kell — a CLI
 * normál futása során a pool a folyamat végéig élhet.
 */
export async function closeReadonlyPool(): Promise<void> {
  if (!sharedPool) {
    return;
  }
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
}
