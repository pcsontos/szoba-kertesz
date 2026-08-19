import { embed, embedMany, type EmbeddingModel } from 'ai';
import { createOpenAI, type OpenAIProvider } from '@ai-sdk/openai';
import { loadConfig, type Config } from '../config.js';

// embed.ts — a VEKTORIZÁLÁS. Szöveg → számok listája.
//
// MI EZ VALÓJÁBAN? Egy modell, ami minden szöveghez egy pontot rendel egy sok-dimenziós térben
// (nálunk 1536 dimenzió). A tanítása során az kerül EGYMÁS MELLÉ, ami HASONLÓAN HASZNÁLT —
// tehát nem a betűk hasonlítanak, hanem a JELENTÉS. "yellow leaves" és "leaves turning yellow"
// szinte ugyanaz a pont, pedig más a szórend; "yellow leaves" és "gift card" nagyon távol van.
//
// EZÉRT működik a keresés: a KÉRDÉST is ugyanezzel a modellel vektorizáljuk, és megnézzük,
// melyik chunk pontja van hozzá a legközelebb. Nincs kulcsszó-egyezés, nincs SQL LIKE — távolság.
//
// FONTOS: a kérdést és a dokumentumokat UGYANAZZAL a modellel kell embeddelni, különben nem
// összemérhetők (más a tér). Ha modellt váltasz, újra kell vektorizálni az EGÉSZ tudásbázist.
//
// EZ AZ EGYETLEN nem-Anthropic hívás a rendszerben: a HyDE és a reranker Claude Haikun megy
// (lásd hyde.ts / rerank.ts), embedding-modellt viszont az Anthropic nem ad.

const MODEL = 'text-embedding-3-small'; // 1536 dimenzió, olcsó: ~1 cent / 500 ezer token
export const EMBEDDING_DIMENSIONS = 1536;

export interface EmbedDeps {
  /** Teszt-szeam: kész embedding-modell (pl. `MockEmbeddingModelV4`) a valódi provider helyett. */
  readonly model?: EmbeddingModel;
  readonly config?: Config;
}

let provider: OpenAIProvider | null = null;

function resolveModel(deps: EmbedDeps): EmbeddingModel {
  if (deps.model) {
    return deps.model;
  }

  const apiKey = (deps.config ?? loadConfig()).openaiApiKey;
  if (!apiKey) {
    throw new Error(
      'Hiányzó OPENAI_API_KEY — a tudásbázis keresése (searchKnowledge) OpenAI embedding-modellt ' +
        'használ. Vedd fel a kulcsot a .env-be. A katalógus-kérdések (runSql, listCategories) enélkül is működnek.',
    );
  }

  if (!provider) {
    provider = createOpenAI({ apiKey });
  }
  return provider.textEmbeddingModel(MODEL);
}

/** Egy szöveg → egy vektor. Ezt hívjuk minden KÉRDÉSNÉL. */
export async function embedText(
  text: string,
  deps: EmbedDeps = {},
): Promise<number[]> {
  const { embedding } = await embed({ model: resolveModel(deps), value: text });
  return embedding;
}

/** Sok szöveg → sok vektor, egy hívásban (a tudásbázis feltöltésekor ez a gyors út). */
export async function embedBatch(
  texts: string[],
  deps: EmbedDeps = {},
): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: resolveModel(deps),
    values: texts,
  });
  return embeddings;
}
