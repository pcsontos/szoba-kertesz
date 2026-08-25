import { describe, expect, it } from 'vitest';
import { renderBatteryMarkdown } from './battery-markdown.js';
import type { BatteryRun } from './battery-result.js';

const run: BatteryRun = {
  startedAt: '2026-08-25T10:00:00.000Z',
  web: 'http://localhost:4200',
  results: [
    {
      tier: '1 — Single-step',
      id: 'single-count',
      q: 'Hány növény van?',
      ms: 4200,
      ttfcMs: 1100,
      tokens: 8120,
      costUsd: 0.0258,
      answer: '30 növény van.',
      flags: [],
      verdict: { accepted: true, reason: 'ELFOGADVA — …' },
    },
    {
      tier: '7 — Buktató',
      id: 'trap-avg-price',
      q: 'Mennyi az átlagár?',
      ms: 9000,
      ttfcMs: null,
      tokens: null,
      costUsd: null,
      answer: '',
      flags: ['ÜRES VÁLASZ'],
      truth: 'Az effektív átlag 5169 Ft.',
      verdict: { accepted: false, reason: 'ELUTASÍTVA — üres válasz…' },
    },
  ],
  consistency: [],
};

describe('renderBatteryMarkdown', () => {
  it('kiírja az összefoglaló számokat', () => {
    const markdown = renderBatteryMarkdown(run);
    expect(markdown).toContain('**2**');
    expect(markdown).toContain('1 bukott');
  });

  it('a null TTFC-t „n/a"-ként írja, nem 0-ként', () => {
    // A 0 azt hazudná, hogy azonnal jött válasz.
    const markdown = renderBatteryMarkdown(run);
    expect(markdown).toContain('n/a');
    expect(markdown).not.toMatch(/\|\s*0\.0 s\s*\|/);
  });

  it('a bukott esetnél megjeleníti a helyes választ', () => {
    expect(renderBatteryMarkdown(run)).toContain('Az effektív átlag 5169 Ft.');
  });

  it('generált fájl figyelmeztetést tesz a tetejére', () => {
    expect(renderBatteryMarkdown(run)).toMatch(/Generált fájl/);
  });

  it('üres futásra sem dob, és nem ír NaN-t', () => {
    expect(renderBatteryMarkdown({ ...run, results: [] })).not.toContain('NaN');
  });

  it('az INGADOZÓ konzisztenciát kiemeli', () => {
    const markdown = renderBatteryMarkdown({
      ...run,
      consistency: [
        {
          id: 'trap-avg-price',
          question: 'Átlagár?',
          runs: 3,
          acceptedCount: 2,
          agreement: 2 / 3,
          stable: false,
          answers: ['a', 'b', 'c'],
        },
      ],
    });
    expect(markdown).toContain('INGADOZIK');
  });

  it('konzisztencia nélkül nem ír konzisztencia-szakaszt', () => {
    expect(renderBatteryMarkdown(run)).not.toContain('## Konzisztencia');
  });
});
