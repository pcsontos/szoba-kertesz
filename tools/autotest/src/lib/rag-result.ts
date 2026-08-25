// rag-result.ts — a RAG-mérés TISZTA számításai és a futás-fájl alakja. Az LLM-hívások a
// rag-eval.ts-ben vannak; itt csak az, ami API nélkül tesztelhető.
import { z } from 'zod';

export function cosineSim(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < a.length; index++) {
    const x = a[index] ?? 0;
    const y = b[index] ?? 0;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  return normA === 0 || normB === 0 ? 0 : dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Állításokra bontás a claim-szintű metrikákhoz: kódblokk ki, sor- ÉS mondathatár, markerek le. */
export function splitClaims(text: string): string[] {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\n+|(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/^[#>\-*\d.\s]+/, '').trim())
    .filter((sentence) => sentence.length > 15);
}

/**
 * Context precision RANGSOR-ÉRZÉKENYEN: nem az számít, hány chunk releváns, hanem hogy ELÖL
 * vannak-e. Egy jó retrieval a legjobbat teszi elsőnek.
 */
export function contextPrecisionScore(relevantFlags: readonly boolean[]): number {
  let hits = 0;
  let sum = 0;
  relevantFlags.forEach((relevant, index) => {
    if (relevant) {
      hits++;
      sum += hits / (index + 1); // precision@(index+1)
    }
  });
  return hits === 0 ? 0 : sum / hits;
}

/**
 * A metrika NULL, ha nem sikerült megmérni (a judge kétszer sem adott parse-olható választ).
 * A 0 mérési eredménynek látszana — ez a lecke egyik fő tanulsága.
 */
const MetricSchema = z.number().nullable();

const ChunkSchema = z.object({
  title: z.string(),
  source: z.string(),
  distance: z.number(),
  /** Kérdés↔chunk koszinusz — MINDIG kiírjuk: ez mutatja, miért nem elég egy fix küszöb. */
  sim: z.number(),
  relevant: z.boolean(),
  reason: z.string(),
});

const RagCaseResultSchema = z.object({
  id: z.string(),
  question: z.string(),
  groundTruth: z.string(),
  answer: z.string(),
  chunks: z.array(ChunkSchema),
  metrics: z.object({
    contextPrecision: MetricSchema,
    contextRecall: MetricSchema,
    faithfulness: MetricSchema,
    answerRelevancy: MetricSchema,
    answerCorrectness: MetricSchema,
    /** Kevesebb a jobb: 0 = robusztus, 1 = a zaj félrevitte. */
    noiseSensitivity: MetricSchema,
  }),
  latencyMs: z.number(),
  tokens: z.number(),
});

export const RagRunSchema = z.object({
  startedAt: z.string(),
  judgeModel: z.string(),
  answerModel: z.string(),
  cases: z.array(RagCaseResultSchema),
});

export type RagChunk = z.infer<typeof ChunkSchema>;
export type RagCaseResult = z.infer<typeof RagCaseResultSchema>;
export type RagRun = z.infer<typeof RagRunSchema>;
export type MetricName = keyof RagCaseResult['metrics'];

/** A hat metrika sorrendje és emberi neve — a riport ebből épül. */
export const METRIC_LABELS: readonly { readonly key: MetricName; readonly label: string }[] = [
  { key: 'faithfulness', label: 'faithfulness — a válasz a forrásokból következik' },
  { key: 'answerRelevancy', label: 'answer relevancy — a kérdésre felel' },
  { key: 'answerCorrectness', label: 'answer correctness — egyezik a referenciával' },
  { key: 'contextPrecision', label: 'context precision — a behozott chunkok relevánsak' },
  { key: 'contextRecall', label: 'context recall — a kellő tények bekerültek' },
  {
    key: 'noiseSensitivity',
    label: 'noise sensitivity — zajra hallucinál (kevesebb a jobb)',
  },
];

/** Egy metrika átlaga a NEM-NULL eseteken. NULL, ha egyet sem sikerült megmérni. */
export function averageMetric(run: RagRun, metric: MetricName): number | null {
  const values = run.cases
    .map((entry) => entry.metrics[metric])
    .filter((value): value is number => value !== null);
  return values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}
