# 03. alkalom — Trace és tool-dispatch — Implementációs terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `szoba-kertesz` agent-loopja átláthatóvá válik (Trace), a tool-réteg saját könyvtárat kap `executeTool` dispatchcsel, és bejön a második, nem-SQL-es tool — mindezt úgy, hogy mind a hét saját kiegészítés bizonyítottan túléli a refaktort.

**Architecture:** A `packages/core/src/lib/` lapos szerkezete `tools/` alkönyvtárra bomlik egy `index.ts` dispatchcsel; a system prompt `prompts.ts`-be költözik (konstans + vékony wrapper); a JSONL-logger **mellé** — nem helyette — bekerül egy élő, színes konzol-Trace. Az agent-loop mechanikája nem változik.

**Tech Stack:** TypeScript (strict), Nx, pnpm, Vitest 4.1.9, Anthropic SDK, Zod, commander, `node:readline`.

---

## Global Constraints

Ezek minden task követelményeihez implicit módon hozzátartoznak.

**Precedencia ütközésnél** (a vault `HF3-eloprogram.md` „Végrehajtási protokoll" szakaszából):

1. A Végrehajtási protokoll — felülírja a superpowers defaultjait.
2. A kódvezetés-doksi (`03-Amikor_egy_agent_nem_eleg_kodvezetes.md`) — a lépések forrása.
3. A projekt `CLAUDE.md` invariánsai — két DB-kapcsolat két jogosultsági szinttel, framework-agnosztikus `core`, read-only tool-lánc.
4. Minden más superpowers-elem.

**Commit, push, PR CSAK kérésre** (protokoll 7.). A skill „frequent commits" defaultja **nem érvényes** — egyetlen task sem zárul commit-lépéssel. A branch (`feat/ora-03-trace-tools`) a végén is commit nélkül állhat; a commitolás külön, felhasználói döntés.

**STOP-szabály** (protokoll 8., a spec T3–T5 kategóriái): a végrehajtás **azonnal megáll és jelez**, ha
- a kurzus lépése törölné vagy felülírná a saját megoldást (T3),
- a doksi kiindulási állapota nem egyezik a repo valóságával (T4),
- egy ellenőrző parancs nem a várt kimenetet adja (T5).

Találgatás nincs, és a saját megoldást nem írjuk felül a kurzuséval.

**T1 fordítótábla** — a doksi parancsai ebben a repóban:

| Kódvezetés-doksi | Ebben a repóban |
|---|---|
| `pnpm typecheck` | `pnpm nx run core:typecheck && pnpm nx run cli:typecheck` |
| `pnpm test` | `pnpm nx test core && pnpm nx test cli` |
| `pnpm cli ask "…"` | `pnpm szobakertesz ask "…"` |

**Darabszám-kapu:** az induló alap **core 70 + cli 5**. Minden teszt-futtatás kiírja a számot; **csökkenés = megállás**, akkor is, ha a suite zöld. A Task 0 után az alap a manifeszt tesztjeivel nő.

**Manifeszt-kapu:** a Task 0-ban létrehozott `own-additions.spec.ts` fájloknak **minden további task után zöldnek kell lenniük**.

**Élő ellenőrzés:** taskonként csak `typecheck` + teszt fut (ingyenes). Az API-költséges `pnpm szobakertesz ask …` hívások a **Task 8-ban**, egyszerre.

**Előfeltétel:** a DB fut és seedelt (`docker compose up -d`; a `core` egyes specjei valós DB-t hívnak).

---

## File Structure

**Létrejön:**

| Fájl | Felelősség |
|---|---|
| `packages/core/src/lib/own-additions.spec.ts` | regressziós manifeszt, core-oldali öt kiegészítés |
| `apps/cli/src/own-additions.spec.ts` | regressziós manifeszt, CLI-oldali két kiegészítés |
| `packages/core/src/lib/prompts.ts` | a `system-prompt.ts` utóda: `SYSTEM_PROMPT` + `buildSystemPrompt()` |
| `packages/core/src/lib/tools/index.ts` | tool-felület: `tools` tömb + `executeTool` dispatch |
| `packages/core/src/lib/tools/client-preferences.ts` | a második tool (`getClientPreferences`) |
| `packages/core/src/lib/trace.ts` | élő, színes konzol-nyom + `traceLog()` |

**Áthelyeződik:** `runsql-tool.ts` → `tools/run-sql.ts`, `sql-guard.ts` → `tools/sql-guard.ts`, `db-readonly.ts` → `tools/db-readonly.ts` (a hozzájuk tartozó `.spec.ts` fájlokkal együtt).

**Módosul:** `packages/core/src/index.ts`, `agent.ts`, `apps/cli/src/main.ts`, `interactive.ts`, `package.json`, `CLAUDE.md`.

**NEM törlődik** (a kurzus törölné — T3, eldöntve): `logger.ts`, `logger.spec.ts`, `system-prompt.spec.ts` (átnevezve követi a forrást), a `--show-prompt` kapcsoló.

---

### Task 0: Regressziós manifeszt

A refaktor védőhálója. **A mai lapos szerkezeten készül, a Task 1 előtt** — így a következő taskok alatt végig véd.

**Files:**
- Create: `packages/core/src/lib/own-additions.spec.ts`
- Create: `apps/cli/src/own-additions.spec.ts`

**Interfaces:**
- Consumes: `SYSTEM_PROMPT`, `guardSql`, `executeRunSqlTool`, `executeListCategoriesTool`, `logInteraction`, `getSessionLogFilePath` a `packages/core/src/index.ts`-ből; `runInteractive` és `RunInteractiveOptions` az `apps/cli/src/interactive.ts`-ből.
- Produces: két spec-fájl, amit minden későbbi task zölden kell hagyjon.

- [ ] **Step 1: Írd meg a core manifesztet**

```typescript
// packages/core/src/lib/own-additions.spec.ts
// REGRESSZIÓS MANIFESZT — a saját kiegészítések, amiknek nincs megfelelője a
// kurzus-repóban. A csomag PUBLIKUS felületén keresztül dolgozik (../index.js),
// nem belső fájlútvonalon, hogy a fájlmozgatás vagy zölden átmenjen, vagy
// hangosan törjön — de némán ne tudjon eltűnni. NE töröld refaktornál.
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SYSTEM_PROMPT,
  executeListCategoriesTool,
  executeRunSqlTool,
  guardSql,
  logInteraction,
} from '../index.js';

describe('saját kiegészítés 1 — listCategories tool', () => {
  it('a katalógus valódi kategórialistáját adja vissza', async () => {
    const result = await executeListCategoriesTool({});
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.categories).toContain('szobanövény');
  });
});

describe('saját kiegészítés 2 — SELECT INTO tiltás', () => {
  it('elutasítja a SELECT ... INTO formát', () => {
    const result = guardSql('SELECT * INTO backup FROM products');
    expect(result.allowed).toBe(false);
    if (result.allowed) return;
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe('saját kiegészítés 3 — LIMIT subquery-be csomagolva', () => {
  it('LIMIT nélküli SELECT-re is sor-korlátozott SQL-t ad vissza', () => {
    const result = guardSql('SELECT * FROM products');
    expect(result.allowed).toBe(true);
    if (!result.allowed) return;
    expect(result.sql.toUpperCase()).toContain('LIMIT');
  });

  it('a ténylegesen visszaadott sorszám a plafon alatt marad', async () => {
    const result = await executeRunSqlTool({ query: 'SELECT * FROM products' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rowCount).toBeLessThanOrEqual(result.rows.length);
    expect(result.rows.length).toBeLessThanOrEqual(100);
  });
});

describe('saját kiegészítés 5 — javított system prompt', () => {
  it('előírja a visszakérdezést találgatás helyett', () => {
    expect(SYSTEM_PROMPT).toContain('KÉRDEZZ vissza');
  });

  it('előírja a COALESCE(sale_price, price) árlogikát', () => {
    expect(SYSTEM_PROMPT).toContain('COALESCE(sale_price, price)');
  });
});

describe('saját kiegészítés 6 — JSONL-logger token usage-dzsel', () => {
  it('JSONL sort ír a megadott fájlba, benne a token usage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'szk-manifest-'));
    const filePath = join(dir, 'interaction.jsonl');

    await logInteraction(
      {
        systemPrompt: SYSTEM_PROMPT,
        messages: [],
        answer: 'teszt',
        usage: { inputTokens: 11, outputTokens: 22 },
        toolSteps: [],
      },
      filePath,
    );

    const written = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(written.trim().split('\n')[0]);
    expect(parsed).toHaveProperty('timestamp');
    // A token usage tényleg benne van — ez a HF3 költségbecslés bizonyítékbázisa.
    expect(JSON.stringify(parsed)).toContain('11');
    expect(JSON.stringify(parsed)).toContain('22');
  });
});
```

- [ ] **Step 2: Futtasd, és nézd meg, mi bukik**

Run: `pnpm nx test core`

A `LogEntryInput` alakja (`systemPrompt`, `messages`, `answer`, `usage`, `toolSteps`) ellenőrizve — a fenti kód ezt használja, cast nélkül. Egyetlen szám maradt feltételezés: a **100-as sorplafon** a 3. blokkban. Nézd meg a tényleges értéket (`sql-guard.ts`), és írd át rá — a *tesztet* igazítod a kódhoz, nem fordítva.

Expected: minden `describe` blokk zöld.

- [ ] **Step 3: Írd meg a CLI manifesztet**

```typescript
// apps/cli/src/own-additions.spec.ts
// REGRESSZIÓS MANIFESZT — CLI-oldali saját kiegészítések. NE töröld refaktornál.
import { describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { runInteractive } from './interactive.js';

/** A valódi `AskAgentResult` alakja — a runInteractive ezt várja. */
const askResult = (answer: string) => ({
  answer,
  systemPrompt: '<role>teszt</role>',
  messages: [],
  usage: { inputTokens: 0, outputTokens: 0 },
  toolSteps: [],
});

function collect(output: PassThrough): { text: () => string } {
  let buffer = '';
  output.on('data', (chunk) => {
    buffer += String(chunk);
  });
  return { text: () => buffer };
}

describe('saját kiegészítés 4 — readline-guard a pufferelt sorokra', () => {
  it('a pufferelt sorokat sorban dolgozza fel, nem egymásba futva', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const sink = collect(output);
    const started: string[] = [];

    const ask = async (question: string) => {
      started.push(question);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return askResult(`válasz: ${question}`);
    };

    const done = runInteractive({ input, output, ask });

    // Mindkét sor EGYSZERRE érkezik — ezt a guard nélkül egymásba futna.
    input.write('első kérdés\nmásodik kérdés\n');
    input.end();
    await done;

    expect(started).toEqual(['első kérdés', 'második kérdés']);
    expect(sink.text()).toContain('válasz: első kérdés');
    expect(sink.text()).toContain('válasz: második kérdés');
  });
});

describe('saját kiegészítés 7 — --show-prompt', () => {
  it('showPrompt: true esetén kiírja a system promptot és az üzenet-tömböt', async () => {
    // FIGYELEM: a printPrompt console.log-ra ír, NEM az injektált output
    // streamre — ezért itt spy kell, nem a sink.
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const input = new PassThrough();
    const output = new PassThrough();

    const done = runInteractive({
      input,
      output,
      ask: async () => askResult('ok'),
      showPrompt: true,
    });
    input.write('teszt\n');
    input.end();
    await done;

    const logged = logSpy.mock.calls.flat().join('\n');
    logSpy.mockRestore();

    expect(logged).toContain('--- system prompt ---');
    expect(logged).toContain('--- üzenetek ---');
  });
});
```

- [ ] **Step 4: Futtasd, és igazítsd a tényleges alakhoz**

Run: `pnpm nx test cli`

Az `AskAgentResult` alakja és a `printPrompt` kimenete (`--- system prompt ---` / `--- üzenetek ---`, `console.log`-ra) ellenőrizve — a fenti kód ezt tükrözi. Ha a readline-guard tesztje bukik, **ne a tesztet gyengítsd**: az azt jelenti, hogy a pufferelt sorok tényleg egymásba futnak, ami valódi regresszió.

Expected: mindkét `describe` zöld.

- [ ] **Step 5: Rögzítsd az új darabszám-alapot**

Run: `pnpm nx test core && pnpm nx test cli`

Expected: core ≥ 70 + a manifeszt tesztjei, cli ≥ 5 + a manifeszt tesztjei. **Írd le a pontos két számot** — ez lesz az alap, ami a Task 8-ig nem csökkenhet.

---

### Task 1: `prompts.ts` — konstans + vékony wrapper

**T3/T4, eldöntve.** A doksi `buildSystemPromptWithDb` átnevezését írja elő; ilyen függvény **nincs** a repóban, csak a `SYSTEM_PROMPT` konstans. Döntés: a konstans marad (bájtazonos a `docs/system-prompt.md`-vel, a 10 teszt változatlan), és **mellé** kerül a kurzus hívási alakja.

**Files:**
- Create: `packages/core/src/lib/prompts.ts`
- Delete: `packages/core/src/lib/system-prompt.ts`
- Rename: `system-prompt.spec.ts` → `prompts.spec.ts` (a tartalom marad)
- Modify: `packages/core/src/index.ts`, `packages/core/src/lib/agent.ts`

**Interfaces:**
- Produces: `SYSTEM_PROMPT: string` (változatlan érték), `buildSystemPrompt(): string`.

- [ ] **Step 1: Mozgasd a fájlt, git-tel, hogy a történet megmaradjon**

```bash
git mv packages/core/src/lib/system-prompt.ts packages/core/src/lib/prompts.ts
git mv packages/core/src/lib/system-prompt.spec.ts packages/core/src/lib/prompts.spec.ts
```

- [ ] **Step 2: Tedd hozzá a wrappert a `prompts.ts` végére**

```typescript
/**
 * A kurzus 03. alkalmának hívási alakja (`prompts.ts` → `buildSystemPrompt()`).
 * Vékony wrapper: a prompt forrása továbbra is a fenti `SYSTEM_PROMPT`
 * konstans, ami bájtra azonos a `docs/system-prompt.md`-vel.
 */
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}
```

- [ ] **Step 3: Írd át az importokat**

`packages/core/src/index.ts`: `export * from './lib/system-prompt.js';` → `export * from './lib/prompts.js';`

`packages/core/src/lib/agent.ts`: a `system-prompt.js` importja → `prompts.js`.

Run: `grep -rn "system-prompt" packages/core/src apps/cli/src`
Expected: nincs találat `.ts` fájlban (a `docs/system-prompt.md`-re mutató kommentek maradhatnak).

- [ ] **Step 4: Egészítsd ki a manifesztet a wrapper állításával**

A `packages/core/src/lib/own-additions.spec.ts` 5. blokkjába:

```typescript
  it('a buildSystemPrompt() pontosan a konstanst adja vissza', async () => {
    const { buildSystemPrompt } = await import('../index.js');
    expect(buildSystemPrompt()).toBe(SYSTEM_PROMPT);
  });
```

- [ ] **Step 5: Ellenőrzés**

Run: `pnpm nx run core:typecheck && pnpm nx run cli:typecheck && pnpm nx test core && pnpm nx test cli`
Expected: zöld, és a darabszám a Task 0 Step 5-ben rögzítetthez képest **eggyel nőtt** (az új wrapper-teszt). Csökkenés = STOP.

---

### Task 2: `tools/` könyvtár és `executeTool` dispatch

Tisztán előkészítés — viselkedés nem változik. **T2:** a dispatchbe **két** tool kerül, nem egy.

**Files:**
- Create: `packages/core/src/lib/tools/index.ts`
- Rename: `runsql-tool.ts` → `tools/run-sql.ts`, `sql-guard.ts` → `tools/sql-guard.ts`, `db-readonly.ts` → `tools/db-readonly.ts`, `list-categories-tool.ts` → `tools/list-categories.ts` (mind a `.spec.ts` párjukkal)
- Modify: `packages/core/src/index.ts`, `agent.ts`

**Interfaces:**
- Produces: `tools: Anthropic.Tool[]`, `executeTool(name: string, input: unknown): Promise<ToolOutcome>`.

- [ ] **Step 1: Mozgasd a fájlokat**

```bash
mkdir -p packages/core/src/lib/tools
git mv packages/core/src/lib/runsql-tool.ts packages/core/src/lib/tools/run-sql.ts
git mv packages/core/src/lib/runsql-tool.spec.ts packages/core/src/lib/tools/run-sql.spec.ts
git mv packages/core/src/lib/sql-guard.ts packages/core/src/lib/tools/sql-guard.ts
git mv packages/core/src/lib/sql-guard.spec.ts packages/core/src/lib/tools/sql-guard.spec.ts
git mv packages/core/src/lib/db-readonly.ts packages/core/src/lib/tools/db-readonly.ts
git mv packages/core/src/lib/db-readonly.spec.ts packages/core/src/lib/tools/db-readonly.spec.ts
git mv packages/core/src/lib/list-categories-tool.ts packages/core/src/lib/tools/list-categories.ts
git mv packages/core/src/lib/list-categories-tool.spec.ts packages/core/src/lib/tools/list-categories.spec.ts
```

- [ ] **Step 2: Írd meg a dispatchet — KÉT toollal**

```typescript
// packages/core/src/lib/tools/index.ts
// A modell felé eső tool-felület: MILYEN toolok vannak, és hogyan futtatjuk őket.
// Új tool hozzáadása = új fájl ebben a mappában + felvétel a `tools` tömbbe és
// az `executeTool` dispatchbe.
import type Anthropic from '@anthropic-ai/sdk';
import {
  RUN_SQL_TOOL_NAME,
  executeRunSqlTool,
  runSqlToolDefinition,
} from './run-sql.js';
import {
  LIST_CATEGORIES_TOOL_NAME,
  executeListCategoriesTool,
  listCategoriesToolDefinition,
} from './list-categories.js';

export const tools: Anthropic.Tool[] = [
  runSqlToolDefinition,
  listCategoriesToolDefinition,
];

/** Egységes kimenet a loop és a Trace felé, tool-típustól függetlenül. */
export interface ToolOutcome {
  readonly content: string;
  readonly isError: boolean;
  readonly executedSql: string | null;
  readonly rowCount: number | null;
}

/**
 * A modell egy toolt kért (name + input) → lefuttatjuk. Ismeretlen toolra
 * hibaszöveget adunk vissza a modellnek, NEM dobunk — így tud hibából tanulni.
 */
export async function executeTool(
  name: string,
  input: unknown,
): Promise<ToolOutcome> {
  if (name === RUN_SQL_TOOL_NAME) {
    const result = await executeRunSqlTool(input);
    return result.ok
      ? {
          content: JSON.stringify(result.rows),
          isError: false,
          executedSql: result.sql,
          rowCount: result.rowCount,
        }
      : {
          content: result.error,
          isError: true,
          executedSql: null,
          rowCount: null,
        };
  }

  if (name === LIST_CATEGORIES_TOOL_NAME) {
    const result = await executeListCategoriesTool(input);
    return result.ok
      ? {
          content: JSON.stringify(result.categories),
          isError: false,
          executedSql: null,
          rowCount: result.categories.length,
        }
      : {
          content: result.error,
          isError: true,
          executedSql: null,
          rowCount: null,
        };
  }

  return {
    content: `Ismeretlen tool: ${name}`,
    isError: true,
    executedSql: null,
    rowCount: null,
  };
}
```

**Megjegyzés:** a `result.error` mezőnév ellenőrizve — mindkét failure-típus (`RunSqlToolFailure`, `ListCategoriesToolFailure`) `readonly error: string`-et ad. A `RunSqlToolFailure`-nek van egy opcionális `sql?` mezője is; hiba esetén azt is átadhatod az `executedSql`-be a jobb trace-hez.

- [ ] **Step 3: Igazítsd az `index.ts` exportjait és az `agent.ts` importjait**

`packages/core/src/index.ts`: a négy áthelyezett modul útvonala `./lib/tools/…`-ra, plusz `export * from './lib/tools/index.js';`

- [ ] **Step 4: Kösd a manifesztet a dispatchre**

A core manifeszt 1. blokkját írd át úgy, hogy a **dispatchen** keresztül menjen — ez bizonyítja, hogy a `listCategories` tényleg be van kötve:

```typescript
    const outcome = await executeTool('listCategories', {});
    expect(outcome.isError).toBe(false);
    expect(outcome.content).toContain('szobanövény');
```

- [ ] **Step 5: Ellenőrzés**

Run: `pnpm nx run core:typecheck && pnpm nx run cli:typecheck && pnpm nx test core && pnpm nx test cli`
Expected: zöld, darabszám nem csökkent. Külön nézd meg, hogy az `Ismeretlen tool:` ág is fedve van-e; ha nincs, adj hozzá egy tesztet a `tools/index.spec.ts`-ben.

---

### Task 3: Trace — a kontextus-növekedés láthatóvá tétele

A lecke szíve. **T3, eldöntve:** a Trace **mellé** kerül, a `logger.ts` és a JSONL **marad**.

**Files:**
- Create: `packages/core/src/lib/trace.ts`, `packages/core/src/lib/trace.spec.ts`
- Modify: `packages/core/src/lib/agent.ts`, `apps/cli/src/main.ts`, `apps/cli/src/interactive.ts`
- **NEM törlöd:** `logger.ts`, `logger.spec.ts`

**Interfaces:**
- Produces: `trace.request(i, messages)`, `trace.modelTurn(i, response) → { modelText }`, `trace.toolStep(turn, use, outcome)`, `trace.finish(answer)`, `traceLog(line)`.

- [ ] **Step 1: Nézd meg a referencia-implementációt**

```bash
git -C ../ai-agent-kurzus show 7ab1fb6:packages/core/src/lib/trace.ts
git -C ../ai-agent-kurzus show 7ab1fb6:packages/core/src/lib/trace.spec.ts
```

Vedd át a szerkezetét. A végállapot (a Task 4 csiszolásaival együtt) a `12d2b39`, `40d480a`, `669217e`, `6aef51b` commitok utáni `trace.ts`.

- [ ] **Step 2: Írd meg a `trace.ts`-t és a specjét**

Kövesd a referenciát. A kimenet lineáris: körönként `request` → `modelTurn` → `toolStep`(ek) → a végén `finish`. A többsoros SQL egy konzol-sorba lapítva. A `--quiet` kapcsolóra a konzol-kiírás elnémul, de a `traceLog()` watch-log akkor is ír (ez a Task 5).

- [ ] **Step 3: Kösd be az `agent.ts` loopjába — a logger MELLÉ**

A loop mechanikája nem változik. A `trace.request(...)` / `trace.modelTurn(...)` / `trace.toolStep(...)` hívások bekerülnek, **és a meglévő `logInteraction(...)` hívás a helyén marad**. A két kimenet párhuzamosan él: a Trace a konzolra, a JSONL a `logs/<timestamp>.jsonl`-be a token usage-dzsel.

- [ ] **Step 4: Vezesd át a `print` / `--quiet` kapcsolót a CLI-ra**

`AskOptions`-be `print?: boolean` (alapból `true`); a CLI `--quiet` kapcsolóra `false`. A `--show-prompt` **marad** a helyén.

- [ ] **Step 5: Ellenőrzés**

Run: `pnpm nx run core:typecheck && pnpm nx run cli:typecheck && pnpm nx test core && pnpm nx test cli`
Expected: zöld; a `logger.spec.ts` 4 tesztje **továbbra is fut**; a manifeszt 6. blokkja (JSONL) zöld. Ha a `logger.spec.ts` eltűnt vagy a JSONL-teszt bukik → STOP.

---

### Task 4: Trace-csiszolás

Hét apró kurzus-commit ugyanazon a fájlon; nem kell mindet reprodukálni, a **végállapot** számít.

**Files:** Modify: `packages/core/src/lib/trace.ts`

- [ ] **Step 1: Vidd be az öt csiszolást**

- többsoros SQL egy konzol-sorba lapítva (a teljes SQL a JSON-ban marad)
- a végső válasz nem íródik ki kétszer (`modelTurn` csak a tool előtti szöveget mutatja, a végét a `finish` írja)
- lineáris elrendezés: minden LLM-hívás és tool-futás egy lapos lépés
- a kérés **összes** paramétere kilistázva (model, max_tokens, tools, system, messages)
- ciánkék `KÉRDÉS` banner, szimmetrikusan a `VÁLASZ` blokkal

- [ ] **Step 2: Ellenőrzés**

Run: `pnpm nx run core:typecheck && pnpm nx test core && pnpm nx test cli`
Expected: zöld, darabszám nem csökkent.

---

### Task 5: Folyamatos watch-log

**Files:** Modify: `packages/core/src/lib/trace.ts`, `agent.ts`, `apps/cli/src/main.ts`, `interactive.ts`

- [ ] **Step 1: Modul-szintű watch-log + `traceLog()`**

Referencia: `git -C ../ai-agent-kurzus show 147b2a6` és `669217e`. A `logs/agent.log` a `--quiet`-tól **függetlenül** folyik.

- [ ] **Step 2: Ellenőrizd, hogy a `logs/` ignorálva van**

Run: `grep -n "logs" .gitignore`
Expected: a `logs/` szerepel benne. Ha nem, vedd fel.

- [ ] **Step 3: Ellenőrzés**

Run: `pnpm nx run core:typecheck && pnpm nx test core && pnpm nx test cli`
Expected: zöld, darabszám nem csökkent. (Az élő `tail -f` ellenőrzés a Task 8-ban.)

---

### Task 6: `tsx`-futtatás build nélkül

**T2 — additív.** A kurzus `pnpm cli`-t vezet be; nálad ez a `szobakertesz` script **mellé** kerül, nem helyette, mert a `szobakertesz:debug` a `--show-prompt`-tal együtt megmarad.

**Files:** Modify: `package.json`

- [ ] **Step 1: Vedd fel az új scriptet**

```json
"cli": "tsx apps/cli/src/main.ts"
```

A `szobakertesz` és a `szobakertesz:debug` **változatlanul marad**.

- [ ] **Step 2: Ellenőrzés**

Run: `pnpm cli --help` — API-hívás nélkül igazolja, hogy a script létezik és build nélkül indul.
Expected: a commander súgója megjelenik, és **nem** fut előtte `nx build`. (Élő `ask` hívás itt nincs — az mind a Task 8-ban van.)

---

### Task 7: A második tool — `getClientPreferences`

Itt derül ki, miért kellett a Task 2 dispatchje.

**Files:**
- Create: `packages/core/src/lib/tools/client-preferences.ts`, `client-preferences.spec.ts`
- Modify: `packages/core/src/lib/tools/index.ts`, `prompts.ts`

- [ ] **Step 1: Írd meg a toolt**

```typescript
// packages/core/src/lib/tools/client-preferences.ts
/** Ügyfélkód → preferenciák. Egyelőre fix tábla; később jöhet mögé config/DB. */
export const CLIENT_PREFERENCES = {
  ACME: { budget: 1000, careLevel: 'ALACSONY' },
  GLOBEX: { budget: 5000, careLevel: 'KÖZEPES' },
  INITECH: { budget: 250000, careLevel: 'MAGAS' },
} as const satisfies Record<string, ClientPreference>;

/** Az enum értékei — a térkép kulcsaiból, nem duplikálva. */
export const CLIENT_CODES = Object.keys(CLIENT_PREFERENCES) as [
  ClientCode,
  ...ClientCode[],
];
```

**A kulcs-döntés:** a `CLIENT_PREFERENCES` az EGYETLEN forrás — ebből származik a tool-séma `enum`-ja **és** a Zod-guard is, így a kettő nem csúszhat el. A kimenet a `ToolOutcome` alakot követi, hogy a loop és a Trace változatlanul kezelje.

Referencia: `git -C ../ai-agent-kurzus show 61b9ed5:packages/core/src/lib/tools/client-preferences.ts`

- [ ] **Step 2: Vedd fel a `tools` tömbbe ÉS a dispatchbe**

Mindkettő kell — csak a tömbbe felvéve a trace-ben `Ismeretlen tool: getClientPreferences` jelenik meg.

- [ ] **Step 3: Említsd meg a promptban**

A `prompts.ts` `<tools>` szekciójába egy sor a `getClientPreferences`-ről. **A tool léte önmagában kevés** — ha a prompt nem említi, a modell sosem hívja.

⚠️ Ez megbontja a `SYSTEM_PROMPT` bájtazonosságát a `docs/system-prompt.md`-vel. Ezért a Task 8 frissíti a `docs/system-prompt.md`-t is, ugyanezzel a sorral — a kettő maradjon lockstepben.

- [ ] **Step 4: Ellenőrzés**

Run: `pnpm nx run core:typecheck && pnpm nx test core && pnpm nx test cli`
Expected: zöld; a `prompts.spec.ts` 10 tesztje továbbra is fut.

---

### Task 8: `CLAUDE.md`-igazítás és záró élő ellenőrzés

**Ezt nem szabad mellékhatásként megtörténni hagyni.** A 03. alkalom három ponton avítja el a `CLAUDE.md`-t.

**Files:** Modify: `CLAUDE.md`, `docs/system-prompt.md`

- [ ] **Step 1: Frissítsd a `CLAUDE.md` három pontját**

1. **„must stay byte-identical to `docs/system-prompt.md`"** — a fájl neve `prompts.ts`, és a `SYSTEM_PROMPT` konstans az, ami bájtazonos; a `buildSystemPrompt()` wrapper ezt adja vissza.
2. **„Key files" felsorolás** — `runsql-tool.ts` / `sql-guard.ts` / `db-readonly.ts` / `list-categories-tool.ts` → `lib/tools/` alá, plusz `tools/index.ts` (dispatch) és `trace.ts`.
3. **„Transparency by default"** — a JSONL-logolás **és** a Trace mostantól egymás mellett él; `--show-prompt` megmaradt, `--quiet` új.

- [ ] **Step 2: Vezesd át a prompt-változást a `docs/system-prompt.md`-be**

A Task 7 Step 3 sorát tedd bele a `docs/system-prompt.md`-be is.

Run: `diff <(sed -n '/^export const SYSTEM_PROMPT = `/,/^`;$/p' packages/core/src/lib/prompts.ts | sed '1d;$d') docs/system-prompt.md`
Expected: nincs eltérés. (Ha a `docs/system-prompt.md` más tagolású, igazítsd az összehasonlítást — a lényeg, hogy a két szöveg egyezzen.)

- [ ] **Step 3: Teljes automata kapu**

Run: `pnpm nx run core:typecheck && pnpm nx run cli:typecheck && pnpm nx test core && pnpm nx test cli`
Expected: zöld, és a darabszám **nem alacsonyabb** a Task 0 Step 5-ben rögzítettnél (a Task 1 és 7 még hozzá is tett).

- [ ] **Step 4: A doksi „Végállapot ellenőrzése" blokkja, élőben**

Most jönnek az API-költséges hívások, egyszerre:

```bash
# 2. A kontextus-növekedés látszik
pnpm szobakertesz ask "Hány kaktusz van készleten?"
#    -> a trace körönként egyre nagyobb messages tömböt mutat

# 3. Két tool, egy loop
pnpm szobakertesz ask "Mit ajánlasz az INITECH-nek 250000 Ft-ból?"
#    -> a trace-ben getClientPreferences ÉS runSql is lefut

# 4. A beszélgetés-memória él
pnpm szobakertesz
#    interaktív módban visszautaló kérdés ("és olcsóbbat?")
#    -> a válasz az előző fordulóra épül

# 5. A watch-log független
tail -f logs/agent.log   # másik terminálban, --quiet mellett is folyik
```

**A tényleges kimenettel számolj be, ne a várttal.** Bármelyik nem teljesül → STOP, és jelezd.

- [ ] **Step 5: Regresszió-kapu — a saját kiegészítések élőben**

```bash
pnpm szobakertesz ask "Milyen növénykategóriák közül választhatok?"
#    -> a trace-ben listCategories fut le, NEM runSql
```

Ez az egyetlen olyan állítás, amit unit teszt nem tud kikényszeríteni (a modell választ). Ha `runSql`-t hív helyette, az nem feltétlenül bug — de jelezni kell, és a `<tools>` szekció megfogalmazását át kell nézni.

- [ ] **Step 6: Lezárás**

Használd a `superpowers:verification-before-completion` skillt a spec négy kész-feltételére. **Commit nincs**, hacsak a felhasználó nem kéri.

---

## Ami NEM ebbe az alkalomba tartozik

A 06-os plan viszi: read-only grantok migrációba (annak legelső lépéseként), `CREATE EXTENSION IF NOT EXISTS "vector"`, `OPENAI_API_KEY`. Már megvan: pgvector image (`5cab1a0`), `allowBuilds` (`cb4655b`).
