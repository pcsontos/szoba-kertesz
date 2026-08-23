import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { closeReadonlyPool, queryReadonly } from './db-readonly.js';

// A valódi-DB tesztekhez (lásd lent) a repo gyökerén lévő .env-et kell
// betölteni — a vitest cwd-je `packages/core`, nem a repo gyökér, úgyhogy a
// CLI belépési pontjában (`apps/cli/src/main.ts`) használt mintát követve,
// explicit útvonallal töltjük be, ENOENT-toleránsan.
const here = dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = resolve(here, '../../../../../../.env');
try {
  process.loadEnvFile(repoRootEnvPath);
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

describe('queryReadonly (injected pool, no real connection)', () => {
  afterEach(async () => {
    await closeReadonlyPool();
  });

  it('delegates to the injected pool instead of creating a real one', async () => {
    const fakeRows = [{ id: 1, name: 'Pozsgás' }];
    const fakePool = {
      query: vi.fn().mockResolvedValue({ rows: fakeRows, rowCount: 1 }),
    } as unknown as Pool;

    const result = await queryReadonly(
      'SELECT id, name FROM products LIMIT 1',
      {
        pool: fakePool,
      },
    );

    expect(fakePool.query).toHaveBeenCalledWith(
      'SELECT id, name FROM products LIMIT 1',
    );
    expect(result.rows).toEqual(fakeRows);
    expect(result.rowCount).toEqual(1);
  });

  it('propagates errors from the injected pool without swallowing them', async () => {
    const fakePool = {
      query: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as unknown as Pool;

    await expect(queryReadonly('SELECT 1', { pool: fakePool })).rejects.toThrow(
      'connection refused',
    );
  });
});

describe('queryReadonly (real local DB — DATABASE_URL_READONLY)', () => {
  afterAll(async () => {
    await closeReadonlyPool();
  });

  it('selects real seeded rows from products through the read-only role', async () => {
    const result = await queryReadonly(
      'SELECT id, name, category FROM products LIMIT 5',
    );

    expect(result.rows.length).toBeGreaterThan(0);
    expect(result.rows.length).toBeLessThanOrEqual(5);
    const [row] = result.rows;
    expect(row).toHaveProperty('id');
    expect(row).toHaveProperty('name');
    expect(row).toHaveProperty('category');
  });

  it('reuses the lazily-created shared pool across repeated calls', async () => {
    const first = await queryReadonly(
      'SELECT count(*)::int AS total FROM products',
    );
    const second = await queryReadonly(
      'SELECT count(*)::int AS total FROM products',
    );

    expect(first.rows[0]).toEqual(second.rows[0]);
    expect((first.rows[0] as { total: number }).total).toBeGreaterThan(0);
  });

  // NFR1 "kettős védelem" — ez a teszt SZÁNDÉKOSAN megkerüli a
  // sql-guard.ts alkalmazás-szintű védelmét, és közvetlenül a valódi
  // DATABASE_URL_READONLY kapcsolaton próbál írni. A várt eredmény: maga a
  // Postgres (a szoba-kertesz_ro szerepkör SELECT-only jogosultsága miatt)
  // utasítja el "permission denied" hibával — ez bizonyítja, hogy a
  // DB-szintű védelem a sql-guard.ts-től FÜGGETLENÜL is önmagában megáll.
  it('double protection (NFR1): a write attempt is rejected by Postgres itself, bypassing the app-level guard', async () => {
    await expect(
      queryReadonly('UPDATE products SET stock = 0'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('double protection (NFR1): DELETE is also rejected by Postgres itself, and the row count is unchanged', async () => {
    const before = await queryReadonly(
      'SELECT count(*)::int AS total FROM products',
    );

    await expect(queryReadonly('DELETE FROM products')).rejects.toThrow(
      /permission denied/i,
    );

    const after = await queryReadonly(
      'SELECT count(*)::int AS total FROM products',
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });

  it('a beszélgetéseket NEM látja — a messages a _ro elől REVOKE-olva van', async () => {
    // Ez a Task 6 legfontosabb állítása: az ALTER DEFAULT PRIVILEGES magától
    // odaadta volna a SELECT-et, és akkor a runSql kiolvashatná a chateket.
    await expect(
      queryReadonly('SELECT id FROM messages LIMIT 1'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('a paraméteres hívás VALÓBAN átadja az értékeket a poolnak', async () => {
    // A #8 PR-review 8. tétele: a kétargumentumos (values) ág eddig CSAK valódi DB-vel
    // futott (query-customers-tool.spec.ts), tehát a DB nélküli CI-ban egyáltalán nem.
    // Ez a teszt injektált poollal méri, hogy a `values` tömb tényleg a `pool.query`
    // második argumentumaként megy át — mock nélkül ezt semmi nem őrizte.
    const calls: { sql: string; values?: unknown[] }[] = [];
    const fakePool = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return { rows: [], rowCount: 0 };
      },
    } as unknown as Pool;

    await queryReadonly('SELECT $1::int AS x', [42], { pool: fakePool });
    await queryReadonly('SELECT 1', { pool: fakePool });

    expect(calls[0]).toEqual({ sql: 'SELECT $1::int AS x', values: [42] });
    // Paraméter nélkül EGYARGUMENTUMOS hívás marad — a meglévő szerződés része.
    expect(calls[1]).toEqual({ sql: 'SELECT 1', values: undefined });
  });

  it('ENGEDÉLYLISTA: a _ro pontosan három táblát lát, se többet, se kevesebbet', async () => {
    // A #8 PR-review 5. tétele. Amíg a `<ts>_db_roles` migráció
    // `ALTER DEFAULT PRIVILEGES … GRANT SELECT ON TABLES` sora élt, MINDEN új tábla
    // automatikusan olvasható lett a runSql-lel — a threads/messages REVOKE tehát
    // egyszeri javítás volt, nem szabály. A `<ts>_ro_explicit_grants` migráció óta a
    // default privilege vissza van véve, és a három katalógus-tábla EXPLICIT grantot
    // kapott. Ez a teszt a detektív-kontroll: ha egy új tábla olvashatóvá válik (vagy
    // egy meglévő elveszti a jogát), itt bukik el — nem élesben derül ki.
    const result = await queryReadonly<{ tabla: string; olvashato: boolean }>(
      `SELECT c.relname AS tabla, has_table_privilege(c.oid, 'SELECT') AS olvashato
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r'
        ORDER BY 1`,
    );

    const olvashato = result.rows
      .filter((row) => row.olvashato)
      .map((row) => row.tabla);

    expect(olvashato).toEqual(['customers', 'knowledge_chunks', 'products']);
  });

  it('a threads táblát SEM látja — a migráció MINDKETTŐT visszaveszi', async () => {
    // A #8 PR review 6. tétele: eddig csak a `messages` volt pinnelve, pedig a
    // <ts>_chat_role migráció a `threads`-et is REVOKE-olja. Egy sor, de enélkül a
    // beszélgetés-címek (az első kérdés szövege!) csendben kiolvashatóvá válhatnának.
    await expect(
      queryReadonly('SELECT id FROM threads LIMIT 1'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('az ügyfeleket viszont LÁTJA — az üzleti adat, nem beszélgetés', async () => {
    const result = await queryReadonly<{ count: string }>(
      'SELECT count(*)::text AS count FROM customers',
    );

    expect(Number(result.rows[0].count)).toBeGreaterThan(0);
  });
});
