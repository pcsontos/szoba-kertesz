import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { rerankHits } from './rerank.js';
import type { KnowledgeHit } from './knowledge-store.js';

/**
 * A reranker azt javítja, amit a vektortávolság elront: a távolság OLCSÓ, de BUTA —
 * nem tudja, mit KÉRDEZTÉL. Ezek a tesztek azt rögzítik, hogy (1) a modell pontszáma
 * TÉNYLEG átrendezi a sorrendet, és (2) a retrieval sosem áll meg a reranker hibáján.
 */

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
  totalTokens: input + output,
});

const scoringModel = (scores: { index: number; score: number }[]) =>
  new MockLanguageModelV4({
    doGenerate: (async () => ({
      content: [{ type: 'text' as const, text: JSON.stringify({ scores }) }],
      finishReason: { unified: 'stop' as const },
      usage: usage(300, 60),
      warnings: [],
    })) as never,
  });

const hit = (
  chunkIndex: number,
  title: string,
  distance: number,
): KnowledgeHit => ({
  id: chunkIndex + 1,
  source: `https://teszt.local/${chunkIndex}`,
  title,
  category: 'teszt',
  chunkIndex,
  content: `${title} — a részlet szövege.`,
  distance,
});

describe('rerankHits', () => {
  it('a pontszám ÁTRENDEZI a vektorsorrendet', async () => {
    const hits = [
      hit(0, 'monstera öntözése', 0.21),
      hit(1, 'gyökérrothadás kezelése', 0.38),
    ];

    const reranked = await rerankHits(
      'hogyan mentsem meg a túlöntözött monsterát?',
      hits,
      2,
      {
        model: scoringModel([
          { index: 0, score: 3 },
          { index: 1, score: 9 },
        ]),
      },
    );

    // A vektorban TÁVOLABBI chunk lett az első — pontosan ezért van reranking.
    expect(reranked.map((entry) => entry.title)).toEqual([
      'gyökérrothadás kezelése',
      'monstera öntözése',
    ]);
    expect(reranked[0]?.score).toBe(9);
  });

  it('csak a keepTop legjobbat tartja meg', async () => {
    const hits = [hit(0, 'A', 0.2), hit(1, 'B', 0.3), hit(2, 'C', 0.4)];

    const reranked = await rerankHits('kérdés', hits, 2, {
      model: scoringModel([
        { index: 0, score: 1 },
        { index: 1, score: 10 },
        { index: 2, score: 5 },
      ]),
    });

    expect(reranked.map((entry) => entry.title)).toEqual(['B', 'C']);
  });

  it('HIBA esetén a vektorsorrend marad, -1 pontszámmal', async () => {
    const failing = new MockLanguageModelV4({
      doGenerate: (async () => {
        throw new Error('rate limit');
      }) as never,
    });
    const hits = [hit(0, 'A', 0.2), hit(1, 'B', 0.3)];

    const reranked = await rerankHits('kérdés', hits, 5, { model: failing });

    expect(reranked.map((entry) => entry.title)).toEqual(['A', 'B']);
    expect(reranked.every((entry) => entry.score === -1)).toBe(true);
  });

  /**
   * RÉSZLEGES PONTOZÁS (a #6 PR review 6. tétele). Ha a modell nem pontoz minden
   * indexet, a nem pontozott találat korábban `?? 0`-t kapott — vagyis a kód azt
   * SZÍNLELTE, hogy a modell 0-ra értékelte. A kettő nem ugyanaz: a „nem pontozott"
   * ismeretlen, nem elutasított. Mostantól -1 (ugyanaz a jel, amit a reranker-hiba
   * ága használ, és amit a Trace „nincs pontszám"-ként kezel), és a vektorsorrend
   * mögöttük megmarad.
   */
  it('a NEM pontozott találat -1-et kap, nem hamis 0-t', async () => {
    const hits = [
      hit(0, 'Első', 0.2),
      hit(1, 'Második', 0.3),
      hit(2, 'Harmadik', 0.4),
    ];
    // A modell CSAK a 2-es indexet pontozza.
    const model = scoringModel([{ index: 2, score: 7 }]);

    const result = await rerankHits('kérdés', hits, 5, { model });

    expect(result[0]?.title).toBe('Harmadik');
    expect(result[0]?.score).toBe(7);
    // A pontozatlanok NEM 0-t kapnak — a Trace így nem ír rájuk hamis "0/10"-et.
    expect(result[1]?.score).toBe(-1);
    expect(result[2]?.score).toBe(-1);
  });

  it('a pontozatlanok között a VEKTORSORREND marad', async () => {
    const hits = [
      hit(0, 'Közelebbi', 0.2),
      hit(1, 'Távolabbi', 0.5),
      hit(2, 'Pontozott', 0.9),
    ];
    const model = scoringModel([{ index: 2, score: 3 }]);

    const result = await rerankHits('kérdés', hits, 5, { model });

    expect(result.map((entry) => entry.title)).toEqual([
      'Pontozott',
      'Közelebbi',
      'Távolabbi',
    ]);
  });

  it('üres találatlistánál meg sem hívja a modellt', async () => {
    const doGenerate = vi.fn();
    const model = new MockLanguageModelV4({ doGenerate: doGenerate as never });

    const reranked = await rerankHits('kérdés', [], 5, { model });

    expect(reranked).toEqual([]);
    expect(doGenerate).not.toHaveBeenCalled();
  });
});
