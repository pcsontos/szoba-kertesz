import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  askAgent,
  closeKnowledgePool,
  closeReadonlyPool,
  retrieveKnowledge,
  type RerankedHit,
} from '@szoba-kertesz/core';
import { loadGoldenSet } from './lib/golden-questions.js';
import {
  renderGoldenReport,
  type GoldenHit,
  type GoldenRow,
} from './lib/golden-report.js';
import { findRepoPath } from './lib/repo-root.js';

// golden-run.ts — A GOLDEN SET FUTTATÁSA. Futtatás: `pnpm golden:run --label <név>`
//
// Minden kérdés KÉTSZER fut, UGYANAZON a retrieveKnowledge-en, csak más beállítással:
//   nyers  → { useHyde: false, useRerank: false }  — csak embedding + vektortávolság
//   teljes → { useHyde: true,  useRerank: true  }  — a teljes pipeline
// A negatív kérdésnél EZEN FELÜL egy valódi agent-futás: a kiírás azt kéri, hogy
// az AGENT mondja ki, hogy nincs információja — az generálás, nem retrieval.
//
// ÜZEMELTETÉSI szkript, mint a knowledge:ingest: közvetlenül a konzolra ír, nincs Trace,
// és nincs a commander-parancsok között. VALÓDI, FIZETŐS hívásokat indít.

try {
  process.loadEnvFile();
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

/** `--label <név>` kiolvasása. Alap: `futas`. A név a fájlnévbe kerül. */
function parseLabel(argv: readonly string[]): string {
  const index = argv.indexOf('--label');
  const value = index === -1 ? undefined : argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    return 'futas';
  }
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error(
      `Érvénytelen label: "${value}". Csak kisbetű, szám és kötőjel használható — a név fájlnévbe kerül.`,
    );
  }
  return value;
}

const toGoldenHit = (hit: RerankedHit): GoldenHit => ({
  title: hit.title,
  source: hit.source,
  chunkIndex: hit.chunkIndex,
  distance: hit.distance,
  score: hit.score,
});

/** A RAG saját nyoma néma: 16 futás színes trace-e olvashatatlan lenne. */
const silent = { log: (): void => undefined };

async function main(): Promise<void> {
  const label = parseLabel(process.argv.slice(2));
  const questions = loadGoldenSet();
  console.log(`Golden set — ${questions.length} kérdés, label: ${label}\n`);

  const rows: GoldenRow[] = [];
  for (const [position, question] of questions.entries()) {
    console.log(`[${position + 1}/${questions.length}] ${question.question}`);

    const raw = await retrieveKnowledge(
      question.question,
      { useHyde: false, useRerank: false, topK: 5 },
      silent,
    );
    const full = await retrieveKnowledge(
      question.question,
      { useHyde: true, useRerank: true, topK: 5 },
      silent,
    );

    // A negatív kérdésnél az AGENT válasza a bizonyíték, nem a találati lista.
    let agentAnswer: string | undefined;
    if (question.kind === 'negative') {
      console.log('   … agent-futás (a grounding próbája)');
      const result = await askAgent(question.question, {
        role: 'customer',
        print: false,
        persistTrace: false,
      });
      agentAnswer = result.answer;
    }

    rows.push({
      question,
      raw: raw.hits.map(toGoldenHit),
      full: full.hits.map(toGoldenHit),
      ...(agentAnswer === undefined ? {} : { agentAnswer }),
    });
  }

  const outPath = join(findRepoPath('docs'), 'golden', `futas-${label}.md`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, renderGoldenReport(label, new Date(), rows), 'utf8');
  console.log(`\nKÉSZ — ${outPath}`);
}

main()
  .catch((error: unknown) => {
    console.error(
      'Golden set hiba:',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeKnowledgePool();
    await closeReadonlyPool();
  });
