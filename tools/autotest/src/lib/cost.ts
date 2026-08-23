// cost.ts — token → dollár, a modell LISTAÁRÁVAL. Azért van külön modul, mert a battery és a
// RAG-eval is ebből számol, és mert egy elrontott ár-tábla NÉMÁN hazudna a költségről.
//
// Forrás: Anthropic listaár (2026-06-24). Ismeretlen modellnél NaN, nem 0: a csendes nulla azt
// állítaná, hogy a futás ingyen volt.

interface Price {
  /** USD / 1M input token. */
  readonly input: number;
  /** USD / 1M output token. */
  readonly output: number;
}

const PRICES: Readonly<Record<string, Price>> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** Ismeretlen modellnél NaN — a hívó dolga láthatóvá tenni, nem elrejteni. */
export function costUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const price = PRICES[model];
  if (price === undefined) {
    return Number.NaN;
  }
  return (inputTokens * price.input) / 1e6 + (outputTokens * price.output) / 1e6;
}

export function formatUsd(usd: number): string {
  return Number.isNaN(usd) ? 'n/a' : `$${usd.toFixed(4)}`;
}
