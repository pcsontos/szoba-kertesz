import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { loadConfig, type Config } from '../../config.js';

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
// VALÓDI overloadok, nem csak futásidejű elágazás (a #8 PR-review 8. tétele): így a
// TÍPUS mondja meg, mit lehet hívni, nem a kommentár. A megvalósítás szignatúrája
// (lentebb) nem látszik a hívóknak.
export async function queryReadonly<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  deps?: DbReadonlyDeps,
): Promise<QueryResult<T>>;
export async function queryReadonly<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[],
  deps?: DbReadonlyDeps,
): Promise<QueryResult<T>>;
export async function queryReadonly<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  // A tömb SZÁNDÉKOSAN mutable (nem `readonly`): az `Array.isArray` egy readonly
  // tömböt tartalmazó unióban nem szűkít, és a hívó oldalon cast kellene helyette.
  valuesOrDeps: unknown[] | DbReadonlyDeps = [],
  maybeDeps: DbReadonlyDeps = {},
): Promise<QueryResult<T>> {
  // KÉT hívási alak, hogy a meglévő `queryReadonly(sql, deps)` hívók (runSql,
  // listCategories) VÁLTOZATLANUL működjenek: ha a második argumentum tömb, az a
  // paraméter-lista; ha objektum, az a deps. A queryCustomers az elsőt használja —
  // ott a modell adja a szűrők ÉRTÉKÉT, tehát paraméterezni KELL.
  const values = Array.isArray(valuesOrDeps) ? valuesOrDeps : [];
  const deps = Array.isArray(valuesOrDeps) ? maybeDeps : valuesOrDeps;
  const pool = resolvePool(deps);
  // Paraméter nélkül EGYARGUMENTUMOS hívás marad. A `pool.query(sql, [])` a pg-nek
  // ugyanaz, de a meglévő specek a hívás ALAKJÁRA is állítanak — és az a szerződés
  // nem ennek a Tasknak a hatásköre.
  return values.length > 0 ? pool.query<T>(sql, values) : pool.query<T>(sql);
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
