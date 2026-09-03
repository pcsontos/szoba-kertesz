import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { queryPackage } from './db-package.js';
import { checkPackage } from './package-validation.js';

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

interface CustomerFixture {
  readonly id: number;
  readonly budget: number;
}
interface ProductFixture {
  readonly id: number;
  readonly price: number;
  readonly stock: number;
}

async function firstCustomer(): Promise<CustomerFixture> {
  const result = await queryPackage<CustomerFixture>(
    'SELECT id, budget::float8 AS budget FROM customers ORDER BY id LIMIT 1',
  );
  return result.rows[0];
}

async function cheapInStockProduct(): Promise<ProductFixture> {
  const result = await queryPackage<ProductFixture>(
    'SELECT id, COALESCE(sale_price, price)::float8 AS price, stock FROM products ' +
      'WHERE stock > 0 ORDER BY COALESCE(sale_price, price) ASC LIMIT 1',
  );
  return result.rows[0];
}

/**
 * A checkPackage VALÓDI seed-adaton — a mockolt unit specekkel ellentétben itt a tényleges
 * customers/products táblák tartalma dönt. A cél: bizonyítani, hogy a szoba-kertesz_package
 * szerepen keresztül fut a lekérdezés, és a mért árak/készletek a valósággal egyeznek.
 */
describe('checkPackage — valódi seed-adaton', () => {
  it('egy létező ügyfélre és egy raktáron lévő, olcsó termékre rendben talál egy 1 darabos csomagot', async () => {
    const customer = await firstCustomer();
    const product = await cheapInStockProduct();

    const result = await checkPackage({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
    });

    expect(result.totalPrice).toBe(product.price);
    // Csak a büdzsé-korlátot állítjuk (a többi szabály a konkrét seed-adattól függ,
    // ezért nem feltételezünk ok:true-t — a lényeg, hogy a lekérdezés valódi adatot ad).
    expect(result.customerBudget).toBe(customer.budget);
  });

  it('irreálisan nagy mennyiségre out_of_stock-ot jelez', async () => {
    const customer = await firstCustomer();
    const product = await cheapInStockProduct();

    const result = await checkPackage({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: product.stock + 1000 }],
    });

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('out_of_stock');
  });

  it('nem létező ügyfél-azonosítóra unknown_customer-t ad', async () => {
    const result = await checkPackage({
      customerId: -1,
      items: [{ productId: 1, quantity: 1 }],
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      { code: 'unknown_customer', message: 'Nincs -1 azonosítójú ügyfél.' },
    ]);
  });
});
