import { describe, expect, it } from 'vitest';
import { renderRagHtml } from './rag-html.js';
import type { RagRun } from './rag-result.js';

const run: RagRun = {
  startedAt: '2026-08-25T10:00:00.000Z',
  judgeModel: 'claude-haiku-4-5',
  answerModel: 'claude-sonnet-4-6',
  cases: [
    {
      id: 'rag-lowlight',
      question: 'Melyik növény bírja a kevés fényt?',
      groundTruth: 'A zamiokulkász és a kígyónövény.',
      answer: 'A zamiokulkász jó választás.',
      chunks: [
        {
          title: '10 Best Low Light Indoor Plants',
          source: 'seed/knowledge/low-light.md',
          distance: 0.28,
          sim: 0.72,
          relevant: true,
          reason: 'közvetlenül a kevés fényről szól',
        },
      ],
      metrics: {
        contextPrecision: 1,
        contextRecall: null,
        faithfulness: 0.8,
        answerRelevancy: 0.9,
        answerCorrectness: 0.85,
        noiseSensitivity: 0,
      },
      latencyMs: 12_000,
      tokens: 9000,
    },
  ],
};

describe('renderRagHtml', () => {
  it('mind a HAT metrikát megjeleníti', () => {
    const html = renderRagHtml(run);
    for (const label of [
      'faithfulness',
      'answer relevancy',
      'answer correctness',
      'context precision',
      'context recall',
      'noise sensitivity',
    ]) {
      expect(html).toContain(label);
    }
  });

  it('a NULL metrikát n/a-ként mutatja, nem 0%-ként', () => {
    // Ez a lecke egyik lényege: a nem mért érték ne látsszon rossz eredménynek.
    expect(renderRagHtml(run)).toContain('n/a');
  });

  it('kiírja a chunk↔kérdés koszinusz-értéket és a judge indoklását', () => {
    const html = renderRagHtml(run);
    expect(html).toContain('0.72');
    expect(html).toContain('közvetlenül a kevés fényről szól');
  });

  it('megnevezi a két modellt (mérés-dokumentáció)', () => {
    const html = renderRagHtml(run);
    expect(html).toContain('claude-haiku-4-5');
    expect(html).toContain('claude-sonnet-4-6');
  });

  it('önálló HTML-dokumentum', () => {
    expect(renderRagHtml(run).startsWith('<!doctype html>')).toBe(true);
  });

  it('escape-eli a válasz HTML-jét', () => {
    const html = renderRagHtml({
      ...run,
      cases: [{ ...run.cases[0]!, answer: '<script>alert(1)</script>' }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('üres eset-listára sem dob', () => {
    expect(() => renderRagHtml({ ...run, cases: [] })).not.toThrow();
  });
});
