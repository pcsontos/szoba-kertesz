import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  chunkMarkdown,
  clearKnowledge,
  closeKnowledgePool,
  embedBatch,
  insertChunks,
  type KnowledgeChunkInput,
} from '@szoba-kertesz/core';
import { parseKnowledgeDocument } from './lib/knowledge-document.js';
import { findRepoPath } from './lib/repo-root.js';

// ingest-knowledge.ts — A TUDÁSBÁZIS FELÉPÍTÉSE. Futtatás: `pnpm knowledge:ingest`
//
// A teljes pipeline, négy lépésben — pontosan az, amit egy RAG-rendszer üzemeltetése jelent:
//   1. BEOLVAS    — seed/knowledge/*.md (letöltött gondozási cikkek, forrás-URL a fejlécben)
//   2. DARABOL    — chunkMarkdown: alcím-határon, ~1000 karakter, átfedéssel
//   3. VEKTORIZÁL — embedBatch: minden darab → 1536 szám (OpenAI, kötegelten)
//   4. BEÍR       — knowledge_chunks tábla (pgvector)
//
// FRISSÍTÉS: a tudásbázis nem statikus. A bolt holnap ír egy új cikket, átírja a régit —
// ettől a te vektoraid még a tegnapi igazságot mondják. A legegyszerűbb stratégia (és amit itt
// használunk): teljes újraépítés (TRUNCATE + újratöltés). Kis korpusznál ez a helyes válasz.
// Nagynál inkrementális kell (mi változott? mit töröltek?) — ez a "tudásbázis-gondozás" költsége.
//
// Ez ÜZEMELTETÉSI szkript, nem agent-képesség: úgy viszonyul a tudásbázishoz, mint a
// `prisma db seed` a katalógushoz. Ezért ír közvetlenül a konzolra (nincs Trace), és ezért
// nem a CLI commander-parancsai közé került.

// .env betöltése a belépési pontban (a core sosem tölt fájlt).
try {
  process.loadEnvFile();
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

// A korpusz a repo GYÖKERÉBEN van (seed/knowledge/) — a gyökeret a findRepoPath keresi
// meg FELFELÉ haladva, így a repo bármely alkönyvtárából indítható a szkript.
const KNOWLEDGE_DIR = findRepoPath('seed', 'knowledge');
const EMBED_BATCH_SIZE = 100; // ennyi darabot embeddelünk egy API-hívásban

async function main(): Promise<void> {
  const files = readdirSync(KNOWLEDGE_DIR).filter((file) =>
    file.endsWith('.md'),
  );
  console.log(
    `1) BEOLVASÁS — ${files.length} dokumentum a seed/knowledge mappából`,
  );

  // 1-2. Beolvasás + darabolás.
  const pending: Omit<KnowledgeChunkInput, 'embedding'>[] = [];
  for (const file of files) {
    const raw = readFileSync(join(KNOWLEDGE_DIR, file), 'utf8');
    const document = parseKnowledgeDocument(raw, file.replace('.md', ''));
    // A CÍM átadása a chunkernek: minden darab elé a címsor-útvonal kerül
    // ("How To Care for a Snake Plant › Water") — enélkül a szakasz-darabok
    // megkülönböztethetetlenek, mert a növény neve csak a cikk címében szerepel.
    for (const chunk of chunkMarkdown(document.body, {
      docTitle: document.title,
    })) {
      pending.push({
        source: document.source,
        title: document.title,
        category: document.category,
        chunkIndex: chunk.index,
        content: chunk.content,
      });
    }
  }

  if (pending.length === 0) {
    throw new Error(
      'Egyetlen chunk sem keletkezett — üres a seed/knowledge mappa, vagy minden dokumentum kiürült a tisztítás után.',
    );
  }

  const avgChars = Math.round(
    pending.reduce((sum, chunk) => sum + chunk.content.length, 0) /
      pending.length,
  );
  console.log(
    `2) DARABOLÁS — ${pending.length} chunk (átlag ${avgChars} karakter, ~${Math.round(avgChars / 4)} token)`,
  );

  // 3-4. Vektorizálás kötegelten + beírás. Előtte ürítünk (teljes újraépítés).
  await clearKnowledge();
  console.log(
    `3) VEKTORIZÁLÁS — ${EMBED_BATCH_SIZE}-as kötegekben (OpenAI text-embedding-3-small)`,
  );

  let written = 0;
  for (let index = 0; index < pending.length; index += EMBED_BATCH_SIZE) {
    const batch = pending.slice(index, index + EMBED_BATCH_SIZE);
    const embeddings = await embedBatch(batch.map((chunk) => chunk.content));
    // FAIL-FAST a `as number[]` cast helyett: ha az embedding-hívás kevesebb
    // vektort ad vissza, a hiba korábban a toVectorLiteral join(',')-jánál
    // csapódott le, értelmezhetetlen üzenettel. Itt még megmondható, mi történt.
    if (embeddings.length !== batch.length) {
      throw new Error(
        `Az embedding-hívás ${embeddings.length} vektort adott ${batch.length} darabra — ` +
          'a kettőnek egyeznie kell. A betöltés megszakadt, a tudásbázis félkész.',
      );
    }
    const rows: KnowledgeChunkInput[] = batch.map((chunk, position) => ({
      ...chunk,
      embedding: embeddings[position] as number[],
    }));
    written += await insertChunks(rows);
    process.stdout.write(`   ${written}/${pending.length} chunk vektorizálva\r`);
  }

  console.log(`\n4) KÉSZ — ${written} chunk a knowledge_chunks táblában.`);
  await closeKnowledgePool();
}

main().catch(async (error: unknown) => {
  console.error(
    'Ingest hiba:',
    error instanceof Error ? error.message : String(error),
  );
  await closeKnowledgePool();
  process.exit(1);
});
