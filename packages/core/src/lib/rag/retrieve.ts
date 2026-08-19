import { traceLog } from '../trace.js';
import { embedText } from './embed.js';
import { hypotheticalAnswer } from './hyde.js';
import { rerankHits, type RerankedHit } from './rerank.js';
import { searchChunks, type KnowledgeHit } from './knowledge-store.js';

// retrieve.ts — A RAG "R"-je: a KERESÉS teljes folyamata, egy helyen, lépésről lépésre.
// Ez a fájl a tananyag térképe is: minden sor egy tanítható lépés, és MINDEGYIK kiírja magát
// a konzolra (traceLog), hogy a chat mellett élőben lássuk, mi történik.
//
//   kérdés
//     └─(1) HyDE: kitalált válasz (opcionális) ─────────► amit valójában keresünk
//           └─(2) embedding: szöveg → 1536 szám
//                 └─(3) pgvector: a K legközelebbi chunk + TÁVOLSÁG
//                       └─(4) rerank: kis modell átrangsorol (opcionális)
//                             └─(5) kontextus: a megmaradt chunkok + FORRÁS → a nagy modellnek
//
// A lépések INJEKTÁLHATÓK (RetrieveDeps) — alapból a valódi út fut, a specek viszont
// API és DB nélkül tudják bizonyítani a sorrendet. Ugyanaz a minta, mint a többi toolnál.

/** Ennyit hozunk be a vektorkeresésből, ha reranking van: tág háló, hogy legyen mit rangsorolni. */
export const WIDE_NET = 20;
/** Ennyi chunk megy be végül a modellnek. */
export const KEEP_TOP = 5;

export interface RetrieveOptions {
  /** Hipotetikus válasz generálása kereséshez (HyDE). Alap: be. */
  useHyde?: boolean;
  /** Átrangsorolás kis modellel. Alap: be. */
  useRerank?: boolean;
  /** Hány chunk menjen végül a modellnek. */
  topK?: number;
}

export interface RetrieveDeps {
  readonly hyde?: (question: string) => Promise<string>;
  readonly embed?: (text: string) => Promise<number[]>;
  readonly search?: (
    queryEmbedding: number[],
    topK: number,
  ) => Promise<KnowledgeHit[]>;
  readonly rerank?: (
    question: string,
    hits: KnowledgeHit[],
    keepTop: number,
  ) => Promise<RerankedHit[]>;
  /** A nyom kiírása. Tesztben néma függvény; élesben a közös watch-log. */
  readonly log?: (text: string) => void;
}

export interface RetrieveResult {
  hits: RerankedHit[];
  /** Amit valójában embeddeltünk (a kérdés, vagy a HyDE-válasz) — a demóban ezt is mutatjuk. */
  searchText: string;
}

// ── Színes, olvasható kiírás. Ugyanabba a control-room logba megy, mint a többi trace. ──

function bar(distance: number): string {
  // 0.0 = tökéletes találat, 0.6+ = gyenge. 20 karakteres sáv, hogy szemre is látszódjon.
  const filled = Math.max(0, Math.min(20, Math.round((1 - distance) * 20)));
  return '█'.repeat(filled) + '░'.repeat(20 - filled);
}

function logHits(
  log: (text: string) => void,
  label: string,
  hits: readonly KnowledgeHit[],
): void {
  log(`\x1b[36m${label}\x1b[0m`);
  for (const hit of hits) {
    const distance = hit.distance.toFixed(3);
    const rerankScore = (hit as RerankedHit).score;
    const score =
      typeof rerankScore === 'number' && rerankScore >= 0
        ? ` \x1b[33mrerank:${rerankScore}/10\x1b[0m`
        : '';
    log(
      `   \x1b[2m${bar(hit.distance)}\x1b[0m dist=\x1b[32m${distance}\x1b[0m${score} ` +
        `\x1b[1m${hit.title}\x1b[0m \x1b[2m#${hit.chunkIndex} · ${hit.content.length} kar\x1b[0m`,
    );
  }
}

/**
 * A teljes retrieval. A visszaadott chunkok FORRÁSSAL együtt mennek — a válaszban
 * hivatkozni kell rájuk (grounding, lásd query-prompt.ts).
 */
export async function retrieveKnowledge(
  question: string,
  options: RetrieveOptions = {},
  deps: RetrieveDeps = {},
): Promise<RetrieveResult> {
  const useHyde = options.useHyde ?? true;
  const useRerank = options.useRerank ?? true;
  const topK = options.topK ?? KEEP_TOP;

  const hyde = deps.hyde ?? ((text: string) => hypotheticalAnswer(text));
  const embed = deps.embed ?? ((text: string) => embedText(text));
  const search =
    deps.search ??
    ((queryEmbedding: number[], limit: number) =>
      searchChunks(queryEmbedding, limit));
  const rerank =
    deps.rerank ??
    ((text: string, hits: KnowledgeHit[], keepTop: number) =>
      rerankHits(text, hits, keepTop));
  const log = deps.log ?? traceLog;

  log(`\x1b[35m━━ RAG ━━\x1b[0m kérdés: \x1b[1m${question}\x1b[0m`);

  // (1) HyDE — a kérdés helyett egy kitalált VÁLASZT keresünk (lásd hyde.ts).
  let searchText = question;
  if (useHyde) {
    searchText = await hyde(question);
    log(
      `\x1b[36m1) HyDE\x1b[0m (claude-haiku-4-5) — ezt keressük a kérdés helyett:\n   \x1b[2m${searchText.replace(/\s+/g, ' ').slice(0, 220)}…\x1b[0m`,
    );
  }

  // (2) Embedding — szöveg → 1536 szám. A kérdést UGYANAZZAL a modellel, mint a dokumentumokat.
  const queryEmbedding = await embed(searchText);
  const preview = queryEmbedding
    .slice(0, 5)
    .map((value) => value.toFixed(3))
    .join(', ');
  log(
    `\x1b[36m2) embedding\x1b[0m — ${queryEmbedding.length} dimenzió: \x1b[2m[${preview}, …]\x1b[0m`,
  );

  // (3) Vektorkeresés — egy SQL, koszinusz-távolsággal (lásd knowledge-store.ts).
  const wideNet = useRerank ? WIDE_NET : topK;
  const hits = await search(queryEmbedding, wideNet);
  logHits(
    log,
    `3) pgvector — a ${hits.length} legközelebbi chunk (embedding <=> query, kisebb = jobb):`,
    hits,
  );

  if (hits.length === 0) {
    log('\x1b[31m   nincs találat — üres a tudásbázis?\x1b[0m');
    return { hits: [], searchText };
  }

  // (4) Rerank — a kis modell elolvassa és átrangsorolja a tág hálót (lásd rerank.ts).
  if (!useRerank) {
    return {
      hits: hits.slice(0, topK).map((hit) => ({ ...hit, score: -1 })),
      searchText,
    };
  }

  const reranked = await rerank(question, hits, topK);
  logHits(
    log,
    `4) rerank (claude-haiku-4-5) — a ${topK} legjobb a ${hits.length}-ből, ÚJ sorrendben:`,
    reranked,
  );

  // (5) Ennyi szöveg megy be a nagy modell kontextusába — ez pénz, ezért számoljuk.
  const chars = reranked.reduce((sum, hit) => sum + hit.content.length, 0);
  log(
    `\x1b[36m5) kontextus\x1b[0m — ${reranked.length} chunk, ${chars} karakter (~${Math.round(chars / 4)} token) megy a modellnek`,
  );

  return { hits: reranked, searchText };
}
