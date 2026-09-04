import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { closePackagePool, queryPackage } from './db-package.js';
import { executeSavePackage } from './save-package-tool.js';

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

interface Fixture {
  readonly customerId: number;
  readonly productId: number;
  readonly price: number;
}

async function fixture(): Promise<Fixture> {
  const customer = await queryPackage<{ id: number }>(
    'SELECT id FROM customers ORDER BY id LIMIT 1',
  );
  const product = await queryPackage<{ id: number; price: number }>(
    'SELECT id, COALESCE(sale_price, price)::float8 AS price FROM products ' +
      'WHERE stock > 0 ORDER BY COALESCE(sale_price, price) ASC LIMIT 1',
  );
  return {
    customerId: customer.rows[0].id,
    productId: product.rows[0].id,
    price: product.rows[0].price,
  };
}

/**
 * A savePackage KULCS-invariánsa valódi adatbázison: a mentés VALÓDI, auditálható sort hoz
 * létre, ÁRPILLANATKÉPPEL, és egy elutasított csomag SOSEM ír. Az upsert-product-db.spec.ts
 * mintája: admin kapcsolaton takarítunk, a package szerep szándékosan nem tud DELETE-elni.
 */
describe('savePackage — valódi DB-n', () => {
  afterAll(async () => {
    await closePackagePool();
  });

  it('érvényes csomagot ELMENT, a válasz tartalmazza a packageId-t és az árpillanatképet', async () => {
    const { customerId, productId, price } = await fixture();

    const outcome = await executeSavePackage({
      customerId,
      items: [{ productId, quantity: 1 }],
    });

    expect(outcome.isError).toBe(false);
    const parsed = JSON.parse(outcome.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.totalPrice).toBe(price);

    const row = await queryPackage<{ total_price: string }>(
      'SELECT total_price FROM packages WHERE id = $1',
      [parsed.packageId],
    );
    expect(Number(row.rows[0].total_price)).toBe(price);

    const items = await queryPackage<{ unit_price: string }>(
      'SELECT unit_price FROM package_items WHERE package_id = $1',
      [parsed.packageId],
    );
    expect(items.rowCount).toBe(1);
    expect(Number(items.rows[0].unit_price)).toBe(price);

    // Takarítás admin kapcsolaton (a package szerep nem tud DELETE-elni).
    const admin = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await admin.query('DELETE FROM packages WHERE id = $1', [parsed.packageId]);
    } finally {
      await admin.end();
    }
  });

  it('túl nagy mennyiségre ELUTASÍT, és NEM ír egyetlen sort sem', async () => {
    const { customerId, productId } = await fixture();

    const beforeCount = await queryPackage<{ count: string }>(
      'SELECT count(*)::text AS count FROM packages WHERE customer_id = $1',
      [customerId],
    );

    const outcome = await executeSavePackage({
      customerId,
      items: [{ productId, quantity: 1_000_000 }],
    });

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content).ok).toBe(false);

    const afterCount = await queryPackage<{ count: string }>(
      'SELECT count(*)::text AS count FROM packages WHERE customer_id = $1',
      [customerId],
    );
    expect(afterCount.rows[0].count).toBe(beforeCount.rows[0].count);
  });
});
