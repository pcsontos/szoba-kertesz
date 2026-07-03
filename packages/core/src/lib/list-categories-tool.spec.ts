import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Pool } from 'pg';
import { closeReadonlyPool } from './db-readonly.js';
import {
  executeListCategoriesTool,
  listCategoriesToolDefinition,
} from './list-categories-tool.js';

// Lásd runsql-tool.spec.ts — ugyanaz a minta: a repo gyökerén lévő .env
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

describe('listCategoriesToolDefinition', () => {
  it('is named listCategories and takes no required input', () => {
    expect(listCategoriesToolDefinition.name).toEqual('listCategories');
    expect(listCategoriesToolDefinition.input_schema.required).toBeUndefined();
  });
});

describe('executeListCategoriesTool (mocked pool)', () => {
  afterEach(async () => {
    await closeReadonlyPool();
  });

  it('rejects a non-object input without touching the DB', async () => {
    const fakePool = { query: vi.fn() } as unknown as Pool;

    const result = await executeListCategoriesTool('nem objektum', {
      pool: fakePool,
    });

    expect(result.ok).toBe(false);
    expect(fakePool.query).not.toHaveBeenCalled();
  });

  it('runs SELECT DISTINCT category against the pool and returns the category names', async () => {
    const fakeRows = [
      { category: 'kaktusz' },
      { category: 'szobanövény' },
    ];
    const fakePool = {
      query: vi.fn().mockResolvedValue({ rows: fakeRows, rowCount: 2 }),
    } as unknown as Pool;

    const result = await executeListCategoriesTool({}, { pool: fakePool });

    expect(fakePool.query).toHaveBeenCalledWith(
      'SELECT DISTINCT category FROM products ORDER BY category',
    );
    expect(result).toEqual({
      ok: true,
      categories: ['kaktusz', 'szobanövény'],
    });
  });

  it('surfaces a DB error as a tool_result-style failure instead of throwing', async () => {
    const fakePool = {
      query: vi.fn().mockRejectedValue(new Error('connection terminated')),
    } as unknown as Pool;

    const result = await executeListCategoriesTool({}, { pool: fakePool });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatch(/connection terminated/i);
  });
});

describe('executeListCategoriesTool (real local DB — DATABASE_URL_READONLY)', () => {
  afterAll(async () => {
    await closeReadonlyPool();
  });

  it('returns the distinct categories actually present in the seeded products table', async () => {
    const result = await executeListCategoriesTool({});

    expect(result.ok).toBe(true);
    expect(result.ok && result.categories).toEqual(
      [...(result.ok ? result.categories : [])].sort(),
    );
    expect(result.ok && result.categories).toEqual(
      expect.arrayContaining(['szobanövény', 'kaktusz', 'pozsgás']),
    );
  });
});
