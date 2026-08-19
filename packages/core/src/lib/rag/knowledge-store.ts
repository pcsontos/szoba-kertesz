import pg from 'pg';
import { z } from 'zod';
import { EMBEDDING_DIMENSIONS } from './embed.js';

// knowledge-store.ts — a VEKTOR ADATBÁZIS. Nálunk ez nem külön termék: a MEGLÉVŐ Postgres,
// bekapcsolt `pgvector` bővítménnyel. Egy tábla, egy extra oszloptípus — ennyi.
//
//   knowledge_chunks(id, source, title, category, chunk_index, content, embedding vector(1536))
//
// A KERESÉS maga egy SQL, és pont ettől érthető:
//
//   SELECT content, embedding <=> $1 AS distance FROM knowledge_chunks ORDER BY distance LIMIT 5
//
// A `<=>` a KOSZINUSZ-TÁVOLSÁG operátor. 0 = ugyanaz az irány (jelentésben azonos),
// 1 = merőleges (semmi köze), 2 = ellentétes. A gyakorlatban 0.2 alatt "nagyon jó találat",
// 0.5 fölött "már nem erről szól". Az ORDER BY + LIMIT = a "top-K" keresés. Nincs több varázslat.
//
// INDEX: kis korpusznál (nálunk ~2000 chunk) a Postgres végigméri az összeset, és ez gyors.
// Nagy korpusznál kell közelítő index (IVFFlat / HNSW): cserébe a pontosságból enged egy kicsit.
//
// KAPCSOLAT: ez a modul az ADMIN kapcsolaton (DATABASE_URL) dolgozik, keresésre és írásra
// egyaránt — a katalógus (products) szerep-szétválasztása (szoba-kertesz_ro / _rw) a
// tudásbázisra NEM terjed ki. Tudatos döntés (lásd a plan „Tervezési időben feloldott
// döntések" 2. pontját). A `loadConfig()`-ot SZÁNDÉKOSAN nem használjuk: az a függvény a
// DATABASE_URL-t nem ismeri, és ez így is marad.

const { Pool } = pg;
const STATEMENT_TIMEOUT_MS = 10_000;

const EnvSchema = z.object({ DATABASE_URL: z.string().min(1) });

let pool: pg.Pool | null = null;

function getPool(): pg.Pool {
  if (!pool) {
    const parsed = EnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        'Hiányzó DATABASE_URL — a tudásbázis (knowledge_chunks) ezen a kapcsolaton érhető el.',
      );
    }
    pool = new Pool({
      connectionString: parsed.data.DATABASE_URL,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      application_name: 'szoba-kertesz-knowledge',
      max: 4,
    });
  }
  return pool;
}

export interface KnowledgeChunkInput {
  source: string;
  title: string;
  category: string;
  chunkIndex: number;
  content: string;
  embedding: number[];
}

export interface KnowledgeHit {
  id: number;
  source: string;
  title: string;
  category: string;
  chunkIndex: number;
  content: string;
  /** Koszinusz-távolság: 0 = azonos jelentés, 1 = semmi köze. Ezt mutatjuk a Trace-ben. */
  distance: number;
}

/** A pgvector a vektort '[0.1,0.2,...]' alakú SZÖVEGKÉNT várja, nem tömbként. */
function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Üríti a tudásbázist — az újraindexelés (frissítés) első lépése.
 * FIGYELEM: TRUNCATE. Csak a betöltő szkript hívja (apps/cli/src/ingest-knowledge.ts).
 */
export async function clearKnowledge(): Promise<void> {
  await getPool().query('TRUNCATE knowledge_chunks RESTART IDENTITY');
}

/** Chunkok beírása (kötegelten, egyetlen INSERT-tel). */
export async function insertChunks(
  chunks: KnowledgeChunkInput[],
): Promise<number> {
  if (chunks.length === 0) {
    return 0;
  }

  const values: unknown[] = [];
  const rows = chunks.map((chunk, index) => {
    const base = index * 6;
    values.push(
      chunk.source,
      chunk.title,
      chunk.category,
      chunk.chunkIndex,
      chunk.content,
      toVectorLiteral(chunk.embedding),
    );
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6})`;
  });

  const result = await getPool().query(
    `INSERT INTO knowledge_chunks (source, title, category, chunk_index, content, embedding)
     VALUES ${rows.join(', ')}`,
    values,
  );
  return result.rowCount ?? 0;
}

/**
 * A KERESÉS: kérdés-vektor → a K legközelebbi chunk, távolsággal együtt.
 * Ez az EGYETLEN hely, ahol a "vektorkeresés" történik — egy SQL, semmi több.
 */
export async function searchChunks(
  queryEmbedding: number[],
  topK: number,
): Promise<KnowledgeHit[]> {
  if (queryEmbedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `A kérdés-vektor ${queryEmbedding.length} dimenziós, a tábla ${EMBEDDING_DIMENSIONS}-ot vár. ` +
        'Ugyanazzal a modellel kell embeddelni a kérdést és a dokumentumokat!',
    );
  }

  const result = await getPool().query(
    `SELECT id, source, title, category, chunk_index, content,
            embedding <=> $1 AS distance
       FROM knowledge_chunks
      ORDER BY distance
      LIMIT $2`,
    [toVectorLiteral(queryEmbedding), topK],
  );

  return result.rows.map((row) => ({
    id: row.id as number,
    source: row.source as string,
    title: row.title as string,
    category: row.category as string,
    chunkIndex: row.chunk_index as number,
    content: row.content as string,
    distance: Number(row.distance),
  }));
}

export interface KnowledgeSource {
  source: string;
  title: string;
  category: string;
  chunkCount: number;
  totalChars: number;
}

/** Debug: milyen dokumentumok vannak a tudásbázisban, hány darabban. */
export async function listSources(): Promise<KnowledgeSource[]> {
  const result = await getPool().query(
    `SELECT source, MIN(title) AS title, MIN(category) AS category,
            COUNT(*)::int AS chunk_count, SUM(LENGTH(content))::int AS total_chars
       FROM knowledge_chunks
      GROUP BY source
      ORDER BY MIN(title)`,
  );
  return result.rows.map((row) => ({
    source: row.source as string,
    title: row.title as string,
    category: row.category as string,
    chunkCount: row.chunk_count as number,
    totalChars: row.total_chars as number,
  }));
}

export interface StoredChunk {
  id: number;
  source: string;
  title: string;
  category: string;
  chunkIndex: number;
  content: string;
  chars: number;
}

/** Debug: a chunkok kiöntése (opcionálisan egy dokumentumra szűrve). */
export async function listChunks(
  options: { source?: string; limit?: number } = {},
): Promise<StoredChunk[]> {
  const limit = options.limit ?? 1000;
  const where = options.source ? 'WHERE source = $1' : '';
  const params = options.source ? [options.source, limit] : [limit];
  const limitPlaceholder = options.source ? '$2' : '$1';

  const result = await getPool().query(
    `SELECT id, source, title, category, chunk_index, content
       FROM knowledge_chunks
       ${where}
      ORDER BY title, chunk_index
      LIMIT ${limitPlaceholder}`,
    params,
  );

  return result.rows.map((row) => ({
    id: row.id as number,
    source: row.source as string,
    title: row.title as string,
    category: row.category as string,
    chunkIndex: row.chunk_index as number,
    content: row.content as string,
    chars: (row.content as string).length,
  }));
}

/** A pool lezárása — a CLI-szkriptek és a tesztek végén, hogy a folyamat ne lógjon. */
export async function closeKnowledgePool(): Promise<void> {
  if (pool) {
    const closing = pool;
    pool = null;
    await closing.end();
  }
}
