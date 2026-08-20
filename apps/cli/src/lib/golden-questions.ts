import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { findRepoPath } from './repo-root.js';

// golden-questions.ts — a golden set kérdései. A fájl VERZIÓKÖVETETT (seed/golden-set.json),
// mert a mérés csak akkor összehasonlítható két futás között, ha ugyanaz a kérdéslista fut.
//
// A `kind` nem dísz:
//   thematic — a domain valódi kérdései, magyarul (ez a termék tényleges útja)
//   control  — ANGOL kontroll: itt a nyelvi szakadék nulla, tehát a nyers/teljes különbség
//              TISZTÁN a HyDE és a rerank érdeme, nem a fordításé
//   negative — olyan téma, amiről a korpusz nem szól: a grounding próbája

const QuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  language: z.enum(['hu', 'en']),
  kind: z.enum(['thematic', 'control', 'negative']),
  why: z.string().min(1),
});

const GoldenSetSchema = z.array(QuestionSchema).min(1);

export type GoldenQuestion = z.infer<typeof QuestionSchema>;

/** Validálás a rendszerhatáron: elgépelt `kind` ne fusson végig 16 fizetős hívásig. */
export function parseGoldenSet(raw: unknown): GoldenQuestion[] {
  return GoldenSetSchema.parse(raw);
}

export function loadGoldenSet(): GoldenQuestion[] {
  const path = findRepoPath('seed', 'golden-set.json');
  return parseGoldenSet(JSON.parse(readFileSync(path, 'utf8')));
}
