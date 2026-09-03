import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { loadConfig, type Config } from '../../config.js';

/**
 * A csomag-építés EGYETLEN adatbázis-kapcsolati rétege: kizárólag a DATABASE_URL_PACKAGE
 * (a szoba-kertesz_package szerep) kapcsolati stringjét használja. A db-chat.ts és a
 * db-readwrite.ts mintája, negyedszer.
 *
 * A tranzakció-helper (withPackageTransaction) ÚJ ebben a fájlban: a savePackage KÉT táblába
 * ír (packages + package_items), és ha az items-INSERT elhasal, a package-sor sem maradhat
 * árva — az upsertProduct egyetlen ON CONFLICT-os statementje itt nem elég, mert két
 * KÜLÖNBÖZŐ táblát érint.
 */
export interface DbPackageDeps {
  readonly pool?: Pool;
  readonly config?: Config;
}

let sharedPool: Pool | undefined;

function resolvePool(deps: DbPackageDeps): Pool {
  if (deps.pool) {
    return deps.pool;
  }
  if (!sharedPool) {
    const config = deps.config ?? loadConfig();
    if (!config.databaseUrlPackage) {
      throw new Error(
        'Hiányzó DATABASE_URL_PACKAGE — a csomag-építés ezen a kapcsolaton megy ' +
          '(szoba-kertesz_package szerep). Vedd fel a .env fájlba; a katalógus- és ' +
          'gondozási kérdések enélkül is működnek.',
      );
    }
    sharedPool = new Pool({
      connectionString: config.databaseUrlPackage,
      max: 4,
    });
  }
  return sharedPool;
}

/** Paraméterezett lekérdezés a csomag-kapcsolaton. String-konkatenáció SOHA. */
export async function queryPackage<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
  deps: DbPackageDeps = {},
): Promise<QueryResult<T>> {
  return resolvePool(deps).query<T>(sql, values);
}

/**
 * BEGIN → run(client) → COMMIT, hiba esetén ROLLBACK. A savePackage ezt hívja: a
 * packages-sor és a package_items-sorok EGYÜTT kerülnek be, vagy egyik sem.
 */
export async function withPackageTransaction<T>(
  run: (client: PoolClient) => Promise<T>,
  deps: DbPackageDeps = {},
): Promise<T> {
  const client = await resolvePool(deps).connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Lezárja a megosztott pool-t (folyamat-leállításhoz és tesztekhez). */
export async function closePackagePool(): Promise<void> {
  if (!sharedPool) {
    return;
  }
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
}
