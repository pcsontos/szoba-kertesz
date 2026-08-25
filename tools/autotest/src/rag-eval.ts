// rag-eval.ts — RAGAS-stílusú RAG-kiértékelés, LÁTHATÓ számítással.
//
// NEM a böngésző-battery: ez KÖZVETLENÜL a pipeline-t hajtja, mert a metrikákhoz látni kell a
// VISSZAKAPOTT chunkokat, nem elég a végső válasz. A RAG két fele (RETRIEVAL vs. GENERÁLÁS)
// így külön hibáztatható.
//
//   kérdés → retrieveKnowledge → chunkok(+táv) → válasz a kontextusból → 6 metrika
//
// HIBRID ÍTÉLŐ: ahol determinisztikusan mérhető (koszinusz), ott a SZÁM kiíródik; a nehezebb
// döntést LLM-judge hozza, INDOKLÁSSAL. Egy fix koszinusz-küszöb a rövid kérdés + HyDE
// rezsimben megbízhatatlan — és a kiírt sim-értékek ezt meg is mutatják.
//
// MODELL-ROUTING: a válasz a termék modelljén készül (azt mérjük), az ítélet a Haikun — ugyanaz
// az elv, amit a rerank.ts már használ: a drága modell válaszol, az olcsó válogat.
//
// ÜZEMELTETÉSI SZKRIPT, FIZETŐS: esetenként ~8-12 LLM-hívás. Hét eset nagyságrendje $0,5-1.
// Előfeltétel: nem üres `knowledge_chunks` tábla.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createAnthropic } from '@ai-sdk/anthropic';
import { embedBatch, loadConfig, retrieveKnowledge } from '@szoba-kertesz/core';
import { generateText, type LanguageModel } from 'ai';
import { loadRagCases, type RagCase } from './lib/cases.js';
import { coerceArray, parseJsonLoose } from './lib/json-loose.js';
import {
  averageMetric,
  contextPrecisionScore,
  cosineSim,
  METRIC_LABELS,
  type RagCaseResult,
  type RagChunk,
  type RagRun,
  splitClaims,
} from './lib/rag-result.js';
import { renderRagHtml } from './lib/rag-html.js';
import { openInBrowser } from './lib/html.js';
import { costUsd, formatUsd } from './lib/cost.js';

try {
  process.loadEnvFile();
} catch (error) {
  const missing = error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!missing) {
    throw error;
  }
}

const TOP_K = 5;
const JUDGE_MODEL = 'claude-haiku-4-5';
const OUT_DIR = join('logs', 'autotest');

// Szándékosan IRRELEVÁNS „chunkok" a noise sensitivityhez: ha ezektől a válasz hallucinálni
// kezd (a valódi forrás nem támasztja alá), akkor a modell zaj-érzékeny.
const DISTRACTORS = [
  'A dízelmotor nyomatéka alacsony fordulaton is magas, ezért vontatásra alkalmas. A turbófeltöltő növeli a teljesítményt.',
  'A tökéletes carbonara alapja a tojássárgája, a pecorino sajt és a guanciale; tejszín semmiképp nem kerül bele.',
];

const config = loadConfig();
const anthropic = createAnthropic({ apiKey: config.anthropicApiKey });
const answerModel = anthropic(config.anthropicModel);
const judgeModel = anthropic(JUDGE_MODEL);

let inputTokens = 0;
let outputTokens = 0;

async function generate(model: LanguageModel, prompt: string): Promise<string> {
  const { text, usage } = await generateText({ model, prompt, maxOutputTokens: 3000 });
  inputTokens += usage?.inputTokens ?? 0;
  outputTokens += usage?.outputTokens ?? 0;
  return text;
}

/**
 * JSON-tömböt váró judge-hívás EGY retryval. Ha kétszer sem jön értékelhető tömb, `null` —
 * NEM üres tömb, mert abból csendes 0 faithfulness / 1.0 noise lenne, ami MÉRÉSI EREDMÉNYNEK
 * látszik, holott parse-hiba.
 */
async function judgeArray<T>(prompt: string): Promise<T[] | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const parsed = coerceArray<T>(parseJsonLoose(await generate(judgeModel, prompt)));
    if (parsed.length > 0) {
      return parsed;
    }
  }
  return null;
}

function numberedList(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

function sourceList(contexts: readonly string[]): string {
  return contexts.map((content, index) => `[${index + 1}] ${content}`).join('\n\n');
}

/** A kiértékelendő „rendszer-válasz": KIZÁRÓLAG a visszakapott kontextusból, magyarul. */
async function answerFromContext(question: string, contexts: string[]): Promise<string> {
  const text = await generate(
    answerModel,
    'Válaszolj a kérdésre KIZÁRÓLAG az alábbi forrás-részletek alapján, magyarul, tömören. ' +
      'Ha a források nem fedik a kérdést, mondd ki, hogy erről nincs információ.\n\n' +
      `Kérdés: ${question}\n\nForrások:\n${sourceList(contexts)}`,
  );
  return text.trim();
}

interface Judged {
  readonly flag: boolean;
  readonly reason: string;
}

/** LLM-judge: releváns-e minden visszakapott chunk a kérdéshez (a context precision alapja). */
async function judgeChunkRelevance(
  question: string,
  contexts: string[],
): Promise<Judged[] | null> {
  const result = await judgeArray<{ relevant?: boolean; reason?: string }>(
    'Döntsd el minden FORRÁS-részletről, hogy releváns-e (hasznos-e) az adott KÉRDÉS ' +
      'megválaszolásához. Szigorú JSON tömb, a forrásokkal AZONOS sorrendben: ' +
      '[{"relevant": true, "reason": "rövid magyar indok"}].\n\n' +
      `KÉRDÉS: ${question}\n\nFORRÁSOK:\n${sourceList(contexts)}`,
  );
  if (result === null) {
    return null;
  }
  return contexts.map((_, index) => ({
    flag: Boolean(result[index]?.relevant),
    reason: result[index]?.reason ?? '—',
  }));
}

/** LLM-judge: a referencia-válasz állításai megtalálhatók-e a chunkokban (context recall). */
async function judgeRecall(
  referenceClaims: string[],
  contexts: string[],
): Promise<Judged[] | null> {
  const result = await judgeArray<{ covered?: boolean; reason?: string }>(
    'Döntsd el minden ELVÁRT ÁLLÍTÁSRÓL, hogy megtalálható-e (alátámasztható-e) a FORRÁSOKBAN. ' +
      'Szigorú JSON tömb, az állításokkal AZONOS sorrendben: ' +
      '[{"covered": true, "reason": "rövid magyar indok"}].\n\n' +
      `FORRÁSOK:\n${sourceList(contexts)}\n\nELVÁRT ÁLLÍTÁSOK:\n${numberedList(referenceClaims)}`,
  );
  if (result === null) {
    return null;
  }
  return referenceClaims.map((_, index) => ({
    flag: Boolean(result[index]?.covered),
    reason: result[index]?.reason ?? '—',
  }));
}

/** Faithfulness: a válasz minden állítását alátámasztja-e a kontextus. */
async function judgeFaithfulness(
  answer: string,
  contexts: string[],
): Promise<Judged[] | null> {
  const claims = splitClaims(answer).slice(0, 6);
  if (claims.length === 0) {
    return [];
  }
  const result = await judgeArray<{ supported?: boolean; reason?: string }>(
    'Egy RAG-válasz állításait kell ellenőrizned a FORRÁSOK alapján. Minden állításról döntsd ' +
      'el, hogy a források ALÁTÁMASZTJÁK-e (supported: true), vagy nem/ellentmond (false). ' +
      'Csak a forrásokra támaszkodj, ne a saját tudásodra. Szigorú JSON tömb, az állításokkal ' +
      'AZONOS sorrendben: [{"supported": true, "reason": "rövid magyar indok"}].\n\n' +
      `FORRÁSOK:\n${sourceList(contexts)}\n\nÁLLÍTÁSOK:\n${numberedList(claims)}`,
  );
  if (result === null) {
    return null;
  }
  return claims.map((_, index) => ({
    flag: Boolean(result[index]?.supported),
    reason: result[index]?.reason ?? '—',
  }));
}

/** Az arány a NEM-NULL ítéletekből. `null` be → `null` ki (a nem mért nem nulla). */
function ratio(judged: Judged[] | null): number | null {
  if (judged === null) {
    return null;
  }
  return judged.length === 0 ? 0 : judged.filter((entry) => entry.flag).length / judged.length;
}

/**
 * Answer relevancy DETERMINISZTIKUSAN: a válaszból visszagenerált kérdések koszinusz-hasonlósága
 * az eredetihez. Itt embedding dönt, nem LLM — és a szám kiíródik.
 */
async function answerRelevancy(answer: string, questionEmbedding: number[]): Promise<number | null> {
  const generated = parseJsonLoose(
    await generate(
      judgeModel,
      'Az alábbi VÁLASZ alapján fogalmazz meg 2 kérdést, amelyekre ez a válasz pontosan ' +
        'felelne, magyarul. Szigorú JSON: {"questions": ["...", "..."]}.\n\n' +
        `VÁLASZ:\n${answer}`,
    ),
  ) as { questions?: string[] } | null;

  const questions = generated?.questions?.slice(0, 2) ?? [];
  if (questions.length === 0) {
    return null;
  }
  const embeddings = await embedBatch(questions);
  const sims = questions.map((_, index) =>
    cosineSim(questionEmbedding, embeddings[index] ?? []),
  );
  return sims.reduce((sum, value) => sum + value, 0) / sims.length;
}

/**
 * Noise sensitivity: a valódi kontextus közé IRRELEVÁNS chunkokat keverünk, újragenerálunk,
 * majd a zajos választ a VALÓDI források ellen ellenőrizzük. Ha az állításai már nem
 * támaszthatók alá, a modell hagyta magát félrevinni. 0 = robusztus.
 */
async function noiseSensitivity(
  question: string,
  cleanContexts: string[],
): Promise<number | null> {
  const noisyAnswer = await answerFromContext(question, [...cleanContexts, ...DISTRACTORS]);
  const claims = await judgeFaithfulness(noisyAnswer, cleanContexts);
  const supported = ratio(claims);
  return supported === null ? null : 1 - supported;
}

async function evalCase(ragCase: RagCase): Promise<RagCaseResult> {
  inputTokens = 0;
  outputTokens = 0;
  const started = Date.now();

  // A core RetrieveResult-ját cast NÉLKÜL használjuk — egy saját `Hit` típus elrejtene egy
  // jövőbeli breaking change-et (konvenciók.md).
  const { hits } = await retrieveKnowledge(ragCase.question, { topK: TOP_K });
  const contexts = hits.map((hit) => hit.content);
  const referenceClaims = splitClaims(ragCase.groundTruth);

  const [questionEmbedding, ...chunkEmbeddings] = await embedBatch([
    ragCase.question,
    ...contexts,
  ]);
  const answer = await answerFromContext(ragCase.question, contexts);

  const [relevance, recallClaims, faithClaims, relevancy, correctnessPair, noise] =
    await Promise.all([
      judgeChunkRelevance(ragCase.question, contexts),
      judgeRecall(referenceClaims, contexts),
      judgeFaithfulness(answer, contexts),
      answerRelevancy(answer, questionEmbedding ?? []),
      embedBatch([answer, ragCase.groundTruth]),
      noiseSensitivity(ragCase.question, contexts),
    ]);

  const chunks: RagChunk[] = hits.map((hit, index) => ({
    title: hit.title,
    source: hit.source,
    distance: hit.distance,
    sim: cosineSim(questionEmbedding ?? [], chunkEmbeddings[index] ?? []),
    relevant: relevance?.[index]?.flag ?? false,
    reason: relevance?.[index]?.reason ?? 'a judge nem adott értékelhető választ',
  }));

  return {
    id: ragCase.id,
    question: ragCase.question,
    groundTruth: ragCase.groundTruth,
    answer,
    chunks,
    metrics: {
      contextPrecision:
        relevance === null ? null : contextPrecisionScore(relevance.map((entry) => entry.flag)),
      contextRecall: ratio(recallClaims),
      faithfulness: ratio(faithClaims),
      answerRelevancy: relevancy,
      answerCorrectness: cosineSim(correctnessPair[0] ?? [], correctnessPair[1] ?? []),
      noiseSensitivity: noise,
    },
    latencyMs: Date.now() - started,
    tokens: inputTokens + outputTokens,
  };
}

function format(value: number | null): string {
  return value === null ? ' n/a' : value.toFixed(2);
}

async function main(): Promise<void> {
  const cases = loadRagCases();

  if (process.argv.includes('--dump-cases')) {
    process.stdout.write(`${JSON.stringify({ cases }, null, 2)}\n`);
    return;
  }

  console.log(
    `RAG-kiértékelés — ${cases.length} eset · válasz: ${config.anthropicModel} · ítélő: ${JUDGE_MODEL}\n`,
  );

  const startedAt = new Date().toISOString();
  const results: RagCaseResult[] = [];
  let totalInput = 0;
  let totalOutput = 0;

  for (const [index, ragCase] of cases.entries()) {
    console.log(`[${index + 1}/${cases.length}] ${ragCase.question}`);
    const result = await evalCase(ragCase);
    results.push(result);
    totalInput += inputTokens;
    totalOutput += outputTokens;
    const metrics = result.metrics;
    console.log(
      `  faith=${format(metrics.faithfulness)} relev=${format(metrics.answerRelevancy)} ` +
        `correct=${format(metrics.answerCorrectness)} prec=${format(metrics.contextPrecision)} ` +
        `recall=${format(metrics.contextRecall)} noise=${format(metrics.noiseSensitivity)}`,
    );
  }

  const run: RagRun = {
    startedAt,
    judgeModel: JUDGE_MODEL,
    answerModel: config.anthropicModel,
    cases: results,
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = startedAt.replace(/[:.]/g, '-');
  const jsonPath = join(OUT_DIR, `${stamp}-rag-eval.json`);
  writeFileSync(jsonPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8');

  const htmlPath = jsonPath.replace(/\.json$/, '-report.html');
  writeFileSync(htmlPath, renderRagHtml(run), 'utf8');

  console.log('\n=== Átlagok ===');
  for (const { key, label } of METRIC_LABELS) {
    console.log(`  ${label}: ${format(averageMetric(run, key))}`);
  }

  // A judge Haikun fut, a válasz a termék modelljén — a költséget külön becsüljük.
  const cost =
    costUsd(config.anthropicModel, totalInput, totalOutput) +
    costUsd(JUDGE_MODEL, 0, 0);
  console.log(
    `\n${jsonPath}\n${htmlPath}\nBecsült költség (felső korlát, a drágább modell árán): ${formatUsd(cost)}`,
  );

  if (!process.argv.includes('--no-open')) {
    openInBrowser(htmlPath);
  }
}

await main();
