import { describe, expect, it } from 'vitest';
import {
  averageMetric,
  contextPrecisionScore,
  cosineSim,
  judgedRatio,
  RagRunSchema,
  splitClaims,
  type RagRun,
} from './rag-result.js';

describe('cosineSim', () => {
  it('azonos vektorra 1', () => {
    expect(cosineSim([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 6);
  });

  it('merőleges vektorra 0', () => {
    expect(cosineSim([1, 0], [0, 1])).toBeCloseTo(0, 6);
  });

  it('nulla hosszú vektorra 0, nem NaN', () => {
    expect(cosineSim([0, 0], [1, 1])).toBe(0);
  });
});

describe('splitClaims', () => {
  it('mondathatáron bont', () => {
    const claims = splitClaims(
      'A kígyónövény ritkán öntözendő. A túlöntözés gyökérrothadást okoz.',
    );
    expect(claims).toHaveLength(2);
  });

  it('a rövid törmeléket eldobja', () => {
    expect(splitClaims('Igen. Nem.')).toEqual([]);
  });

  it('a markdown-markereket leszedi a mondat elejéről', () => {
    const claims = splitClaims('- A kígyónövény kevés vizet igényel télen is.');
    expect(claims[0]?.startsWith('-')).toBe(false);
  });

  it('a kódblokkot kihagyja', () => {
    const claims = splitClaims(
      '```\nSELECT 1;\n```\nA növény kevés vizet igényel télen is.',
    );
    expect(claims.join(' ')).not.toContain('SELECT');
  });
});

describe('contextPrecisionScore — rangsor-érzékeny', () => {
  it('minden chunk releváns → 1', () => {
    expect(contextPrecisionScore([true, true, true])).toBeCloseTo(1, 6);
  });

  it('egy sem releváns → 0', () => {
    expect(contextPrecisionScore([false, false])).toBe(0);
  });

  it('az ELÖL lévő releváns chunk többet ér, mint a hátul lévő', () => {
    expect(contextPrecisionScore([true, false, false])).toBeGreaterThan(
      contextPrecisionScore([false, false, true]),
    );
  });

  it('üres listára 0, nem NaN', () => {
    expect(contextPrecisionScore([])).toBe(0);
  });
});

function runWith(metrics: Partial<RagRun['cases'][number]['metrics']>): RagRun {
  return {
    startedAt: '2026-08-25T10:00:00.000Z',
    judgeModel: 'claude-haiku-4-5',
    answerModel: 'claude-sonnet-4-6',
    cases: [
      {
        id: 'a',
        question: 'k',
        groundTruth: 'g',
        answer: 'v',
        chunks: [],
        metrics: {
          contextPrecision: 1,
          contextRecall: 1,
          faithfulness: 1,
          answerRelevancy: 1,
          answerCorrectness: 1,
          noiseSensitivity: 0,
          ...metrics,
        },
        latencyMs: 1000,
        tokens: 5000,
      },
    ],
  };
}

describe('RagRunSchema', () => {
  it('a null metrikát elfogadja (nem mért ≠ nulla)', () => {
    const parsed = RagRunSchema.parse(runWith({ contextRecall: null }));
    expect(parsed.cases[0]?.metrics.contextRecall).toBeNull();
  });

  it('a hiányzó metrikát elutasítja', () => {
    const broken = runWith({}) as unknown as { cases: { metrics: Record<string, unknown> }[] };
    delete broken.cases[0]!.metrics['faithfulness'];
    expect(() => RagRunSchema.parse(broken)).toThrow();
  });
});

describe('judgedRatio', () => {
  it('a true-k arányát adja', () => {
    expect(
      judgedRatio([
        { flag: true, reason: '' },
        { flag: false, reason: '' },
      ]),
    ).toBe(0.5);
  });

  it('null be → null ki', () => {
    expect(judgedRatio(null)).toBeNull();
  });

  it('ÜRES tömbre NULL, nem 0', () => {
    // A #10 PR-review 8. tétele: nulla állításnál a 0 faithfulness-t és 1.00 noise-t adott —
    // a legrosszabb értékeket, MÉRÉSI EREDMÉNYKÉNT. Nulla állítás hiányzó mérés, nem rossz.
    expect(judgedRatio([])).toBeNull();
  });
});

describe('averageMetric', () => {
  it('a nem-null értékek átlagát adja', () => {
    const run = runWith({});
    run.cases.push({ ...run.cases[0]!, id: 'b', metrics: { ...run.cases[0]!.metrics, faithfulness: 0.5 } });
    expect(averageMetric(run, 'faithfulness')).toBeCloseTo(0.75, 6);
  });

  it('csupa null esetén NULL, nem 0', () => {
    // A 0 azt hazudná, hogy mértük és rossz lett.
    expect(averageMetric(runWith({ faithfulness: null }), 'faithfulness')).toBeNull();
  });
});
