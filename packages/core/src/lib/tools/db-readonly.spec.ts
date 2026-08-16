import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { closeReadonlyPool, queryReadonly } from './db-readonly.js';

// A valódi-DB tesztekhez (lásd lent) a repo gyökerén lévő .env-et kell
// betölteni — a vitest cwd-je `packages/core`, nem a repo gyökér, úgyhogy a
// CLI belépési pontjában (`apps/cli/src/main.ts`) használt mintát követve,
// explicit útvonallal töltjük be, ENOENT-toleránsan.
const here = dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = resolve(here, '../../../../.env');
try {
  process.loadEnvFile(repoRootEnvPath);
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
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

    const result = await queryReadonly('SELECT id, name FROM products LIMIT 1', {
      pool: fakePool,
    });

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

    await expect(
      queryReadonly('SELECT 1', { pool: fakePool }),
    ).rejects.toThrow('connection refused');
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
    const first = await queryReadonly('SELECT count(*)::int AS total FROM products');
    const second = await queryReadonly('SELECT count(*)::int AS total FROM products');

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

    await expect(
      queryReadonly('DELETE FROM products'),
    ).rejects.toThrow(/permission denied/i);

    const after = await queryReadonly(
      'SELECT count(*)::int AS total FROM products',
    );
    expect(after.rows[0]).toEqual(before.rows[0]);
  });
});
