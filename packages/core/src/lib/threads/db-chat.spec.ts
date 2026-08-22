import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeChatPool, queryChat } from './db-chat.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = resolve(here, '../../../../../.env');
try {
  process.loadEnvFile(repoRootEnvPath);
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

/**
 * A db-readwrite.spec.ts párja. Ha bármelyik TILTÓ teszt átmegy, a grant túl bő —
 * az nem teszthiba, hanem biztonsági rés.
 */
describe('db-chat — a szoba-kertesz_chat szerep jogosultsági határai', () => {
  afterAll(async () => {
    await closeChatPool();
  });

  it('olvasni tud a threads táblából', async () => {
    const result = await queryChat<{ count: string }>(
      'SELECT count(*)::text AS count FROM threads',
    );

    expect(Number(result.rows[0].count)).toBeGreaterThanOrEqual(0);
  });

  it('a KATALÓGUST NEM látja — a beszélgetés-tár nem fér a termékekhez', async () => {
    await expect(queryChat('SELECT id FROM products LIMIT 1')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('a TUDÁSBÁZIST NEM látja', async () => {
    await expect(
      queryChat('SELECT id FROM knowledge_chunks LIMIT 1'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('az ÜGYFELEKET sem látja — az a query-agent adata, nem a táré', async () => {
    await expect(queryChat('SELECT id FROM customers LIMIT 1')).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('üzenetet törölni NEM tud — a tár append-only', async () => {
    await expect(
      queryChat('DELETE FROM messages WHERE id = $1', [-1]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('sémát módosítani NEM tud', async () => {
    await expect(
      queryChat('ALTER TABLE threads ADD COLUMN hacked boolean'),
    ).rejects.toThrow(/permission denied|must be owner/i);
  });
});
