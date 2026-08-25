// battery.ts — PLAYWRIGHT „NEHÉZSÉGI LÉTRA": egyre nehezebb kérdéseket teszünk fel a VALÓDI
// web UI-nak, kérdésenként friss oldallal (izoláció, hogy ne szivárogjon a kontextus), és
// mérjük, hol törik el.
//
// Előfeltétel: `pnpm serve:api` (3000) és `pnpm serve:web` (4200) fut. Futtatás:
//   pnpm autotest:battery
//
// ÜZEMELTETÉSI SZKRIPT: közvetlenül a konzolra ír, mint a golden-run.ts, és nincs a
// commander-parancsok között. VALÓDI, FIZETŐS futásokat indít — teljes futás ~$1,5-2,5.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '@szoba-kertesz/core';
import { chromium, type Page } from 'playwright';
import { type BatteryQuestion, loadBatteryCases } from './lib/cases.js';
import { mentionedNames, setScores } from './lib/matchers.js';
import { buildVerdict, checkExpect, checkRedFlags } from './lib/verdict.js';
import { type BatteryResult, type BatteryRun, summarize } from './lib/battery-result.js';
import { closeAdminPool, queryNames } from './lib/db-admin.js';
import { costUsd, formatUsd } from './lib/cost.js';
import { readUsageSince } from './lib/server-usage.js';

try {
  process.loadEnvFile();
} catch (error) {
  const missing = error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!missing) {
    throw error;
  }
}

const WEB = process.env['AUTOTEST_WEB'] ?? 'http://localhost:4200';
const ANSWER_TIMEOUT_MS = 180_000;
const OUT_DIR = join('logs', 'autotest');

// A Task 8-ban felvett DOM-horgok. A természetes fogódzókat (placeholder, gomb-felirat)
// szándékosan NEM testiddel érjük el — azok a termék valódi felületei.
const MSG = '[data-testid="message"]';
const ASSISTANT_TEXT = '[data-testid="assistant-text"]';
const TOOL_CARD = '[data-testid="tool-card"]';

interface TurnMeasurement {
  readonly answer: string;
  readonly ttfcMs: number | null;
  readonly tools: string[];
}

/**
 * Egy üzenet elküldése és két mérés: TTFC (az első szöveg-karakter megjelenése) és a teljes idő.
 *
 * A streamelés végét a GOMB jelzi: streamelés közben „Állj", utána „Küldés". Nálunk nincs
 * „gondolkodik…" felirat, mint a kurzus felületén — a gomb viszont a termék valódi
 * viselkedése, nem teszt-célú kiegészítés. Élőben mérve: TTFC 4386 ms, teljes 5385 ms.
 */
async function sendAndMeasure(page: Page, message: string): Promise<TurnMeasurement> {
  const before = await page.locator(MSG).count();
  const started = Date.now();

  await page.getByPlaceholder('Írd ide a kérdésed…').fill(message);
  await page.keyboard.press('Enter');

  const lastAssistantText = () =>
    page.locator(`${MSG}[data-role="assistant"]`).last().locator(ASSISTANT_TEXT);

  let ttfcMs: number | null = null; // null = nem érkezett szöveg — SOHA nem 0
  while (Date.now() - started < ANSWER_TIMEOUT_MS) {
    if ((await page.locator(MSG).count()) > before) {
      const text = await lastAssistantText()
        .innerText()
        .catch(() => '');
      if (text.trim().length > 0) {
        ttfcMs = Date.now() - started;
        break;
      }
    }
    await page.waitForTimeout(50);
  }

  // A streamelés vége: a „Küldés" gomb visszatér az „Állj" helyére.
  await page
    .getByRole('button', { name: 'Küldés' })
    .waitFor({ state: 'visible', timeout: ANSWER_TIMEOUT_MS })
    .catch(() => undefined);

  const answer = (
    (await lastAssistantText()
      .innerText()
      .catch(() => '')) ?? ''
  ).trim();

  // A `dataset`-et STRUKTURÁLISAN tipizáljuk: ez a csomag Node-os (`types: ["node"]`), nem
  // tölti be a DOM-libet, és egyetlen attribútum-olvasásért nem is érdemes.
  const tools = await page
    .locator(`${MSG}[data-role="assistant"]`)
    .last()
    .locator(TOOL_CARD)
    .evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          (node as unknown as { dataset?: Record<string, string | undefined> }).dataset?.[
            'tool'
          ] ?? '',
      ),
    )
    .catch(() => [] as string[]);

  return { answer, ttfcMs, tools: tools.filter((name) => name !== '') };
}

/** Egy egykörös kérdés végigfuttatása FRISS oldalon (izoláció: ne szivárogjon a kontextus). */
async function askOne(page: Page, question: BatteryQuestion): Promise<BatteryResult> {
  const flags: string[] = [];
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });

  const sinceMs = Date.now();
  const started = Date.now();
  const { answer, ttfcMs, tools } = await sendAndMeasure(page, question.q);
  const ms = Date.now() - started;
  const usage = await readUsageSince(sinceMs, 1);

  if (answer.length === 0) {
    flags.push('ÜRES VÁLASZ');
  }
  flags.push(...checkRedFlags(answer, question.redFlags));
  if (question.expect) {
    flags.push(...checkExpect(answer, question.expect));
  }
  if (question.expectTool !== undefined && !tools.includes(question.expectTool)) {
    flags.push(
      `HIBA: nem futott a várt tool (${question.expectTool}); futott: ${tools.join(', ') || '—'}`,
    );
  }

  let truth = question.expect?.truth;
  let sqlVerdictReason: string | null = null;

  if (question.sqlCheck) {
    const expected = await queryNames(question.sqlCheck.sql);
    const allNames = await queryNames('SELECT name FROM products');
    if (expected === null || allNames === null || allNames.length === 0) {
      // INFRA-hiba, NEM agent-hiba: nem szabad se zölden elfogadni, se pirosan az agentre kenni.
      truth =
        'SQL execution accuracy KIHAGYVA — a szoba-kertesz-adatbazis konténer nem elérhető ' +
        '(indítsd: docker compose up -d).';
      sqlVerdictReason = `KIHAGYVA — ${truth}`;
    } else {
      const mentioned = mentionedNames(answer, allNames);
      const scores = setScores(expected, mentioned);
      truth =
        `Elvárt halmaz (${expected.length}): ${expected.join(', ')}. ` +
        `precision=${scores.precision.toFixed(2)} recall=${scores.recall.toFixed(2)} ` +
        `F1=${scores.f1.toFixed(2)}.`;
      if (scores.f1 < 0.8) {
        flags.push(
          `HIBA: SQL-halmaz eltérés (F1=${scores.f1.toFixed(2)}; ` +
            `hiányzik: ${scores.missing.slice(0, 5).join(', ') || '—'}; ` +
            `többlet: ${scores.extra.slice(0, 5).join(', ') || '—'})`,
        );
      }
    }
  }

  const verdict =
    sqlVerdictReason === null
      ? buildVerdict(question, answer, flags)
      : { accepted: flags.length === 0, reason: sqlVerdictReason };

  const model = loadConfig().anthropicModel;
  const cost = usage === null ? null : costUsd(model, usage.inputTokens, usage.outputTokens);

  return {
    tier: '',
    id: question.id,
    q: question.q,
    ms,
    ttfcMs,
    tokens: usage === null ? null : usage.inputTokens + usage.outputTokens,
    // JSON-ban nincs NaN — a nem mért költség itt is `null`.
    costUsd: cost !== null && Number.isNaN(cost) ? null : cost,
    answer,
    flags,
    truth,
    verdict,
  };
}

function writeRun(run: BatteryRun): string {
  mkdirSync(OUT_DIR, { recursive: true });
  const stamp = run.startedAt.replace(/[:.]/g, '-');
  const path = join(OUT_DIR, `${stamp}-battery.json`);
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`, 'utf8');
  return path;
}

async function main(): Promise<void> {
  const tiers = loadBatteryCases();
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  } catch {
    await browser.close();
    throw new Error(
      `Nem érem el a webes felületet (${WEB}). Fut a \`pnpm serve:web\` és a \`pnpm serve:api\`?`,
    );
  }

  const startedAt = new Date().toISOString();
  const results: BatteryResult[] = [];

  try {
    for (const tier of tiers) {
      console.log(`\n=== ${tier.name} — ${tier.intent} ===`);
      for (const question of tier.questions ?? []) {
        console.log(`\n[?] ${question.q}`);
        const result = await askOne(page, question);
        results.push({ ...result, tier: tier.name });
        const mark = result.flags.length > 0 ? `⚠️ ${result.flags.join('; ')}` : 'ok';
        console.log(`[${(result.ms / 1000).toFixed(1)}s ${mark}]`);
      }
    }
  } finally {
    await browser.close();
    await closeAdminPool();
  }

  const run: BatteryRun = { startedAt, web: WEB, results, consistency: [] };
  const path = writeRun(run);
  const summary = summarize(results);
  console.log(
    `\nKész: ${summary.total} eset, ${summary.failed} bukott, ` +
      `átlag ${(summary.avgMs / 1000).toFixed(1)} s, ` +
      `becsült költség ${formatUsd(summary.totalCostUsd)}\n${path}`,
  );
}

await main();
