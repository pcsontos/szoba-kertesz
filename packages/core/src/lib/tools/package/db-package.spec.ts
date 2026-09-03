import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { closePackagePool, queryPackage, withPackageTransaction } from './db-package.js';

// Lásd upsert-product/db-readwrite.spec.ts — ugyanaz a minta: a repo gyökerén lévő .env
// explicit betöltése, mert a vitest cwd-je packages/core.
const here = dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = resolve(here, '../../../../../../.env');
try {
  process.loadEnvFile(repoRootEnvPath);
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

/**
 * A szoba-kertesz_package szerep jogosultsági határai valódi DB-n — a db-readwrite.spec.ts
 * és a thread-store DB-specjeinek mintájára: a határokat nem a prompt őrzi, hanem a Postgres
 * szerepkör.
 */
describe('db-package — a szoba-kertesz_package szerep jogosultsági határai', () => {
  afterAll(async () => {
    await closePackagePool();
  });

  it('olvasni tud a products és a customers táblából', async () => {
    const products = await queryPackage<{ count: string }>(
      'SELECT count(*)::text AS count FROM products',
    );
    const customers = await queryPackage<{ count: string }>(
      'SELECT count(*)::text AS count FROM customers',
    );

    expect(Number(products.rows[0].count)).toBeGreaterThan(0);
    expect(Number(customers.rows[0].count)).toBeGreaterThan(0);
  });

  it('be tud szúrni egy csomagot tranzakcióban, és a tranzakció COMMIT-tal zárul', async () => {
    const customer = await queryPackage<{ id: number }>(
      'SELECT id FROM customers LIMIT 1',
    );
    const customerId = customer.rows[0].id;

    const packageId = await withPackageTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        'INSERT INTO packages (customer_id, total_price) VALUES ($1, $2) RETURNING id',
        [customerId, 1000],
      );
      return result.rows[0].id;
    });

    const inserted = await queryPackage<{ id: string }>(
      'SELECT id FROM packages WHERE id = $1',
      [packageId],
    );
    expect(inserted.rowCount).toBe(1);

    // Takarítás ADMIN kapcsolaton — a package szerepnek nincs DELETE joga.
    const admin = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await admin.query('DELETE FROM packages WHERE id = $1', [packageId]);
    } finally {
      await admin.end();
    }
  });

  it('a tranzakció ROLLBACK-el zárul, ha a run-függvény dob', async () => {
    const customer = await queryPackage<{ id: number }>(
      'SELECT id FROM customers LIMIT 1',
    );
    const customerId = customer.rows[0].id;

    await expect(
      withPackageTransaction(async (client) => {
        await client.query(
          'INSERT INTO packages (customer_id, total_price) VALUES ($1, $2)',
          [customerId, 1000],
        );
        throw new Error('szándékos hiba a rollback teszteléséhez');
      }),
    ).rejects.toThrow(/szándékos hiba/);

    const remaining = await queryPackage<{ count: string }>(
      'SELECT count(*)::text AS count FROM packages WHERE customer_id = $1 AND total_price = 1000',
      [customerId],
    );
    expect(Number(remaining.rows[0].count)).toBe(0);
  });

  it('frissíteni NEM tud — a packages append-only', async () => {
    await expect(
      queryPackage('UPDATE packages SET total_price = total_price WHERE false'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('törölni NEM tud', async () => {
    await expect(
      queryPackage('DELETE FROM packages WHERE false'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('a customers táblát NEM tudja módosítani — csak SELECT joga van rajta', async () => {
    await expect(
      queryPackage('UPDATE customers SET notes = notes WHERE false'),
    ).rejects.toThrow(/permission denied/i);
  });
});
