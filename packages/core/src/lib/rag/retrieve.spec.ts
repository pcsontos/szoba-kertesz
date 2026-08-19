import { describe, expect, it, vi } from 'vitest';
import { KEEP_TOP, retrieveKnowledge, WIDE_NET } from './retrieve.js';
import type { KnowledgeHit } from './knowledge-store.js';
import type { RerankedHit } from './rerank.js';

/**
 * A pipeline összeszerelésének tesztjei. Minden lépés injektálva van, tehát
 * se DB, se API nem kell — amit itt bizonyítunk, az a SORREND és a két
 * kapcsoló (HyDE / rerank) hatása, nem az egyes lépések belső működése.
 */

const hit = (chunkIndex: number, title: string): KnowledgeHit => ({
  id: chunkIndex + 1,
  source: `https://teszt.local/${chunkIndex}`,
  title,
  category: 'teszt',
  chunkIndex,
  content: `${title} — részlet.`,
  distance: 0.2 + chunkIndex / 100,
});

const ranked = (hits: KnowledgeHit[]): RerankedHit[] =>
  hits.map((entry) => ({ ...entry, score: 8 }));

/** Néma napló: a Trace-t nem akarjuk a teszt-kimenetbe. */
const silent = { log: () => undefined };

describe('retrieveKnowledge', () => {
  it('HyDE-dal a KITALÁLT választ embeddeli, és a tág hálót rangsoroltatja', async () => {
    const hyde = vi.fn(
      async () => 'Yellowing leaves are caused by overwatering.',
    );
    const embed = vi.fn(async () => [0.1, 0.2]);
    const search = vi.fn(async () => [hit(0, 'A'), hit(1, 'B')]);
    // A mock a VALÓDI RetrieveDeps.rerank szignatúrát veszi fel (3 paraméter),
    // különben a mock.calls[0] típusa 2 hosszú tuple, és a [2] indexelés nem fordul.
    const rerank = vi.fn(
      async (_question: string, hits: KnowledgeHit[], _keepTop: number) =>
        ranked(hits).slice(0, 1),
    );

    const result = await retrieveKnowledge(
      'miért sárgulnak a leveleim?',
      {},
      { ...silent, hyde, embed, search, rerank },
    );

    expect(hyde).toHaveBeenCalledWith('miért sárgulnak a leveleim?');
    // NEM a kérdést embeddeljük, hanem a hipotetikus választ — ez a HyDE lényege.
    expect(embed).toHaveBeenCalledWith(
      'Yellowing leaves are caused by overwatering.',
    );
    // Tág háló megy a rangsorolásba, hogy legyen mit átrendezni.
    expect(search).toHaveBeenCalledWith([0.1, 0.2], WIDE_NET);
    expect(rerank.mock.calls[0]?.[2]).toBe(KEEP_TOP);
    expect(result.hits).toHaveLength(1);
    expect(result.searchText).toBe(
      'Yellowing leaves are caused by overwatering.',
    );
  });

  it('useHyde: false esetén a KÉRDÉST embeddeli, HyDE-hívás nélkül', async () => {
    const hyde = vi.fn(async () => 'nem szabad meghívni');
    const embed = vi.fn(async () => [0.3]);
    const search = vi.fn(async () => [hit(0, 'A')]);
    const rerank = vi.fn(async (_question: string, hits: KnowledgeHit[]) =>
      ranked(hits),
    );

    const result = await retrieveKnowledge(
      'hogyan öntözzem?',
      { useHyde: false },
      { ...silent, hyde, embed, search, rerank },
    );

    expect(hyde).not.toHaveBeenCalled();
    expect(embed).toHaveBeenCalledWith('hogyan öntözzem?');
    expect(result.searchText).toBe('hogyan öntözzem?');
  });

  it('useRerank: false esetén csak topK-t kér a vektorkeresésből, és nem rangsorol', async () => {
    const embed = vi.fn(async () => [0.4]);
    const search = vi.fn(async () => [hit(0, 'A'), hit(1, 'B')]);
    const rerank = vi.fn();

    const result = await retrieveKnowledge(
      'kérdés',
      { useHyde: false, useRerank: false, topK: 2 },
      { ...silent, embed, search, rerank: rerank as never },
    );

    expect(search).toHaveBeenCalledWith([0.4], 2);
    expect(rerank).not.toHaveBeenCalled();
    // Rerank nélkül is RerankedHit alakot adunk vissza, -1 pontszámmal.
    expect(result.hits.every((entry) => entry.score === -1)).toBe(true);
  });

  it('üres tudásbázisnál üres találatot ad, rangsorolás nélkül', async () => {
    const rerank = vi.fn();

    const result = await retrieveKnowledge(
      'kérdés',
      { useHyde: false },
      {
        ...silent,
        embed: async () => [0.5],
        search: async () => [],
        rerank: rerank as never,
      },
    );

    expect(result.hits).toEqual([]);
    expect(rerank).not.toHaveBeenCalled();
  });
});
