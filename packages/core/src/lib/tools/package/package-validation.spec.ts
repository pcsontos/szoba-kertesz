import { describe, expect, it } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { checkPackage } from './package-validation.js';
import type { PackageInput } from './package-schema.js';

/**
 * A checkPackage a DETERMINISZTIKUS szabály (nem LLM-döntés) — mockolt pool-lal, valódi DB
 * nélkül teszteljük a döntési ágakat. A DB-n futó forgatókönyvek (valódi seed-adat)
 * package-validation-db.spec.ts-ben vannak.
 */

function fakePool(
  customerRow: Record<string, unknown> | undefined,
  productRows: Record<string, unknown>[],
): Pool {
  let call = 0;
  return {
    query: async (): Promise<QueryResult> => {
      call += 1;
      if (call === 1) {
        return {
          rows: customerRow ? [customerRow] : [],
          rowCount: customerRow ? 1 : 0,
        } as QueryResult;
      }
      return { rows: productRows, rowCount: productRows.length } as QueryResult;
    },
  } as unknown as Pool;
}

const CUSTOMER = {
  budget: 10000,
  pet_safe_required: true,
  kid_safe_required: false,
  expertise_level: 'kezdő',
};

const PRODUCT = {
  id: 1,
  name: 'Teszt növény',
  stock: 5,
  pet_safe: true,
  kid_safe: true,
  difficulty: 'kezdő',
  unit_price: 2000,
};

const validInput: PackageInput = {
  customerId: 1,
  items: [{ productId: 1, quantity: 2 }],
};

describe('checkPackage', () => {
  it('rendben talál egy érvényes, kereten belüli csomagot', async () => {
    const pool = fakePool(CUSTOMER, [PRODUCT]);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.totalPrice).toBe(4000);
    expect(result.items).toEqual([
      { productId: 1, name: 'Teszt növény', quantity: 2, unitPrice: 2000, lineTotal: 4000 },
    ]);
  });

  it('elutasítja, ha nincs ilyen ügyfél', async () => {
    const pool = fakePool(undefined, []);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.code).toBe('unknown_customer');
  });

  it('elutasítja, ha a kért termék nem létezik', async () => {
    const pool = fakePool(CUSTOMER, []);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.code).toBe('unknown_product');
  });

  it('elutasítja, ha nincs elég készlet', async () => {
    const pool = fakePool(CUSTOMER, [{ ...PRODUCT, stock: 1 }]);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('out_of_stock');
  });

  it('elutasítja, ha az ügyfélnek pet-safe kell, a termék meg nem az', async () => {
    const pool = fakePool(CUSTOMER, [{ ...PRODUCT, pet_safe: false }]);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('not_pet_safe');
  });

  it('elutasítja, ha a termék nehézségi szintje meghaladja az ügyfél hozzáértését', async () => {
    const pool = fakePool(CUSTOMER, [{ ...PRODUCT, difficulty: 'profi' }]);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('too_difficult');
  });

  it('elutasítja, ha az összár meghaladja a keretet', async () => {
    const pool = fakePool(
      { ...CUSTOMER, budget: 1000 },
      [PRODUCT],
    );

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('over_budget');
  });
});
