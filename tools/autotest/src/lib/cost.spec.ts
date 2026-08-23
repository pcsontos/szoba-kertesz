import { describe, expect, it } from 'vitest';
import { costUsd, formatUsd } from './cost.js';

describe('costUsd', () => {
  it('a mért tipikus katalógus-kérdést a Sonnet listaárával számolja', () => {
    // Mérve a logs/*.jsonl-ből: 8000 input / 120 output.
    // 8000 * 3/1e6 = 0.024 ; 120 * 15/1e6 = 0.0018
    expect(costUsd('claude-sonnet-4-6', 8000, 120)).toBeCloseTo(0.0258, 6);
  });

  it('a Haiku olcsóbb ugyanazon a tokenszámon', () => {
    const sonnet = costUsd('claude-sonnet-4-6', 10_000, 1000);
    const haiku = costUsd('claude-haiku-4-5', 10_000, 1000);
    expect(haiku).toBeLessThan(sonnet);
    expect(haiku).toBeCloseTo(0.015, 6); // 10000*1/1e6 + 1000*5/1e6
  });

  it('ismeretlen modellnél NaN-t ad, nem csendes nullát', () => {
    // A csendes 0 azt hazudná, hogy a futás ingyen volt.
    expect(Number.isNaN(costUsd('gpt-nemletezo', 1000, 100))).toBe(true);
  });

  it('a formázás négy tizedesjegyű dollárt ad', () => {
    expect(formatUsd(0.0258)).toBe('$0.0258');
    expect(formatUsd(Number.NaN)).toBe('n/a');
  });
});
