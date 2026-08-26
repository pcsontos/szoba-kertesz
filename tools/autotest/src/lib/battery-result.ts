// battery-result.ts — a futás-fájl ALAKJA és összegzése. Külön modul, mert KÉT szkript
// használja: a battery.ts írja, a report-html.ts olvassa. A Zod-séma azért kell, mert a
// report-html bemenete egy külső fájl — rendszerhatár.
import { z } from 'zod';
import { isFailureFlag } from './matchers.js';

const VerdictSchema = z.object({ accepted: z.boolean(), reason: z.string() });

const BatteryResultSchema = z.object({
  tier: z.string(),
  id: z.string(),
  q: z.string(),
  /** Teljes válaszidő (ms). */
  ms: z.number(),
  /** Time-to-first-chunk. NULL, ha nem érkezett szöveges válasz — SOHA nem 0 és nem NaN. */
  ttfcMs: z.number().nullable(),
  /** A szerver trace-éből összegzett token. NULL, ha nem volt olvasható. */
  tokens: z.number().nullable(),
  /**
   * Becsült költség a listaárral. A `cost.ts` ismeretlen modellnél NaN-t ad, de JSON-ban nincs
   * NaN — a battery.ts váltja `null`-ra. Mindkettő ugyanazt jelenti: NEM MÉRT, nem nulla.
   */
  costUsd: z.number().nullable(),
  answer: z.string(),
  flags: z.array(z.string()),
  truth: z.string().optional(),
  verdict: VerdictSchema,
});

const ConsistencySchema = z.object({
  id: z.string(),
  question: z.string(),
  runs: z.number(),
  acceptedCount: z.number(),
  agreement: z.number(),
  stable: z.boolean(),
  answers: z.array(z.string()),
});

export const BatteryRunSchema = z.object({
  startedAt: z.string(),
  web: z.string(),
  results: z.array(BatteryResultSchema),
  consistency: z.array(ConsistencySchema),
});

export type Verdict = z.infer<typeof VerdictSchema>;
export type BatteryResult = z.infer<typeof BatteryResultSchema>;
export type ConsistencyResult = z.infer<typeof ConsistencySchema>;
export type BatteryRun = z.infer<typeof BatteryRunSchema>;

export interface Summary {
  readonly total: number;
  readonly failed: number;
  readonly avgMs: number;
  /** NULL, ha egyetlen esetnél sem érkezett szöveges válasz. */
  readonly avgTtfcMs: number | null;
  readonly ttfcAvailable: number;
  readonly totalCostUsd: number;
  /**
   * Hány esetnél NEM sikerült költséget mérni. A `totalCostUsd` ezeket 0-ként kezeli, tehát
   * enélkül a „becsült költség $0.0000" olvasható úgy is, hogy a futás ingyen volt — pedig
   * csak a mérés hiányzott (#10 PR-review, 11. tétel).
   */
  readonly costUnknown: number;
}

export function summarize(results: readonly BatteryResult[]): Summary {
  const total = results.length;
  const failed = results.filter((entry) => entry.flags.some(isFailureFlag)).length;
  const avgMs =
    total === 0 ? 0 : Math.round(results.reduce((sum, entry) => sum + entry.ms, 0) / total);

  // A null TTFC-t KIHAGYJUK az átlagból. 0-ként átlagolva a mérés hazudna: a null azt jelenti,
  // hogy nem érkezett szöveges válasz, nem azt, hogy azonnal érkezett.
  const ttfcValues = results
    .map((entry) => entry.ttfcMs)
    .filter((value): value is number => value !== null);
  const avgTtfcMs =
    ttfcValues.length === 0
      ? null
      : Math.round(ttfcValues.reduce((sum, value) => sum + value, 0) / ttfcValues.length);

  const totalCostUsd = results.reduce(
    (sum, entry) =>
      sum + (entry.costUsd !== null && !Number.isNaN(entry.costUsd) ? entry.costUsd : 0),
    0,
  );

  const costUnknown = results.filter(
    (entry) => entry.costUsd === null || Number.isNaN(entry.costUsd),
  ).length;

  return {
    total,
    failed,
    avgMs,
    avgTtfcMs,
    ttfcAvailable: ttfcValues.length,
    totalCostUsd,
    costUnknown,
  };
}
