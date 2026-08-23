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

  it('üzenetet ÁTÍRNI sem tud — az append-only nem szófordulat, hanem grant', async () => {
    // A #8 PR review 4. tétele: a `messages` UPDATE-je a chat-szerepen felesleges tág
    // jog volt (a tár egyetlen művelete sem frissít üzenetet), és így a doksi
    // „append-only" állítását a DB nem támasztotta alá. A grant szűkítése óta igen.
    await expect(
      queryChat('UPDATE messages SET role = $1 WHERE id = $2', ['user', -1]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('a threads UPDATE-je viszont KELL — az updated_at léptetéséhez', async () => {
    // Nem a jog megléte a lényeg, hanem hogy nem véletlenül van ott: enélkül a
    // beszélgetés nem ugrana a lista élére egy új üzenetnél.
    await expect(
      queryChat('UPDATE threads SET updated_at = now() WHERE id = $1::uuid', [
        '00000000-0000-4000-8000-000000000000',
      ]),
    ).resolves.toBeDefined();
  });

  it('sémát módosítani NEM tud', async () => {
    await expect(
      queryChat('ALTER TABLE threads ADD COLUMN hacked boolean'),
    ).rejects.toThrow(/permission denied|must be owner/i);
  });
});
