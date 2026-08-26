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
import {
  type BatteryConversation,
  type BatteryQuestion,
  loadBatteryCases,
} from './lib/cases.js';
import { mentionedNames, setScores } from './lib/matchers.js';
import { buildVerdict, checkExpect, checkRedFlags, checkSqlSet } from './lib/verdict.js';
import { type BatteryResult, type BatteryRun, summarize } from './lib/battery-result.js';
import { closeAdminPool, countMessages, deleteThreads, queryNames } from './lib/db-admin.js';
import { costUsd, formatUsd } from './lib/cost.js';
import { readUsageSince } from './lib/server-usage.js';
import { renderBatteryMarkdown } from './lib/battery-markdown.js';
import { Hud } from './lib/hud.js';

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

// ── Kapcsolók ───────────────────────────────────────────────────────────────
const hud = new Hud(!process.argv.includes('--no-hud'));
// A consistency ALAPBÓL KI (a kurzusnál alapból be): nálunk minden futás valódi pénz,
// tehát az alapértelmezés legyen az olcsó.
const WITH_CONSISTENCY = process.argv.includes('--consistency');
const CONSISTENCY_IDS = ['trap-most-expensive', 'trap-avg-price', 'sql-under3000'];
const CONSISTENCY_RUNS = 3;

/**
 * `--only "single,buktató"` — a fok NEVÉRE szűr, kisbetűsen, részlet-egyezéssel.
 *
 * A kapcsoló JELENLÉTÉT megkülönböztetjük az értékétől: `null` = nincs `--only`, `[]` = van,
 * de üres. A #10 PR-review 7. tétele szerint az érték nélküli `--only` korábban a TELJES,
 * ~$0,9-es battery-t indította el, egy szó figyelmeztetés nélkül. Ugyanaz a hibaosztály, amit
 * a CLAUDE.md a `splitCliArgs`-nál kimond: a switch jelenlétét kell jelenteni, nem `undefined`-et.
 */
const ONLY = ((): string[] | null => {
  const inline = process.argv.find((arg) => arg.startsWith('--only='));
  const index = process.argv.indexOf('--only');
  if (inline === undefined && index < 0) {
    return null;
  }
  const raw = inline !== undefined ? inline.slice('--only='.length) : (process.argv[index + 1] ?? '');
  return raw
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part !== '');
})();

interface TurnMeasurement {
  readonly answer: string;
  readonly ttfcMs: number | null;
  readonly tools: string[];
  /** Amelyik tool HIBÁVAL tért vissza (`data-tool-error`). Infra-hiba, nem agent-hiba. */
  readonly failedTools: string[];
}

/**
 * Egy üzenet elküldése és két mérés: TTFC (az első szöveg-karakter megjelenése) és a teljes idő.
 *
 * A streamelés végét a GOMB jelzi: streamelés közben „Állj", utána „Küldés". Nálunk nincs
 * „gondolkodik…" felirat, mint a kurzus felületén — a gomb viszont a termék valódi
 * viselkedése, nem teszt-célú kiegészítés. Élőben mérve: TTFC 4386 ms, teljes 5385 ms.
 */
async function sendAndMeasure(page: Page, message: string): Promise<TurnMeasurement> {
  const assistantBubbles = page.locator(`${MSG}[data-role="assistant"]`);
  // CSAK az asszisztens-buborékokat számoljuk (#10 PR-review, 13. tétel). A teljes `MSG`
  // számláló a SAJÁT user-buborékunk megjelenésétől nagyobb lett, ezért a 2. körtől a
  // TTFC-ciklus azonnal kilépett a KORÁBBI kör szövegén — és a `checkExpect` elavult
  // válaszon futott, azaz a többkörös fok mérése érvénytelen volt.
  const before = await assistantBubbles.count();
  const started = Date.now();

  await page.getByPlaceholder('Írd ide a kérdésed…').fill(message);
  await hud.show(page, '✍️ kérdés beírása…');
  await page.keyboard.press('Enter');
  await hud.show(page, '⏳ várakozás a válaszra…');

  // ELŐBB az „Állj" gombot várjuk meg: enélkül a „Küldés"-re várás azonnal feloldódhat, mert a
  // `status` még nem váltott `submitted`-re — és az `answer` az ELŐZŐ kör válasza lenne.
  await page
    .getByRole('button', { name: 'Állj' })
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => undefined);

  const lastAssistantText = () => assistantBubbles.last().locator(ASSISTANT_TEXT);

  let ttfcMs: number | null = null; // null = nem érkezett szöveg — SOHA nem 0
  while (Date.now() - started < ANSWER_TIMEOUT_MS) {
    if ((await assistantBubbles.count()) > before) {
      const text = await lastAssistantText()
        .innerText()
        .catch(() => '');
      if (text.trim().length > 0) {
        ttfcMs = Date.now() - started;
        await hud.show(page, `💬 első karakter ${(ttfcMs / 1000).toFixed(1)} s`);
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
  //
  // A `data-tool-error` a DETERMINISZTIKUS jel arról, hogy a tool HIBÁVAL tért vissza. Enélkül
  // a battery csak azt tudta, hogy a tool FUTOTT — és egy infra-hiba a modell magyar
  // parafrázisán át hamis zöldet adott (#10 PR-review, 2. tétel).
  const cards = await page
    .locator(`${MSG}[data-role="assistant"]`)
    .last()
    .locator(TOOL_CARD)
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const data =
          (node as unknown as { dataset?: Record<string, string | undefined> }).dataset ?? {};
        return { name: data['tool'] ?? '', failed: data['toolError'] === 'true' };
      }),
    )
    .catch(() => [] as { name: string; failed: boolean }[]);

  return {
    answer,
    ttfcMs,
    tools: cards.filter((card) => card.name !== '').map((card) => card.name),
    failedTools: cards.filter((card) => card.failed && card.name !== '').map((card) => card.name),
  };
}

/** A futás alatt LÉTREHOZOTT threadek — a végén PONTOSAN ezeket töröljük. */
const createdThreadIds = new Set<string>();

/**
 * A thread-azonosító az URL-ből. A szerver `data-thread` részt küld, amire az App a címsort
 * `?thread=<uuid>`-ra írja át. A DB-t szándékosan NEM kérdezzük: az más futások (és a négy
 * demó-beszélgetés) threadjeit is visszaadná, és a takarítás azokat is elvinné.
 */
function currentThreadId(page: Page): string | null {
  const value = new URL(page.url()).searchParams.get('thread');
  return value === null || value === '' ? null : value;
}

async function rememberThread(page: Page): Promise<string | null> {
  // A címsor-átírás a stream VÉGÉN történik, ezért rövid türelmi idő kell.
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = currentThreadId(page);
    if (id !== null) {
      createdThreadIds.add(id);
      return id;
    }
    await page.waitForTimeout(100);
  }
  return null;
}

/** Egy egykörös kérdés végigfuttatása FRISS oldalon (izoláció: ne szivárogjon a kontextus). */
async function askOne(page: Page, question: BatteryQuestion): Promise<BatteryResult> {
  const flags: string[] = [];
  await page.goto(WEB, { waitUntil: 'domcontentloaded' });

  const sinceMs = Date.now();
  const started = Date.now();
  const { answer, ttfcMs, tools, failedTools } = await sendAndMeasure(page, question.q);
  const ms = Date.now() - started;
  const usage = await readUsageSince(sinceMs, 1);

  if (answer.length === 0) {
    flags.push('ÜRES VÁLASZ');
  }
  if (failedTools.length > 0) {
    // A mérés ÉRVÉNYTELEN, nem az agent hibázott — de zölden sem mehet el.
    flags.push(`INFRA HIBA: hibával tért vissza a(z) ${failedTools.join(', ')} tool`);
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

  if (question.sqlCheck) {
    const expected = await queryNames(question.sqlCheck.sql);
    const allNames = await queryNames('SELECT name FROM products');
    const usable = expected !== null && allNames !== null && allNames.length > 0;
    const mentioned = usable ? mentionedNames(answer, allNames) : null;
    const outcome = checkSqlSet(
      expected,
      mentioned,
      mentioned === null || expected === null ? null : setScores(expected, mentioned),
    );
    flags.push(...outcome.flags);
    truth = outcome.truth;
  }

  const verdict = buildVerdict(question, answer, flags);

  await rememberThread(page);
  await hud.verdict(page, verdict.accepted);

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

/** Több-körös eset: EGY oldal, több üzenet sorban — a kontextus a körök között megmarad. */
async function askConversation(
  page: Page,
  conversation: BatteryConversation,
): Promise<BatteryResult> {
  const flags: string[] = [];
  const notes: string[] = [];

  await page.goto(WEB, { waitUntil: 'domcontentloaded' });
  const sinceMs = Date.now();
  const started = Date.now();

  const turns: { user: string; assistant: string }[] = [];
  let ttfcMs: number | null = null;

  for (const [index, message] of conversation.steps.entries()) {
    const turn = await sendAndMeasure(page, message);
    if (index === 0) {
      ttfcMs = turn.ttfcMs; // az első kör jellemzi a válaszkészséget
    }
    if (turn.failedTools.length > 0) {
      flags.push(
        `INFRA HIBA: a(z) ${index + 1}. körben hibával tért vissza a(z) ${turn.failedTools.join(', ')} tool`,
      );
    }
    turns.push({ user: message, assistant: turn.answer });
  }

  const threadId = await rememberThread(page);

  // ── A ?thread= VISSZATÖLTÉS próbája ────────────────────────────────────────
  if (conversation.restore === true) {
    if (threadId === null) {
      flags.push('INFRA HIBA: nem sikerült kiolvasni a thread-azonosítót az URL-ből');
    } else {
      await page.goto(`${WEB}/?thread=${threadId}`, { waitUntil: 'domcontentloaded' });
      await page
        .locator(MSG)
        .first()
        .waitFor({ state: 'visible', timeout: 30_000 })
        .catch(() => undefined);
      const restored = await page.locator(MSG).count();
      const expectedCount = conversation.steps.length * 2;
      if (restored < expectedCount) {
        flags.push(
          `HIBA: a visszatöltés hiányos (${restored}/${expectedCount} üzenet jelent meg a ?thread= URL-ről)`,
        );
      } else {
        notes.push(`a ?thread= visszatöltés mind a ${restored} üzenetet visszahozta`);
      }
      const restoredTools = await page.locator(TOOL_CARD).count();
      if (restoredTools > 0) {
        notes.push(`a tool-kártyák is visszajöttek (${restoredTools} db)`);
      }
    }
  }

  const ms = Date.now() - started;
  const usage = await readUsageSince(sinceMs, conversation.steps.length);

  // A teljes átirat — ezt látja a riport (a html.ts chatThread-je 👤/🤖 mentén bontja körökre).
  const answer = turns.map((turn) => `👤 ${turn.user}\n🤖 ${turn.assistant}`).join('\n\n');
  // A szivárgás-vizsgálat CSAK az asszisztens szövegén fut: a teljes átiraton a TÁMADÓ saját
  // szavaira illeszkedne („mostantól módosíthatod"), ami fals pozitív.
  const assistantText = turns.map((turn) => turn.assistant).join('\n\n');
  // Az ELVÁRÁS csak az UTOLSÓ körre: így a kontextus-használatot mérjük, nem azt, hogy a szám
  // egy korábbi körben már elhangzott.
  const lastAnswer = turns.at(-1)?.assistant ?? '';

  if (turns.some((turn) => turn.assistant.length === 0)) {
    flags.push('ÜRES VÁLASZ');
  }
  flags.push(...checkRedFlags(assistantText, conversation.redFlags));
  if (conversation.expect) {
    const expectFlags = checkExpect(lastAnswer, conversation.expect);
    flags.push(...expectFlags);
    if (expectFlags.length === 0) {
      notes.push('az utolsó kör tartalmazza az elvárt értéket');
    }
  }

  // ── DB-IGAZOLÁS: minden fordulat elmentődött-e (a 07. alkalom garanciája) ───
  if (conversation.verifyDb === 'messages-saved') {
    if (threadId === null) {
      // NEM szabad csendben elfogadni: ez az eset legfontosabb determinisztikus ellenőrzése.
      flags.push('INFRA HIBA: thread-azonosító nélkül a mentés nem ellenőrizhető');
    } else {
      const stored = await countMessages(threadId);
      const expectedCount = conversation.steps.length * 2;
      if (stored >= expectedCount) {
        notes.push(`a messages táblában mind a ${stored} fordulat megvan`);
      } else {
        flags.push(
          `HIBA: hiányos mentés — ${stored} üzenet a várt ${expectedCount} helyett a messages táblában`,
        );
      }
    }
  }

  const truth = conversation.expect?.truth ?? conversation.truth;
  const accepted = flags.length === 0;
  const reason = accepted
    ? `ELFOGADVA — ${(notes.length > 0 ? notes : ['nem üres válaszok, nincs jelzés']).join('; ')}.`
    : `ELUTASÍTVA — ${flags.join('; ')}.${truth === undefined ? '' : ` Helyes: ${truth}`}`;

  await hud.verdict(page, accepted);

  const model = loadConfig().anthropicModel;
  const cost = usage === null ? null : costUsd(model, usage.inputTokens, usage.outputTokens);

  return {
    tier: '',
    id: conversation.id,
    q: `${conversation.title} (${conversation.steps.length} kör)`,
    ms,
    ttfcMs,
    tokens: usage === null ? null : usage.inputTokens + usage.outputTokens,
    costUsd: cost !== null && Number.isNaN(cost) ? null : cost,
    answer,
    flags,
    truth,
    verdict: { accepted, reason },
  };
}

const KEEP_THREADS = process.argv.includes('--keep-threads');

/**
 * A futás által létrehozott threadek törlése. CSAK a sajátjainkat — a négy demó-beszélgetés
 * (a 07. alkalom záró ellenőrzésének alanyai) érintetlen marad.
 *
 * A `szoba-kertesz_chat` szerep nem tud törölni, ezért megy adminon (db-admin.ts).
 */
async function cleanupThreads(): Promise<void> {
  if (KEEP_THREADS) {
    console.log(`\n(--keep-threads: ${createdThreadIds.size} thread MARAD az adatbázisban)`);
    return;
  }
  try {
    const removed = await deleteThreads([...createdThreadIds]);
    console.log(`\nTakarítás: ${removed} thread törölve (a demó-beszélgetések érintetlenek).`);
  } catch (error) {
    // A takarítás hibája NE vigye el a futás eredményét — a riport fontosabb.
    console.error(
      `\nA thread-takarítás nem sikerült: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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

  // A séma-igazolás INGYENES: se böngésző, se modell-hívás. Ezért van a legelején.
  if (process.argv.includes('--dump-cases')) {
    process.stdout.write(`${JSON.stringify({ tiers }, null, 2)}\n`);
    return;
  }

  // A szűrés is a böngésző ELŐTT dől el: egy nem illeszkedő --only ne indítson böngészőt.
  if (ONLY !== null && ONLY.length === 0) {
    // Fizetős parancs: az érték nélküli kapcsoló NEM futtathatja le csendben mind a 11 fokot.
    throw new Error(
      'A --only kapcsoló érték nélkül áll. Adj meg legalább egy fok-név-részletet, ' +
        'pl. --only "Single-step". A teljes futáshoz hagyd el a kapcsolót.',
    );
  }
  const tiersToRun =
    ONLY === null
      ? tiers
      : tiers.filter((tier) => ONLY.some((needle) => tier.name.toLowerCase().includes(needle)));
  if (ONLY !== null) {
    console.log(
      `(--only szűrő: ${tiersToRun.map((tier) => tier.name).join(' | ') || 'NINCS TALÁLAT'})`,
    );
  }
  if (tiersToRun.length === 0) {
    console.log('Nincs futtatható fok (a --only szűrő nem talált egyet sem). Kilépés.');
    return;
  }

  const totalCases = tiersToRun.reduce(
    (sum, tier) => sum + (tier.questions?.length ?? 0) + (tier.conversations?.length ?? 0),
    0,
  );
  let caseIndex = 0;

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
  const consistency: BatteryRun['consistency'] = [];

  try {
    for (const tier of tiersToRun) {
      console.log(`\n=== ${tier.name} — ${tier.intent} ===`);
      for (const conversation of tier.conversations ?? []) {
        console.log(`\n[💬] ${conversation.title} (${conversation.steps.length} kör)`);
        caseIndex++;
        hud.setCase(`[${caseIndex}/${totalCases}] ${tier.name}`, conversation.title);
        const result = await askConversation(page, conversation);
        results.push({ ...result, tier: tier.name });
        const mark = result.flags.length > 0 ? `⚠️ ${result.flags.join('; ')}` : 'ok';
        console.log(`[${(result.ms / 1000).toFixed(1)}s ${mark}]`);
      }
      for (const question of tier.questions ?? []) {
        console.log(`\n[?] ${question.q}`);
        caseIndex++;
        hud.setCase(`[${caseIndex}/${totalCases}] ${tier.name}`, question.q);
        const result = await askOne(page, question);
        results.push({ ...result, tier: tier.name });
        const mark = result.flags.length > 0 ? `⚠️ ${result.flags.join('; ')}` : 'ok';
        console.log(`[${(result.ms / 1000).toFixed(1)}s ${mark}]`);
      }
    }

    // ── Konzisztencia: az LLM nem-determinizmusának SZÁMSZERŰSÍTÉSE ──────────
    // Alapból KI: háromszoros futás háromszoros pénz. A `--consistency` kapcsolja be.
    if (!WITH_CONSISTENCY) {
      console.log('\n(konzisztencia kihagyva — kapcsold be a --consistency flaggel)');
    } else {
      const allQuestions = tiersToRun.flatMap((tier) => tier.questions ?? []);
      console.log(
        `\n=== Konzisztencia — ${CONSISTENCY_IDS.length} eset × ${CONSISTENCY_RUNS} futás ===`,
      );
      for (const id of CONSISTENCY_IDS) {
        const question = allQuestions.find((entry) => entry.id === id);
        if (question === undefined) {
          continue;
        }
        const runs: { accepted: boolean; answer: string }[] = [];
        for (let attempt = 0; attempt < CONSISTENCY_RUNS; attempt++) {
          hud.setCase(`Konzisztencia · ${id}`, `${attempt + 1}/${CONSISTENCY_RUNS}. futás`);
          const repeat = await askOne(page, question);
          runs.push({ accepted: repeat.verdict.accepted, answer: repeat.answer });
        }
        const acceptedCount = runs.filter((entry) => entry.accepted).length;
        const majority = acceptedCount >= runs.length / 2;
        const stable = acceptedCount === 0 || acceptedCount === runs.length;
        consistency.push({
          id,
          question: question.q,
          runs: runs.length,
          acceptedCount,
          agreement: runs.filter((entry) => entry.accepted === majority).length / runs.length,
          stable,
          answers: runs.map((entry) => entry.answer),
        });
        console.log(
          `  ${id}: ${acceptedCount}/${runs.length} elfogadva — ${stable ? 'STABIL' : 'INGADOZIK'}`,
        );
      }
    }
  } finally {
    // A MÉRÉS KIÍRÁSA IS IDE TARTOZIK. A #10 PR-review 6. tétele: amíg a writeRun a try/finally
    // UTÁN állt, egy félbeszakadt futás (Playwright-timeout, DB-hiba) minden MÁR KIFIZETETT
    // eredményt elvesztett. Ugyanaz az invariáns, amit a CLAUDE.md a JSONL-naplóra kimond:
    // egy elbukott futás is hagyjon nyomot, különben a költségbecslés némán alulszámol.
    if (results.length > 0) {
      const run: BatteryRun = { startedAt, web: WEB, results, consistency };
      const path = writeRun(run);
      writeFileSync(
        path.replace(/\.json$/, '.md'),
        `${renderBatteryMarkdown(run)}\n`,
        'utf8',
      );
      const summary = summarize(results);
      console.log(
        `\nKész: ${summary.total} eset, ${summary.failed} bukott, ` +
          `átlag ${(summary.avgMs / 1000).toFixed(1)} s, ` +
          `becsült költség ${formatUsd(summary.totalCostUsd)}` +
          `${summary.costUnknown > 0 ? ` (${summary.costUnknown} esetnél NEM MÉRHETŐ)` : ''}` +
          `\n${path}`,
      );
    }
    // A takarítás MEGSZAKADT futás után is fusson le — különben egy Ctrl-C threadeket hagyna.
    await browser.close();
    await cleanupThreads();
    await closeAdminPool();
  }
}

await main();
