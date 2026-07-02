import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Pool } from 'pg';
import { closeReadonlyPool } from './db-readonly.js';
import { executeRunSqlTool, runSqlToolDefinition } from './runsql-tool.js';

// Lásd db-readonly.spec.ts — ugyanaz a minta: a repo gyökerén lévő .env
// explicit betöltése, mert a vitest cwd-je `packages/core`.
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

describe('runSqlToolDefinition', () => {
  it('is named runSql and requires a query string input', () => {
    expect(runSqlToolDefinition.name).toEqual('runSql');
    expect(runSqlToolDefinition.input_schema.required).toEqual(['query']);
  });
});

describe('executeRunSqlTool (mocked pool)', () => {
  afterEach(async () => {
    await closeReadonlyPool();
  });

  it('rejects invalid (non-object / missing query) input via Zod without touching the DB', async () => {
    const fakePool = { query: vi.fn() } as unknown as Pool;

    const result = await executeRunSqlTool({ notQuery: 'x' }, { pool: fakePool });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/Érvénytelen runSql bemenet/i);
    expect(fakePool.query).not.toHaveBeenCalled();
  });

  it('rejects a completely malformed input (string instead of object) without touching the DB', async () => {
    const fakePool = { query: vi.fn() } as unknown as Pool;

    const result = await executeRunSqlTool('DROP TABLE products', {
      pool: fakePool,
    });

    expect(result.ok).toBe(false);
    expect(fakePool.query).not.toHaveBeenCalled();
  });

  it('rejects a write attempt via the guard without touching the DB', async () => {
    const fakePool = { query: vi.fn() } as unknown as Pool;

    const result = await executeRunSqlTool(
      { query: 'DELETE FROM products' },
      { pool: fakePool },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/SELECT/i);
    expect(fakePool.query).not.toHaveBeenCalled();
  });

  it('runs the guard-approved (LIMIT-appended) SQL through the pool and returns the rows', async () => {
    const fakeRows = [{ id: 1, name: 'Aloe vera' }];
    const fakePool = {
      query: vi.fn().mockResolvedValue({ rows: fakeRows, rowCount: 1 }),
    } as unknown as Pool;

    const result = await executeRunSqlTool(
      { query: 'SELECT id, name FROM products WHERE pet_safe' },
      { pool: fakePool },
    );

    expect(fakePool.query).toHaveBeenCalledWith(
      'SELECT id, name FROM products WHERE pet_safe LIMIT 50',
    );
    expect(result).toEqual({
      ok: true,
      sql: 'SELECT id, name FROM products WHERE pet_safe LIMIT 50',
      rows: fakeRows,
      rowCount: 1,
    });
  });

  it('surfaces a DB/SQL error as a tool_result-style failure instead of throwing', async () => {
    const fakePool = {
      query: vi.fn().mockRejectedValue(new Error('syntax error at or near "FORM"')),
    } as unknown as Pool;

    const result = await executeRunSqlTool(
      { query: 'SELECT * FORM products' },
      { pool: fakePool },
    );

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/syntax error/i);
    expect(!result.ok && result.sql).toEqual('SELECT * FORM products LIMIT 50');
  });
});

describe('executeRunSqlTool (real local DB — DATABASE_URL_READONLY)', () => {
  afterAll(async () => {
    await closeReadonlyPool();
  });

  it('executes a real SELECT against the seeded products table end-to-end', async () => {
    const result = await executeRunSqlTool({
      query: 'SELECT id, name, pet_safe FROM products WHERE pet_safe = true',
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.sql).toMatch(/LIMIT 50$/);
    expect(result.ok && result.rows.every((row) => row.pet_safe === true)).toBe(
      true,
    );
  });
});
