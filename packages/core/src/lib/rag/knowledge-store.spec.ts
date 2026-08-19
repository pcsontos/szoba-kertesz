import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS } from './embed.js';
import {
  closeKnowledgePool,
  insertChunks,
  listChunks,
  listSources,
  searchChunks,
  type KnowledgeChunkInput,
} from './knowledge-store.js';

// A repo gyökerén lévő .env explicit betöltése — a vitest cwd-je `packages/core`.
// Ugyanaz a minta, mint a db-readwrite.spec.ts / upsert-product-db.spec.ts-ben.
const here = dirname(fileURLToPath(import.meta.url));
try {
  process.loadEnvFile(resolve(here, '../../../../../.env'));
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

/**
 * A vektorkeresés VALÓDI adatbázison — mert a `<=>` operátor viselkedését
 * (koszinusz-távolság, ORDER BY, LIMIT) semmilyen mock nem tudja bizonyítani.
 *
 * A tudásbázis MEGLÉVŐ tartalmához nem nyúlunk: saját, csak ide való `source`
 * értékkel dolgozunk, és admin-kapcsolaton takarítunk. A `clearKnowledge()`-ot
 * ez a spec SOHA nem hívja — az TRUNCATE-elne, azaz kitörölné a betöltött korpuszt.
 */

const TEST_SOURCE = 'https://teszt.local/knowledge-store-spec';

/** Egy-forró (one-hot) vektor: a `position`-adik dimenzió 1, a többi 0. */
const oneHot = (position: number): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, (_unused, index) =>
    index === position ? 1 : 0,
  );

const chunk = (
  chunkIndex: number,
  content: string,
  embedding: number[],
): KnowledgeChunkInput => ({
  source: TEST_SOURCE,
  title: 'Teszt dokumentum',
  category: 'teszt',
  chunkIndex,
  content,
  embedding,
});

afterAll(async () => {
  // A szemét eltakarítása admin-kapcsolaton — a store maga szándékosan nem tud törölni.
  const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
  await pool.query('DELETE FROM knowledge_chunks WHERE source = $1', [
    TEST_SOURCE,
  ]);
  await pool.end();
  await closeKnowledgePool();
});

describe('knowledge-store', () => {
  it('rossz dimenziójú kérdés-vektorra ÉRTHETŐ hibát dob, nem SQL-hibát', async () => {
    await expect(searchChunks([0.1, 0.2, 0.3], 5)).rejects.toThrow(
      /ugyanazzal a modellel/i,
    );
  });

  it('a beírt darabok közül a LEGKÖZELEBBIT adja vissza elsőnek', async () => {
    const written = await insertChunks([
      chunk(0, 'A monstera levele sárgul.', oneHot(0)),
      chunk(1, 'Az ajándékkártya beváltása.', oneHot(1)),
    ]);
    expect(written).toBe(2);

    const hits = await searchChunks(oneHot(0), 5);
    const own = hits.filter((hit) => hit.source === TEST_SOURCE);

    expect(own[0]?.content).toBe('A monstera levele sárgul.');
    expect(own[0]?.chunkIndex).toBe(0);
  });

  it('az azonos irányú vektor távolsága gyakorlatilag nulla, a merőlegesé 1', async () => {
    // A távolságot KÖZVETLENÜL kérdezzük vissza, nem a searchChunks top-K-ján át.
    // Miért: a betöltött korpusz mellett a szándékosan MERŐLEGES sor (távolság 1.0) a
    // legtávolabbiak közé esik — a 2041 chunkból 1724 közelebb van nála —, a source-szűrés
    // pedig az SQL LIMIT UTÁN, JS-ben fut, tehát a sor semmilyen ésszerű K-ba nem férne be.
    // Így a `<=>` szemantikáját a korpusz méretétől függetlenül mérjük; a searchChunks
    // rendezését a fenti teszt bizonyítja.
    const pool = new Pool({ connectionString: process.env['DATABASE_URL'] });
    try {
      const result = await pool.query<{ chunk_index: number; distance: string }>(
        `SELECT chunk_index, embedding <=> $1 AS distance
           FROM knowledge_chunks
          WHERE source = $2`,
        [`[${oneHot(0).join(',')}]`, TEST_SOURCE],
      );
      const own = new Map(
        result.rows.map(
          (row) => [row.chunk_index, Number(row.distance)] as const,
        ),
      );

      expect(own.get(0) ?? 1).toBeLessThan(0.001);
      expect(own.get(1) ?? 0).toBeCloseTo(1, 3);
    } finally {
      await pool.end();
    }
  });

  it('a listSources a dokumentumot a darabszámával adja vissza', async () => {
    const sources = await listSources();
    const own = sources.find((source) => source.source === TEST_SOURCE);

    expect(own?.chunkCount).toBe(2);
    expect(own?.title).toBe('Teszt dokumentum');
  });

  it('a listChunks egy dokumentumra szűr, chunk_index sorrendben', async () => {
    const chunks = await listChunks({ source: TEST_SOURCE });

    expect(chunks.map((stored) => stored.chunkIndex)).toEqual([0, 1]);
    expect(chunks[0]?.chars).toBe('A monstera levele sárgul.'.length);
  });
});
