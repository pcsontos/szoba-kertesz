import { describe, expect, it } from 'vitest';
import { BatteryRunSchema, summarize, type BatteryResult } from './battery-result.js';

function result(overrides: Partial<BatteryResult> = {}): BatteryResult {
  return {
    tier: '1 — Single-step',
    id: 'single-count',
    q: 'Hány növény van?',
    ms: 4000,
    ttfcMs: 1200,
    tokens: 8120,
    costUsd: 0.0258,
    answer: '30 növény van.',
    flags: [],
    verdict: { accepted: true, reason: 'ELFOGADVA — …' },
    ...overrides,
  };
}

describe('summarize', () => {
  it('összeszámolja a bukott eseteket', () => {
    const summary = summarize([result(), result({ flags: ['HIBA: rossz szám'] })]);
    expect(summary.total).toBe(2);
    expect(summary.failed).toBe(1);
  });

  it('a MEGJEGYZÉS flag nem számít bukásnak', () => {
    expect(summarize([result({ flags: ['MEGJEGYZÉS: lassú'] })]).failed).toBe(0);
  });

  it('a TTFC átlagából kihagyja a null értékeket', () => {
    // A null = nem érkezett szöveges válasz. 0-ként átlagolva a mérés hazudna.
    const summary = summarize([result({ ttfcMs: 1000 }), result({ ttfcMs: null })]);
    expect(summary.avgTtfcMs).toBe(1000);
    expect(summary.ttfcAvailable).toBe(1);
  });

  it('minden TTFC null esetén az átlag null, nem NaN', () => {
    expect(summarize([result({ ttfcMs: null })]).avgTtfcMs).toBeNull();
  });

  it('a költséget összegzi, a nem mért értéket kihagyja', () => {
    const summary = summarize([result({ costUsd: 0.02 }), result({ costUsd: null })]);
    expect(summary.totalCostUsd).toBeCloseTo(0.02, 6);
  });

  it('üres listára nem oszt nullával', () => {
    const summary = summarize([]);
    expect(summary.total).toBe(0);
    expect(summary.avgMs).toBe(0);
    expect(summary.avgTtfcMs).toBeNull();
  });
});

describe('BatteryRunSchema', () => {
  it('érvényes futás-fájlt elfogad', () => {
    const parsed = BatteryRunSchema.parse({
      startedAt: '2026-08-25T10:00:00.000Z',
      web: 'http://localhost:4200',
      results: [result()],
      consistency: [],
    });
    expect(parsed.results).toHaveLength(1);
  });

  it('hiányzó results mezőt elutasít', () => {
    // A report-html.ts bemenete külső fájl — rendszerhatár, tehát validálni kell.
    expect(() =>
      BatteryRunSchema.parse({ startedAt: 'x', web: 'y', consistency: [] }),
    ).toThrow();
  });

  it('a null ttfcMs/tokens/costUsd ÉRVÉNYES (nem mért ≠ nulla)', () => {
    const parsed = BatteryRunSchema.parse({
      startedAt: 'x',
      web: 'y',
      results: [result({ ttfcMs: null, tokens: null, costUsd: null })],
      consistency: [],
    });
    expect(parsed.results[0]?.ttfcMs).toBeNull();
  });
});
