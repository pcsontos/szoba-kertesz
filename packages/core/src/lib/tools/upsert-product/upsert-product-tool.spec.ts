import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { executeUpsertProduct } from './upsert-product-tool.js';

function fakePool(rows: readonly Record<string, unknown>[][]): Pool {
  const query = vi.fn();
  for (const r of rows) {
    query.mockResolvedValueOnce({ rows: r, rowCount: r.length });
  }
  return { query } as unknown as Pool;
}

describe('executeUpsertProduct', () => {
  it('érvénytelen terméknél NEM ír DB-be, és MINDEN hibát egyben ad vissza', async () => {
    const pool = fakePool([]);
    const outcome = await executeUpsertProduct(
      { name: 'x', category: 'nemlétező' },
      { pool },
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.content).toMatch(/Érvénytelen termék/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
