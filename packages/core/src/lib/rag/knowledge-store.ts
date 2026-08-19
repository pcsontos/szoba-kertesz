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
// KAPCSOLAT — KÉT POOL, KÉT JOG. A katalógus szerep-szétválasztása (szoba-kertesz_ro / _rw)
// a tudásbázisra IS érvényes:
//
//   OLVASÁS (searchChunks, listSources, listChunks) → DATABASE_URL_READONLY, szoba-kertesz_ro
//   ÍRÁS    (clearKnowledge, insertChunks)          → DATABASE_URL, admin
//
// MIÉRT SZÁMÍT: a keresést a VÁSÁRLÓT kiszolgáló, cors()-szal nyitott szerver hívja minden
// gondozási kérdésnél — ha az admin poolon menne, a nyilvános végpont admin-jogú kapcsolatot
// nyitna, ugyanabból a modulból, ahonnan a clearKnowledge() (TRUNCATE) is exportálva van.
// Az írás így KIZÁRÓLAG a betöltő szkript útja marad (apps/cli/src/ingest-knowledge.ts),
// és az admin kapcsolatot csak az igényli.
//
// A `_ro` szerep azért látja a táblát, mert a <ts>_db_roles migráció
// `ALTER DEFAULT PRIVILEGES … GRANT SELECT ON TABLES` sora minden később létrehozott táblára
// érvényes — mérve: SELECT megy, DELETE „permission denied for table knowledge_chunks".
//
// A `loadConfig()`-ot SZÁNDÉKOSAN nem használjuk: az a függvény a DATABASE_URL-t nem ismeri,
// és ez így is marad.

const { Pool } = pg;
const STATEMENT_TIMEOUT_MS = 10_000;

const ReadEnvSchema = z.object({ DATABASE_URL_READONLY: z.string().min(1) });
const WriteEnvSchema = z.object({ DATABASE_URL: z.string().min(1) });

let readPool: pg.Pool | null = null;
let writePool: pg.Pool | null = null;

function createPool(connectionString: string, name: string): pg.Pool {
  return new Pool({
    connectionString,
    statement_timeout: STATEMENT_TIMEOUT_MS,
    application_name: name,
    max: 4,
  });
}

/** A KERESÉS útja: read-only szerep. Ezt hívja a vásárlót kiszolgáló szerver is. */
function getReadPool(): pg.Pool {
  if (!readPool) {
    const parsed = ReadEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        'Hiányzó DATABASE_URL_READONLY — a tudásbázis KERESÉSE ezen a read-only kapcsolaton megy.',
      );
    }
    readPool = createPool(
      parsed.data.DATABASE_URL_READONLY,
      'szoba-kertesz-knowledge-ro',
    );
  }
  return readPool;
}

/** A BETÖLTÉS útja: admin. Csak az ingest-knowledge.ts jut el ide. */
function getWritePool(): pg.Pool {
  if (!writePool) {
    const parsed = WriteEnvSchema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        'Hiányzó DATABASE_URL — a tudásbázis BETÖLTÉSE (TRUNCATE + INSERT) admin kapcsolatot igényel.',
      );
    }
    writePool = createPool(
      parsed.data.DATABASE_URL,
      'szoba-kertesz-knowledge-rw',
    );
  }
  return writePool;
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
  await getWritePool().query('TRUNCATE knowledge_chunks RESTART IDENTITY');
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

  const result = await getWritePool().query(
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

  const result = await getReadPool().query(
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
  const result = await getReadPool().query(
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

  const result = await getReadPool().query(
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
  const closing = [readPool, writePool].filter(
    (candidate): candidate is pg.Pool => candidate !== null,
  );
  readPool = null;
  writePool = null;
  await Promise.all(closing.map((candidate) => candidate.end()));
}
