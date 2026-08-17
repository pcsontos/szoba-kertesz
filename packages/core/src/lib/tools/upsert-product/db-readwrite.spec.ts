import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeReadWritePool, queryReadWrite } from './db-readwrite.js';

// Lásd ../run-sql/db-readonly.spec.ts — ugyanaz a minta: a repo gyökerén lévő .env
// explicit betöltése, mert a vitest cwd-je `packages/core`.
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
 * A `db-readonly.spec.ts` „double protection" tesztjének párja, valódi DB ellen.
 *
 * Ez a task lényegi bizonyítéka: az író agent határait NEM a system prompt őrzi,
 * hanem a Postgres szerepkör. Ha bármelyik tiltó teszt átmegy, a grant túl bő —
 * az nem teszthiba, hanem biztonsági rés.
 */
describe('db-readwrite — a szoba-kertesz_rw szerep jogosultsági határai', () => {
  afterAll(async () => {
    await closeReadWritePool();
  });

  it('olvasni tud a products táblából', async () => {
    const result = await queryReadWrite<{ count: string }>(
      'SELECT count(*)::text AS count FROM products',
    );

    expect(Number(result.rows[0].count)).toBeGreaterThan(0);
  });

  it('frissíteni tud (ugyanarra az értékre — nem változtat adatot)', async () => {
    const result = await queryReadWrite(
      'UPDATE products SET stock = stock WHERE id = (SELECT min(id) FROM products)',
    );

    expect(result.rowCount).toBe(1);
  });

  it('törölni NEM tud — a második védelmi vonal a DB-ben van, nem a promptban', async () => {
    await expect(
      queryReadWrite('DELETE FROM products WHERE id = $1', [-1]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('sémát módosítani NEM tud', async () => {
    await expect(
      queryReadWrite('ALTER TABLE products ADD COLUMN hacked boolean'),
    ).rejects.toThrow(/permission denied|must be owner/i);
  });
});
