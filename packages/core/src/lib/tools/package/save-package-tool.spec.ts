import { describe, expect, it, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  SAVE_PACKAGE_TOOL_NAME,
  executeSavePackage,
  savePackageTool,
} from './save-package-tool.js';

function fakeRejectingPool(): Pool {
  // A checkPackage ELSŐ (customer) lekérdezése üres sort ad — a savePackage tehát
  // unknown_customer-en bukik, és SOSEM jut el a pool.connect()-ig (a transactionig).
  return {
    query: async (): Promise<QueryResult> => ({ rows: [], rowCount: 0 } as QueryResult),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('executeSavePackage', () => {
  it('érvénytelen bemenetnél nem ír, magyar hibaüzenetet ad', async () => {
    const outcome = await executeSavePackage({ customerId: 'x' });

    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain('Érvénytelen csomag');
  });

  it('ha a checkPackage elutasítja, NEM próbál írni (pool.connect sosem hívódik)', async () => {
    const pool = fakeRejectingPool();

    const outcome = await executeSavePackage(
      { customerId: 999, items: [{ productId: 1, quantity: 1 }] },
      { pool },
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content).ok).toBe(false);
    expect(outcome.summary).toContain('ELUTASÍTVA');
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe('savePackageTool', () => {
  it('a tool NEVE a várt konstans, injektálás nélkül is felépíthető', () => {
    const tool = savePackageTool();
    expect(typeof tool.execute).toBe('function');
    expect(SAVE_PACKAGE_TOOL_NAME).toBe('savePackage');
  });
});
