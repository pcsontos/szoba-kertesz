import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import {
  WIDE_NET,
  embedText,
  listChunks,
  listSources,
  retrieveKnowledge,
  searchChunks,
  type KnowledgeHit,
  type KnowledgeSource,
  type RetrieveOptions,
  type RetrieveResult,
  type StoredChunk,
} from '@szoba-kertesz/core';

// debug-knowledge.ts — BELESÉS A RAG DOBOZÁBA. Ezek a végpontok nem a terméknek szólnak,
// hanem NEKÜNK: szétszedik a RAG-ot a két felére, hogy külön lehessen hibázni bennük.
//
//   RETRIEVAL (keresés)  ← ezek a végpontok ezt mutatják, LLM nélkül
//   GENERÁLÁS (válasz)   ← ez a /api/chat
//
// Ha rossz a válasz, ELŐSZÖR ide nézz: ha a keresés nem hozta be a jó chunkot, hiába okos a
// modell. A RAG-hibák többsége retrieval-hiba (rossz chunkolás, rossz kérdés-megfogalmazás),
// nem generálás-hiba.
//
//   GET  /debug/knowledge/sources              — milyen dokumentumok vannak, hány darabban
//   GET  /debug/knowledge/sources/:id          — EGY dokumentum, a chunkjaival, teljes szöveggel
//   GET  /debug/knowledge/chunks               — minden chunk (limit 1000)
//   GET  /debug/knowledge/chunks?search=…      — top-K keresés vektortávolsággal (nyers, LLM nélkül)
//   GET  /debug/knowledge/chunks?search=…&pipeline=full — HyDE + rerank is (mint a tool)

const DEFAULT_CHUNK_LIMIT = 1000;
const DEFAULT_TOP_K = 5;

// A `topK` a külvilágból jön → a HATÁRON validáljuk (docs/konvenciók.md).
// Validálás nélkül `Number('abc')` = NaN volt, és a `&pipeline=full` úton ez azt
// jelentette, hogy a végpont KIFIZET egy HyDE- és egy rerank-hívást, majd a
// `slice(0, NaN)` miatt ÜRES listát ad 200-cal. A felső korlát a WIDE_NET: a
// retrieve.ts úgyis ennyit hoz be a vektorkeresésből, tehát a fölötte kért érték
// korábban CSENDBEN csonkult — most inkább megmondjuk.
const TopKSchema = z.coerce.number().int().min(1).max(WIDE_NET);

/** A hibából MAGYAR mondat lesz, nem nyers String(error) — stack trace nélkül. */
function failure(action: string, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error);
  return `Nem sikerült ${action}: ${detail}`;
}

export interface DebugKnowledgeDeps {
  readonly listSources?: () => Promise<KnowledgeSource[]>;
  readonly listChunks?: (options?: {
    source?: string;
    limit?: number;
  }) => Promise<StoredChunk[]>;
  readonly retrieve?: (
    question: string,
    options?: RetrieveOptions,
  ) => Promise<RetrieveResult>;
  readonly embed?: (text: string) => Promise<number[]>;
  readonly search?: (
    queryEmbedding: number[],
    topK: number,
  ) => Promise<KnowledgeHit[]>;
}

/** A dokumentum-azonosító a forrás-URL utolsó szelete (pl. "bug-off-fungus-gnats"). */
function sourceIdOf(source: string): string {
  return source.replace(/\/$/, '').split('/').pop() ?? source;
}

export function createDebugKnowledgeRouter(
  deps: DebugKnowledgeDeps = {},
): ExpressRouter {
  const sources = deps.listSources ?? listSources;
  const chunks = deps.listChunks ?? listChunks;
  const retrieve =
    deps.retrieve ??
    ((question: string, options?: RetrieveOptions) =>
      retrieveKnowledge(question, options));
  const embed = deps.embed ?? ((text: string) => embedText(text));
  const search =
    deps.search ??
    ((queryEmbedding: number[], topK: number) =>
      searchChunks(queryEmbedding, topK));

  const router = Router();

  router.get('/sources', async (_req, res) => {
    try {
      const all = await sources();
      res.json({
        count: all.length,
        totalChunks: all.reduce((sum, entry) => sum + entry.chunkCount, 0),
        sources: all.map((entry) => ({
          id: sourceIdOf(entry.source),
          title: entry.title,
          category: entry.category,
          url: entry.source,
          chunks: entry.chunkCount,
          chars: entry.totalChars,
        })),
      });
    } catch (error: unknown) {
      res
        .status(500)
        .json({ error: failure('a dokumentumokat listázni', error) });
    }
  });

  router.get('/sources/:id', async (req, res) => {
    try {
      const all = await sources();
      const match = all.find(
        (entry) => sourceIdOf(entry.source) === req.params.id,
      );
      if (!match) {
        res
          .status(404)
          .json({ error: `Nincs ilyen dokumentum: ${req.params.id}` });
        return;
      }

      const stored = await chunks({ source: match.source });
      res.json({
        id: req.params.id,
        title: match.title,
        category: match.category,
        url: match.source,
        chunkCount: stored.length,
        // A teljes dokumentum, ahogy a darabok összeállnak — így LÁTSZIK, hol vágtunk.
        fullText: stored.map((chunk) => chunk.content).join('\n\n'),
        chunks: stored.map((chunk) => ({
          id: chunk.id,
          index: chunk.chunkIndex,
          chars: chunk.chars,
          content: chunk.content,
        })),
      });
    } catch (error: unknown) {
      res
        .status(500)
        .json({ error: failure('a dokumentumot beolvasni', error) });
    }
  });

  router.get('/chunks', async (req, res) => {
    const query =
      typeof req.query['search'] === 'string' ? req.query['search'] : '';
    const full = req.query['pipeline'] === 'full';

    // A validálás a FIZETŐS ág ELŐTT fut: rossz topK-ra egyetlen hívás sem indul.
    const parsedTopK = TopKSchema.safeParse(req.query['topK'] ?? DEFAULT_TOP_K);
    if (!parsedTopK.success) {
      res.status(400).json({
        error: `A topK egész szám kell legyen 1 és ${WIDE_NET} között (kapott: ${String(req.query['topK'])}).`,
      });
      return;
    }
    const topK = parsedTopK.data;

    try {
      // Keresés nélkül: minden chunk kiöntése (limit 1000).
      if (query === '') {
        const stored = await chunks({ limit: DEFAULT_CHUNK_LIMIT });
        res.json({
          count: stored.length,
          limit: DEFAULT_CHUNK_LIMIT,
          chunks: stored,
        });
        return;
      }

      // Keresés + TELJES pipeline (HyDE + vektor + rerank) — ugyanaz, amit a tool futtat.
      if (full) {
        const { hits, searchText } = await retrieve(query, { topK });
        res.json({
          query,
          pipeline:
            'HyDE → embedding → pgvector (20) → rerank (claude-haiku-4-5) → top-K',
          hypotheticalAnswer: searchText,
          hits: hits.map((hit) => ({
            title: hit.title,
            source: hit.source,
            distance: Number(hit.distance.toFixed(4)),
            rerankScore: hit.score,
            chars: hit.content.length,
            content: hit.content,
          })),
        });
        return;
      }

      // NYERS vektorkeresés: csak embedding + távolság. Ez a "mit tud a puszta vektor" nézet.
      const queryEmbedding = await embed(query);
      const hits = await search(queryEmbedding, topK);
      res.json({
        query,
        pipeline: 'embedding → pgvector (nyers vektortávolság, rerank nélkül)',
        embeddingDimensions: queryEmbedding.length,
        embeddingPreview: queryEmbedding
          .slice(0, 8)
          .map((value) => Number(value.toFixed(4))),
        hits: hits.map((hit) => ({
          title: hit.title,
          source: hit.source,
          distance: Number(hit.distance.toFixed(4)),
          chars: hit.content.length,
          content: hit.content,
        })),
      });
    } catch (error: unknown) {
      res.status(500).json({ error: failure('a keresést lefuttatni', error) });
    }
  });

  return router;
}
