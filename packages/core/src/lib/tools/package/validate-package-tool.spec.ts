import { describe, expect, it } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  VALIDATE_PACKAGE_TOOL_NAME,
  executeValidatePackage,
  validatePackageTool,
} from './validate-package-tool.js';

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
  pet_safe_required: false,
  kid_safe_required: false,
  expertise_level: 'profi',
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

describe('executeValidatePackage', () => {
  it('érvénytelen bemenetnél nem fut le lekérdezés, magyar hibaüzenetet ad', async () => {
    const outcome = await executeValidatePackage({ customerId: 'x' });

    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain('Érvénytelen csomag');
  });

  it('rendben talált csomagnál isError:false, a content JSON-ban ok:true', async () => {
    const pool = fakePool(CUSTOMER, [PRODUCT]);

    const outcome = await executeValidatePackage(
      { customerId: 1, items: [{ productId: 1, quantity: 2 }] },
      { pool },
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content)).toMatchObject({ ok: true, totalPrice: 4000 });
    expect(outcome.summary).toContain('OK');
  });

  it('szabálysértésnél isError:false marad (nem rendszerhiba), de ok:false a tartalomban', async () => {
    const pool = fakePool({ ...CUSTOMER, budget: 1 }, [PRODUCT]);

    const outcome = await executeValidatePackage(
      { customerId: 1, items: [{ productId: 1, quantity: 2 }] },
      { pool },
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content).ok).toBe(false);
    expect(outcome.summary).toContain('ELUTASÍTVA');
  });
});

describe('validatePackageTool', () => {
  it('a tool execute-je függvény, injektálás nélkül is felépíthető', () => {
    const tool = validatePackageTool();
    expect(typeof tool.execute).toBe('function');
  });

  it('a tool NEVE a várt konstans', () => {
    expect(VALIDATE_PACKAGE_TOOL_NAME).toBe('validatePackage');
  });
});
