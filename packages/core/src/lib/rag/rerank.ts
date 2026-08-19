import { generateObject, type LanguageModel } from 'ai';
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { loadConfig, type Config } from '../config.js';
import type { KnowledgeHit } from './knowledge-store.js';

// rerank.ts — ÁTRANGSOROLÁS. Miért kell, ha már van vektortávolság?
//
// A vektortávolság OLCSÓ, de BUTA: egyetlen számba sűríti a teljes jelentést, és nem tudja,
// mit KÉRDEZTÉL. A "hogyan mentsem meg a túlöntözött monsterát?" kérdéshez a "monstera öntözése"
// chunk vektorban közel van — de a valódi válasz a "gyökérrothadás kezelése" chunkban van,
// ami vektorban távolabb esik, mert más szavakkal beszél ugyanarról a bajról.
//
// A MEGOLDÁS kétlépcsős keresés:
//   1. TÁG HÁLÓ: hozz be 20 chunkot vektortávolsággal (olcsó, gyors, elnéző).
//   2. ÁTRANGSOROLÁS: egy KIS, OLCSÓ modell elolvassa a 20 darabot a kérdés fényében,
//      és pontozza őket 0-10-ig. Ebből tartjuk meg az 5 legjobbat.
//
// Ez egyben a ROUTING legkézzelfoghatóbb esete: a rangsorolás Claude Haiku (kicsi, gyors, olcsó),
// a válasz Claude Sonnet (nagy, drága). Mindkettő azt csinálja, amiben jó.
//
// A rangsorolás `generateObject`-tel megy (Zod-sémával), nem szabad szöveggel — így a
// pontszámok garantáltan feldolgozhatók, nem kell kimenetet parse-olgatni.

const RERANK_MODEL = 'claude-haiku-4-5';
/** Ennyi karaktert adunk a modellnek darabonként — a pontozáshoz a nyitány elég. */
const PREVIEW_CHARS = 600;

// A modellnek szóló szöveg EGY BLOKKBAN — úgy szerkeszted, ahogy a modell látja.
const RERANK_PROMPT = `
Te egy kereső-átrangsoroló vagy.

Pontozd 0-10-ig, hogy az egyes részletek mennyire válaszolják meg a felhasználó kérdését.
Minden részletet pontozz, a sorszámára hivatkozva.

A magas pont KONKRÉT, a kérdésre vonatkozó választ jelent — nem témabeli rokonságot.
`.trim();

const ScoresSchema = z.object({
  scores: z.array(
    z.object({
      index: z.number().describe('A részlet sorszáma (0-tól).'),
      score: z
        .number()
        .describe('0-10: mennyire válaszolja meg EZ a részlet a kérdést.'),
    }),
  ),
});

export interface RerankedHit extends KnowledgeHit {
  /** A reranker pontszáma 0-10, vagy -1, ha a reranker kiesett. */
  score: number;
}

export interface RerankDeps {
  /** Teszt-szeam: kész modell (pl. `MockLanguageModelV4`) a valódi provider helyett. */
  readonly model?: LanguageModel;
  readonly config?: Config;
}

let provider: AnthropicProvider | null = null;

function resolveModel(deps: RerankDeps): LanguageModel {
  if (deps.model) {
    return deps.model;
  }
  const config = deps.config ?? loadConfig();
  if (!provider) {
    provider = createAnthropic({ apiKey: config.anthropicApiKey });
  }
  return provider(RERANK_MODEL);
}

/**
 * A találatok átrangsorolása a kérdés fényében, kis modellel. Hiba esetén NEM dobunk:
 * visszaadjuk az eredeti (vektortávolság szerinti) sorrendet — a retrieval sose álljon meg.
 */
export async function rerankHits(
  question: string,
  hits: KnowledgeHit[],
  keepTop: number,
  deps: RerankDeps = {},
): Promise<RerankedHit[]> {
  if (hits.length === 0) {
    return [];
  }

  const numbered = hits
    .map(
      (hit, index) =>
        `[${index}] ${hit.title}\n${hit.content.slice(0, PREVIEW_CHARS)}`,
    )
    .join('\n\n---\n\n');

  try {
    const { object } = await generateObject({
      model: resolveModel(deps),
      schema: ScoresSchema,
      system: RERANK_PROMPT,
      prompt: `KÉRDÉS: ${question}\n\nRÉSZLETEK:\n\n${numbered}`,
    });

    const scoreByIndex = new Map(
      object.scores.map((entry) => [entry.index, entry.score] as const),
    );

    // A NEM pontozott találat -1-et kap, nem 0-t: a „nem pontozott" ISMERETLEN,
    // nem elutasított — a `?? 0` azt színlelte, hogy a modell 0-ra értékelte.
    // A -1 ugyanaz a jel, amit a reranker-hiba ága használ, és amit a Trace
    // „nincs pontszám"-ként kezel (retrieve.ts logHits: score >= 0).
    // A rendezés a pontozottakat előre viszi; a pontozatlanok között a VEKTORSORREND
    // marad, mert az Array.sort stabil (ES2019 óta garantált).
    return hits
      .map((hit, index) => ({ ...hit, score: scoreByIndex.get(index) ?? -1 }))
      .sort((left, right) => {
        if (left.score < 0 && right.score < 0) {
          return 0;
        }
        if (left.score < 0) {
          return 1;
        }
        if (right.score < 0) {
          return -1;
        }
        return right.score - left.score;
      })
      .slice(0, keepTop);
  } catch {
    // A reranker kiesett (hálózat, kvóta) — a vektorsorrend így is használható.
    return hits.slice(0, keepTop).map((hit) => ({ ...hit, score: -1 }));
  }
}
