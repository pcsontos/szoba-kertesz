# 04. alkalom — Framework-migráció és a második agent — Implementációs terv

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A kézzel írt tool-hurok helyére a Vercel AI SDK 7 `generateText` loopja kerül a transzparencia elvesztése nélkül, a `core` szerkezete `agents/` + `tools/` bontásra áll át közös `agent-loop.ts`-szel, és bejön a második, **író** agent (`ingest`) saját jogosultsági szintű DB-kapcsolattal — úgy, hogy mind a hét saját kiegészítés bizonyítottan túléli.

**Architecture:** Egy agent = **prompt + toolok + loop**. A loop egyetlen közös `runAgentLoop` (AI SDK `generateText`, `stopWhen: isStepCount(n)`, `prepareStep`/`onStepEnd` hookokon a változatlan Trace). A tool-réteg kétrétegű marad: a saját Zod+guard határvédelem (`execute*`) alatta, az AI SDK `tool()` definíció fölötte. A read/write szétválasztás a tool-rétegben és **a Postgres szerepkörök szintjén** történik: a query-agent `szoba-kertesz_ro`-n olvas, az ingest-agent egy új `szoba-kertesz_rw` szerepen ír, kizárólag egyetlen, szigorúan validált `upsertProduct` úton — nyers write-SQL nincs.

**Tech Stack:** TypeScript (strict, nodenext), Nx 23, pnpm 11.12.0, Node v25.2.1, Vitest 4.1.9, **Vercel AI SDK 7** (`ai@7.0.66`) + `@ai-sdk/anthropic@4.0.39`, Zod 4, commander, `node:readline`, PostgreSQL 16 + Prisma 6.

---

## Global Constraints

Ezek minden task követelményeihez implicit módon hozzátartoznak.

**Precedencia ütközésnél** (a `docs/superpowers/specs/2026-08-11-hf3-eloprogram-vegrehajtas-design.md` szerint):

1. A vault `HF3-eloprogram.md` „Végrehajtási protokoll" szakasza — felülírja a superpowers defaultjait.
2. A kódvezetés-doksi (`04-agent-ami-soha-nem-alszik_kodvezetes.md`) — a lépések forrása.
3. A projekt `CLAUDE.md` invariánsai.
4. Minden más superpowers-elem.

**Commit, push, PR CSAK kérésre** (protokoll 7.). A skill „frequent commits" defaultja **nem érvényes** — egyetlen task sem zárul commit-lépéssel. Kivétel: a **Task 4** (CI) értelmezhetetlen PR nélkül, ezért ott a push+PR explicit, külön megjelölt, felhasználói jóváhagyáshoz kötött lépés.

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
| `pnpm cli ask "…"` | `pnpm cli ask "…"` (tsx, forrásból — a `--conditions=@szoba-kertesz/source` flag load-bearing) |
| `pnpm cli ingest` | `pnpm cli ingest "…"` (a Task 9-ben jön létre) |
| `pnpm db:studio` | `pnpm exec prisma studio` |

**Darabszám-kapu:** az induló alap **core 90 teszt / 13 fájl**, **cli 9 teszt / 3 fájl** (mérve 2026-08-16-án, `pnpm nx test core` + `pnpm nx test cli`). Minden teszt-futtatás kiírja a számot; **csökkenés = megállás**, akkor is, ha a suite zöld. Egyetlen tervezett kivétel: a **Task 3** átírja az `agent.spec.ts` 7 tesztjét — ott a kapu az, hogy az utódfájl **legalább 7** tesztet tartalmaz, és mind a hét eredeti viselkedést lefedi (a task tételesen felsorolja).

**Manifeszt-kapu:** a `packages/core/src/lib/own-additions.spec.ts` (11 teszt → a Task 1 után **14**) és az `apps/cli/src/own-additions.spec.ts` (3 teszt) **minden task után zöld**. Ezek a 7 saját kiegészítés védőhálói — NE töröld, NE gyengítsd őket.

> ⚠️ **A Task 1 végrehajtása közben talált lelet (2026-08-16).** A core manifeszt **nem teljesen refaktor-stabil**: a „beszélgetés-memória (03. alkalom, c00055a)" blokk `askAgent`-et hív `deps.client`-tel injektált **Anthropic-mockkal**, és a `sent.messages[0].content`-en állít. A Task 3 megszünteti a `deps.client`-et, tehát **ez az egy teszt a Task 3-ban törni fog** — ez tervezett, nem regresszió. A Task 3 Step 4b írja át a mock-modell szeamre. A manifeszt többi 13 tesztje érintetlen marad.

**A hét saját kiegészítés, amit minden refaktornak túl kell élnie:**

| # | Kiegészítés | Mi fenyegeti ebben az alkalomban |
|---|---|---|
| 1 | `listCategories` tool | a kurzusnál 2 tool van; a query-agent `buildTools`-ába mindhárom kell |
| 2 | `SELECT INTO` tiltás + pool zárása | a `sql-guard.ts` áthelyezése (Task 5) |
| 3 | LIMIT subquery-be csomagolva | ugyanaz |
| 4 | readline-guard a pufferelt sorokra | az `interactive.ts` átírása (Task 9) |
| 5 | javított system prompt | a `prompts.ts` → `query-prompt.ts` átnevezés (Task 5) |
| 6 | JSONL-logger (token usage) | **a kurzus `agent.ts`-e nem hívja `logInteraction`-t** (Task 3) — T3 |
| 7 | `--show-prompt` kapcsoló | **a kurzus `AskResult`-jában nincs `systemPrompt`** (Task 3) — T3 |

**T3-döntések, tervezési időben feloldva** (futásidőben nincs mérlegelés):

- **#6 és #7 marad.** A `runAgentLoop` visszaadja a `systemPrompt`-ot, és a végén meghívja a JSONL-loggert `toolSteps`-szel együtt. A kurzus `AskResult`-ja **bővül**, nem cserélődik.
- **A `MAX_TOOL_ITERATIONS` túllépése nem dob többé.** Ma `throw`; az AI SDK-nál a loop csendben megáll, és a `emptyAnswer` szöveg megy vissza. Ez viselkedésváltozás — a Task 3 tételesen átvezeti az `agent.spec.ts` idevágó tesztjét.
- **Sorrend-eltérés a doksitól (tervezési döntés):** a doksi sorrendje 1→2→3→4→5, de az **átszervezés (Lépés 4+5) előre kerül a második agent elé**. Indok: a doksi Lépés 3-a órai élő build, amit a Lépés 4 utólag takarít; ha előbb áll a szerkezet, az ingest-agent egyszer íródik meg, nem kétszer. A doksi minden lépése végrehajtásra kerül, csak más sorrendben: **1 → 2 → 4+5 → 3 → docs → élő ellenőrzés.**

**Ellenőrzött AI SDK 7 tények** (mérve `ai@7.0.66` + `@ai-sdk/anthropic@4.0.39` telepített `.d.ts`-én és futtatott próbán, 2026-08-16 — a doksi kódja **AI SDK 6-ra** íródott, ezek az eltérések):

| A doksi (SDK 6) | AI SDK 7 — ez a helyes | Bizonyíték |
|---|---|---|
| `stepCountIs(n)` | **`isStepCount(n)`** (a régi név deprecated aliasként még létezik) | `typeof require('ai').isStepCount === 'function'` |
| `onStepFinish` | **`onStepEnd`** (a régi deprecated) | migration-guide-7-0 |
| `result.totalUsage` | **`result.usage`** = az összes kör összege; `result.finalStep.usage` = csak az utolsó | próbafutás: `usage {inputTokens:45,outputTokens:35}` két körre (15+30 / 25+10) |
| `result.response.messages` | **`result.responseMessages`** | ⚠️ **a v7-ben a `response.messages` CSAK az utolsó kört tartalmazza** (`["assistant"]`), a `responseMessages` a teljeset (`["assistant","tool","assistant"]`). A doksi sora a beszélgetés-memóriából **némán elhagyná a tool-váltást.** |

További mért tények, amikre a taskok támaszkodnak:

- `prepareStep: ({ stepNumber, messages }) => ({})` — `stepNumber` **0-alapú** (mért: `[{stepNumber:0,msgCount:1},{stepNumber:1,msgCount:3}]`), ezért a Trace-nek `stepNumber + 1` megy.
- `step.finishReason` és `result.finishReason` az **ai szintjén sima string** (`'tool-calls'`, `'stop'`) — az objektum-alak (`{ unified: … }`) csak a provider-szinten él.
- `step.usage.inputTokens` / `.outputTokens` **lapos `number | undefined`** az ai szintjén.
- `@ai-sdk/anthropic@4` `specificationVersion` = **`'v4'`** → a tesztekben **`MockLanguageModelV4`** (nem V3).
- A mock `doGenerate` **provider-szintű** alakot kell adjon: `finishReason: { unified: 'tool-calls' }` és `usage: { inputTokens: { total, noCache, cacheRead, cacheWrite }, outputTokens: { total, text, reasoning }, totalTokens }`. Lapos alakkal a `finishReason` `undefined`-ként és a token-számok `undefined`-ként jönnek vissza — némán.
- A `tool-result` üzenetblokk alakja: `{ type: 'tool-result', toolCallId, toolName, output: { type: 'text', value: string } }` — a Trace `renderMessage`-ének ezt kell lapítania.
- `ai@7` `"type": "module"`, exports-mapjében **nincs `require` feltétel** (`engines.node >= 22`). A CLI CJS-buildje (esbuild, `bundle: false`) a `core` ESM-distjét Node ≥22 `require(esm)`-mel tölti — ez ma is így működik, de a Task 3 ellenőrzése kimondottan kitér rá.

**Élő ellenőrzés:** taskonként csak `typecheck` + teszt fut (ingyenes). Az API-költséges `pnpm cli ask/ingest` hívások a **Task 11-ben**, egyszerre.

**Előfeltétel:** a DB fut és seedelt (`docker compose up -d`; a `core` egyes specjei valós DB-t hívnak).

---

## File Structure

**Létrejön:**

| Fájl | Felelősség |
|---|---|
| `packages/core/src/lib/tools/tool-outcome.ts` | a közös `ToolOutcome` alak + `ToolReporter` típus |
| `packages/core/src/lib/agents/agent-loop.ts` | a KÖZÖS loop (`runAgentLoop`, `AgentDefinition`) |
| `packages/core/src/lib/agents/agent-loop.spec.ts` | az `agent.spec.ts` utódja, `MockLanguageModelV4`-gyel |
| `packages/core/src/lib/agents/query-agent/query-agent.ts` | a kérdés-válasz agent (3 tool) |
| `packages/core/src/lib/agents/query-agent/query-prompt.ts` | a `prompts.ts` utódja |
| `packages/core/src/lib/agents/ingest-agent/ingest-agent.ts` | a második, ÍRÓ agent |
| `packages/core/src/lib/agents/ingest-agent/ingest-prompt.ts` | az ingest system promptja |
| `packages/core/src/lib/tools/upsert-product/product-schema.ts` | Zod-séma + oszlop-térkép |
| `packages/core/src/lib/tools/upsert-product/db-readwrite.ts` | a `szoba-kertesz_rw` kapcsolat |
| `packages/core/src/lib/tools/upsert-product/upsert-product-tool.ts` | az EGYETLEN írási út |
| `packages/core/src/lib/tools/fetch-feed/shopify-feed.ts` | a Shopify-feed motor (LLM nélkül) |
| `packages/core/src/lib/tools/fetch-feed/fetch-feed-tool.ts` | a tool-héj a feedhez |
| `packages/db/prisma/migrations/<ts>_readonly_readwrite_roles/migration.sql` | a két szerepkör grantjai migrációban |
| `.github/workflows/ci.yml`, `.github/workflows/claude-review.yml` | CI |

**Áthelyeződik** (Task 5, `git mv`-vel, hogy a történet megmaradjon):

```
lib/agent.ts                    → lib/agents/agent-loop.ts
lib/prompts.ts                  → lib/agents/query-agent/query-prompt.ts
lib/prompts.spec.ts             → lib/agents/query-agent/query-prompt.spec.ts
lib/tools/run-sql.ts            → lib/tools/run-sql/run-sql-tool.ts
lib/tools/run-sql.spec.ts       → lib/tools/run-sql/run-sql-tool.spec.ts
lib/tools/sql-guard.ts          → lib/tools/run-sql/sql-guard.ts
lib/tools/sql-guard.spec.ts     → lib/tools/run-sql/sql-guard.spec.ts
lib/tools/db-readonly.ts        → lib/tools/run-sql/db-readonly.ts
lib/tools/db-readonly.spec.ts   → lib/tools/run-sql/db-readonly.spec.ts
lib/tools/list-categories.ts    → lib/tools/list-categories/list-categories-tool.ts
lib/tools/list-categories.spec.ts → lib/tools/list-categories/list-categories-tool.spec.ts
lib/tools/client-preferences.ts → lib/tools/get-client-preferences/get-client-preferences-tool.ts
lib/tools/client-preferences.spec.ts → lib/tools/get-client-preferences/get-client-preferences-tool.spec.ts
```

**Törlődik:** `lib/tools/index.ts` (a központi dispatch — helyette agentenkénti toolset).

**Módosul:** `packages/core/src/index.ts`, `lib/trace.ts`, `lib/config.ts`, `apps/cli/src/{main,interactive}.ts`, `packages/core/package.json`, root `package.json`, `init.sql`, `.env`, `CLAUDE.md`, `docs/konvenciók.md`, `docs/architektura.md`.

**NEM törlődik** (T3, eldöntve): `lib/logger.ts`, `logger.spec.ts`, `own-additions.spec.ts` (mindkettő), a `--show-prompt` kapcsoló, a `szobakertesz` / `szobakertesz:debug` scriptek.

---

### Task 0: Branch, AI SDK 7 függőségek, alapszám

**Files:**
- Modify: `packages/core/package.json`, `package.json` (root)

**Interfaces:**
- Produces: telepített `ai@^7.0.66` + `@ai-sdk/anthropic@^4.0.39`; rögzített teszt-alapszám.

- [ ] **Step 1: Ellenőrizd a kiindulási állapotot (T4-kapu)**

```bash
git status --porcelain && git branch --show-current
docker compose ps
node -v
```

Expected: tiszta working tree, `master`, futó `szoba-kertesz-adatbazis` konténer, Node **≥ 22** (mérve: v25.2.1 — az `ai@7` `engines.node >= 22`). Bármelyik eltér → STOP.

- [ ] **Step 2: Hozd létre a branchet**

```bash
git checkout -b feat/ora-04-multiagent
```

A 03. munkája már a `master`-ben van (`9e56bae` merge PR #1), ezért innen ágazunk, nem a `feat/ora-03-trace-tools`-ról.

- [ ] **Step 3: Rögzítsd az alapszámot**

```bash
pnpm nx reset && pnpm nx test core && pnpm nx test cli
```

Expected: **core 90 teszt / 13 fájl**, **cli 9 teszt / 3 fájl**. Írd le a két számot. Eltérés → STOP (T4).

> Az `nx reset` azért kell, mert az Nx cache-ből is „zöldet" olvas — a darabszám-kapuhoz valódi futás kell.

- [ ] **Step 4: Telepítsd az AI SDK 7-et a `core`-ba**

```bash
pnpm --filter @szoba-kertesz/core add ai@^7.0.66 @ai-sdk/anthropic@^4.0.39
```

A `@anthropic-ai/sdk` **egyelőre marad** — a Task 3 végén vezetjük ki, amikor már semmi nem importálja.

- [ ] **Step 5: Ellenőrzés**

```bash
# ⚠️ A `cd packages/core` KELL: a pnpm a függőséget a csomag saját node_modules-ébe
# telepíti, a repo gyökeréből a require('ai') MODULE_NOT_FOUND-dal hasal el.
(cd packages/core && node -e "const ai=require('ai');console.log('isStepCount',typeof ai.isStepCount,'| generateText',typeof ai.generateText);console.log('ai',require('ai/package.json').version,'| @ai-sdk/anthropic',require('@ai-sdk/anthropic/package.json').version)")

pnpm nx run core:typecheck && pnpm nx run cli:typecheck
# A darabszám-kapuhoz VALÓDI futás kell — az Nx cache-ből is „zöldet" olvasna.
pnpm nx test core --skip-nx-cache && pnpm nx test cli --skip-nx-cache
```

Expected: `isStepCount function | generateText function`, `ai 7.0.66 | @ai-sdk/anthropic 4.0.39`; typecheck zöld; **core 90, cli 9** (a függőség még nincs használatban, tehát nem változhat). Csökkenés → STOP.

> **Végrehajtva 2026-08-16:** mind a négy ellenőrzés zölden lefutott a fenti értékekkel. A `@anthropic-ai/sdk` szándékosan a `packages/core/package.json`-ban maradt — a Task 3 Step 6 vezeti ki.
>
> ⚠️ **Amit ez a lépés NEM ellenőrzött (a Task 2-ben derült ki):** a `lint` hiányzott a kapuból. A `@nx/dependency-checks` szabály hibát ad a deklarált, de még nem használt függőségekre — a Task 0 után **mindkét** új csomagra (`ai`, `@ai-sdk/anthropic`), a Task 2 után már csak a `@ai-sdk/anthropic`-ra (az `ai`-t a tool-factory-k használják). Ez **tervezett, átmeneti pirosság**: a `createAnthropic` importja a Task 3 Step 3-ban oldja fel. Mostantól minden task ellenőrzésében szerepel a `lint` is.

---

### Task 1: Manifeszt-keményítés a migráció ELŐTT

A Task 3 három drótot fenyeget (JSONL-logger, `systemPrompt`, `listCategories`). Ezek a manifeszt-állítások **refaktor-stabilak**: a csomag publikus felületén dolgoznak, és nem az `askAgent` injektálási mechanizmusán — így a Task 3 után is érvényesek maradnak.

**Files:**
- Modify: `packages/core/src/lib/own-additions.spec.ts`

**Interfaces:**
- Consumes: `SYSTEM_PROMPT`, `askAgent`, `LIST_CATEGORIES_TOOL_NAME` a `../index.js`-ből.
- Produces: 3 új manifeszt-teszt (core 90 → **93**).

- [ ] **Step 1: Írd hozzá a három állítást a core manifeszt végére**

```typescript
// packages/core/src/lib/own-additions.spec.ts — hozzáfűzés a fájl VÉGÉRE.
// Ez a három blokk azt a három drótot rögzíti, amit a 04. alkalom framework-migrációja
// (Task 3) elvágna. SZÁNDÉKOSAN típus- és névszinten állít, nem az askAgent belső
// injektálási mechanizmusán — így a migráció után is változtatás nélkül érvényes.

describe('saját kiegészítés 7 — a --show-prompt adatforrása', () => {
  it('az askAgent eredménye típusszinten hordozza a systemPrompt-ot', async () => {
    const mod = await import('../index.js');
    // Fordítási idejű állítás: ha az AskResult-ból kiesik a systemPrompt,
    // ez a sor NEM fordul le, és a typecheck bukik — nem csak a teszt.
    type Result = Awaited<ReturnType<typeof mod.askAgent>>;
    const assertHasSystemPrompt = (r: Result): string => r.systemPrompt;
    expect(typeof assertHasSystemPrompt).toBe('function');
  });
});

describe('saját kiegészítés 6 — a JSONL-logger a csomag felületén marad', () => {
  it('a logInteraction és a session-fájl útja exportált marad', async () => {
    const mod = await import('../index.js');
    expect(typeof mod.logInteraction).toBe('function');
    expect(typeof mod.getSessionLogFilePath).toBe('function');
  });
});

describe('saját kiegészítés 1 — a listCategories neve nem tűnhet el', () => {
  it('a tool neve exportált konstans, és pontosan "listCategories"', async () => {
    const mod = await import('../index.js');
    expect(mod.LIST_CATEGORIES_TOOL_NAME).toBe('listCategories');
  });
});
```

- [ ] **Step 2: Futtasd, és igazítsd a tényleges exportokhoz**

Run: `pnpm nx test core`

A `logInteraction` és a `LIST_CATEGORIES_TOOL_NAME` export ellenőrizve (`packages/core/src/index.ts` újraexportálja a `logger.js`-t és a `tools/list-categories.js`-t). A `getSessionLogFilePath` a `logger.ts`-ből jön — ha más a neve, **a tesztet igazítsd a kódhoz**, ne fordítva; a 03-as manifeszt ugyanezt a nevet használja.

Expected: mindhárom új blokk zöld.

- [ ] **Step 3: Ellenőrzés**

```bash
pnpm nx run core:typecheck && pnpm nx test core && pnpm nx test cli
```

Expected: zöld; **core 93** (90 + 3), **cli 9**. Ez az új alapszám a Task 3-ig.

---

### Task 2: A közös `ToolOutcome` + az AI SDK tool-réteg a guardok FÖLÉ

Tisztán additív: a meglévő `execute*` határvédelem, a Zod-validáció, a `sql-guard` és a hozzájuk tartozó tesztek **egy karaktert sem változnak**. Csak egy vékony `tool()` adapter kerül föléjük. Az agent-loop még a régi.

**Files:**
- Create: `packages/core/src/lib/tools/tool-outcome.ts`
- Modify: `packages/core/src/lib/tools/run-sql.ts`, `list-categories.ts`, `client-preferences.ts`, `packages/core/src/index.ts`

**Interfaces:**
- Produces: `ToolOutcome` (`content`/`isError`/`summary`/`rowCount`), `ToolReporter`, és három tool-factory: `runSqlTool(report?)`, `listCategoriesTool(report?)`, `getClientPreferencesTool(report?)` — mind `Tool`-t ad vissza az `ai` csomagból.

> **Miért nem a meglévő `ToolOutcome`?** A `tools/index.ts` mai `ToolOutcome`-ja (`ok`/`sql`/`rowCount`/`resultSummary`) a JSONL-logger `ToolStep` szerződését szolgálja ki. Az új alak a kurzusé (`content`/`isError`/`summary`/`rowCount`), mert a Trace és a loop ezt várja. A kettő **egymás mellett él** a Task 3 végéig: a `tools/index.ts` régi alakja addig marad, amíg az `agent.ts` használja, és a Task 5-ben tűnik el a fájllal együtt. A JSONL-logger felé a Task 3 képezi le az új alakot a `ToolStep`-re.

- [ ] **Step 1: Írd meg a közös outcome-alakot**

```typescript
// packages/core/src/lib/tools/tool-outcome.ts
// A KÖZÖS tool-eredmény alak. Minden tool execute-ja ezt adja vissza, és SOHA nem dob:
// a hiba is a modellnek visszaadható magyar szöveg (isError: true). Ettől tud a loop és a
// Trace BÁRMILYEN toolt egyformán kezelni — az agent-loop nem tudja, milyen toolok léteznek.

export interface ToolOutcome {
  /** Amit a modell visszakap (a tool_result tartalma). EZ a közös lényeg. */
  readonly content: string;
  readonly isError: boolean;
  /** Egysoros humán összegzés a Trace-nek (pl. a guardolt SQL, vagy "UPSERT (created)"). */
  readonly summary: string | null;
  /** Érintett sorok/találatok száma a Trace-nek (ha értelmezhető). */
  readonly rowCount: number | null;
}

/**
 * A tool ezzel jelenti a futását a Trace-nek. A modell CSAK a `content`-et látja;
 * a Trace viszont a teljes outcome-ot megkapja — ez a mellék-csatorna teszi lehetővé,
 * hogy a guardolt SQL és a sorszám a nyomban is megjelenjen.
 */
export type ToolReporter = (
  toolCallId: string,
  name: string,
  input: unknown,
  outcome: ToolOutcome,
) => void;
```

- [ ] **Step 2: Tedd a `run-sql.ts` VÉGÉRE a tool-factory-t**

A fájl meglévő tartalma (`RunSqlInputSchema`, `runSqlToolDefinition`, `executeRunSqlTool`) **változatlan marad** — csak hozzáfűzöl:

```typescript
import { tool } from 'ai';
import type { ToolOutcome, ToolReporter } from './tool-outcome.js';

/**
 * Az AI SDK felé eső tool-definíció. A séma SZÁNDÉKOSAN megengedő (csak típus):
 * a szigorú validáció az `executeRunSqlTool`-ban marad, így hibás bemenetre is a
 * SAJÁT magyar hibaszövegünk megy vissza a modellnek, nem az SDK kivétele.
 */
export const runSqlTool = (report?: ToolReporter) =>
  tool({
    description: runSqlToolDefinition.description,
    inputSchema: z.object({
      query: z
        .string()
        .describe('Egyetlen SELECT SQL utasítás a products táblán (LIMIT-tel).'),
    }),
    execute: async (input, { toolCallId }) => {
      const result = await executeRunSqlTool(input);
      const outcome: ToolOutcome = result.ok
        ? {
            content: JSON.stringify(result.rows),
            isError: false,
            summary: result.sql,
            rowCount: result.rowCount,
          }
        : {
            content: result.error,
            isError: true,
            summary: result.sql ?? null,
            rowCount: null,
          };
      report?.(toolCallId, RUN_SQL_TOOL_NAME, input, outcome);
      return outcome.content; // a modell PONTOSAN azt kapja, amit a kézi loopban is
    },
  });
```

> A `description` a meglévő `runSqlToolDefinition`-ből jön, nem duplikálva — így a modell felé eső szöveg egy helyen marad, és nem csúszhat el a `docs/system-prompt.md` `<tools>` szekciójától.
>
> **A `deps` injektálás elvesztéséről:** az `executeRunSqlTool(input)` itt `deps` nélkül hívódik, tehát a valódi, megosztott read-only poolt használja. A `deps`-es hívási alak megmarad a függvényen, és a `run-sql.spec.ts` továbbra is azt teszteli — a tool-factory csak a produkciós utat köti be.

- [ ] **Step 3: Ugyanez a `list-categories.ts` végére**

```typescript
import { tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from './tool-outcome.js';

export const listCategoriesTool = (report?: ToolReporter) =>
  tool({
    description: listCategoriesToolDefinition.description,
    // Paraméter nélküli tool — üres objektum-séma.
    inputSchema: z.object({}),
    execute: async (input, { toolCallId }) => {
      const result = await executeListCategoriesTool(input);
      const outcome: ToolOutcome = result.ok
        ? {
            content: JSON.stringify(result.categories),
            isError: false,
            summary: `${result.categories.length} kategória`,
            rowCount: result.categories.length,
          }
        : { content: result.error, isError: true, summary: null, rowCount: null };
      report?.(toolCallId, LIST_CATEGORIES_TOOL_NAME, input, outcome);
      return outcome.content;
    },
  });
```

- [ ] **Step 4: Ugyanez a `client-preferences.ts` végére**

```typescript
import { tool } from 'ai';
import type { ToolOutcome, ToolReporter } from './tool-outcome.js';

export const getClientPreferencesTool = (report?: ToolReporter) =>
  tool({
    description: getClientPreferencesToolDefinition.description,
    inputSchema: z.object({
      clientCode: z
        .string()
        .describe('Az ügyfél kódja, amelyhez a preferenciákat kérjük.'),
    }),
    execute: async (input, { toolCallId }) => {
      const result = await executeGetClientPreferencesTool(input);
      const outcome: ToolOutcome = result.ok
        ? {
            content: JSON.stringify(result.preference),
            isError: false,
            summary: `${result.clientCode} · keret ${result.preference.budget} Ft · ${result.preference.careLevel}`,
            rowCount: null,
          }
        : { content: result.error, isError: true, summary: null, rowCount: null };
      report?.(toolCallId, GET_CLIENT_PREFERENCES_TOOL_NAME, input, outcome);
      return outcome.content;
    },
  });
```

> A `z.enum(CLIENT_CODES)` helyett itt szándékosan `z.string()` áll a modell-sémában: az érvényes kódok listája a `description`-ben van, a szigorú enum-ellenőrzés pedig az `executeGetClientPreferencesTool`-ban — így ismeretlen kódra a saját magyar hibaszövegünk megy vissza, amiből a modell javítani tud.

- [ ] **Step 5: Vedd fel az exportot — ⚠️ NEM `export *`-gal**

`packages/core/src/index.ts`, a `tools/index.js` sora **fölé**:

```typescript
// A `ToolOutcome` SZÁNDÉKOSAN nem innen jön még: a `tools/index.ts` régi,
// azonos nevű típusa ütközne vele (TS2308 — `export *` nem old fel
// kétértelműséget). A két alak a Task 5-ig egymás mellett él; ott a
// `tools/index.ts` törlődik, és ez a sor `export *`-ra bővül.
export type { ToolReporter } from './lib/tools/tool-outcome.js';
```

> **Végrehajtási lelet (2026-08-16, T5).** A terv eredetileg `export * from './lib/tools/tool-outcome.js';`-t írt elő. Ez **nem fordul le**:
>
> ```
> src/index.ts(12,1): error TS2308: Module './lib/tools/tool-outcome.js' has
>   already exported a member named 'ToolOutcome'. Consider explicitly
>   re-exporting to resolve the ambiguity.
> ```
>
> A fenti, névre szűkített re-export a javítás. A csomagon KÍVÜLRŐL az új `ToolOutcome`-ra a Task 5-ig nincs szükség (az `agent.ts` közvetlen fájlútvonalon importálja), tehát ez nem korlátoz semmit.

- [ ] **Step 5b: Annotáld a tool-factory-k visszatérési típusát — ⚠️ pnpm-specifikus**

A három `export const …Tool = (report?: ToolReporter) => tool({…})` **típusannotáció nélkül nem fordul le** ebben a repóban:

```
src/lib/tools/run-sql.ts(119,14): error TS2742: The inferred type of 'runSqlTool'
  cannot be named without a reference to
  '.pnpm/@ai-sdk+provider-utils@5.0.27_zod@4.4.3/node_modules/@ai-sdk/provider-utils'.
  This is likely not portable. A type annotation is necessary.
```

**Ok:** a `core` `emitDeclarationOnly`/`composite` módban fordul, és a pnpm izolált `node_modules`-szerkezetében a `tool()` következtetett típusa tranzitív csomagokra hivatkozna, amiket a `.d.ts` nem tud megnevezni. (Lapos npm-telepítés + `noEmit` mellett ez a hiba **nem jelentkezik** — ezért nem fogta meg a tervezéskor futtatott scratchpad-próba.)

**Javítás:** explicit `Tool<INPUT, OUTPUT>` annotáció, a `Tool` típust az `ai`-ból importálva:

```typescript
import { tool, type Tool } from 'ai';

export const runSqlTool = (
  report?: ToolReporter,
): Tool<{ query: string }, string> => tool({ /* … */ });

export const listCategoriesTool = (
  report?: ToolReporter,
): Tool<Record<string, never>, string> => tool({ /* … */ });

export const getClientPreferencesTool = (
  report?: ToolReporter,
): Tool<{ clientCode: string }, string> => tool({ /* … */ });
```

Ugyanez a minta kell majd a Task 7 `upsertProductTool`-jára és a Task 8 `fetchFeedTool`-jára is.

Egy apróság még: a `description: xToolDefinition.description` **`string | undefined`** (az `Anthropic.Tool.description` opcionális), a `tool()` viszont `string`-et vár — `?? ''` kell a végére.

- [ ] **Step 6: Ellenőrzés**

```bash
pnpm nx run core:typecheck --skip-nx-cache && pnpm nx run cli:typecheck --skip-nx-cache
pnpm nx test core --skip-nx-cache && pnpm nx test cli --skip-nx-cache
pnpm nx run core:lint --skip-nx-cache
```

Expected: typecheck és teszt zöld; **core 93, cli 9** — a darabszám nem változik (adapter-réteg, még nincs saját tesztje; a Task 3 loop-tesztje fogja meghajtani). Csökkenés → STOP.

A `lint` **egyetlen, ismert hibát ad**, és ez rendben van:

```
The "@ai-sdk/anthropic" package is not used by "@szoba-kertesz/core" project  @nx/dependency-checks
```

A `createAnthropic` importja a Task 3 Step 3-ban oldja fel. **Bármi MÁS lint-hiba → STOP.**

> **Végrehajtva 2026-08-16:** core 93 / cli 9, mindkét typecheck zöld, lint pontosan a fenti egy hibával.

---

### Task 3: A kézi loop lecserélése AI SDK 7-re (doksi Lépés 1)

A lecke magja. **A viselkedés a felhasználó szemszögéből nem változhat** — kivéve az egy, tervezett eltérést (lásd Step 5).

**Files:**
- Modify: `packages/core/src/lib/agent.ts`, `packages/core/src/lib/trace.ts`
- Rewrite: `packages/core/src/lib/agent.spec.ts`
- Modify: `packages/core/src/lib/trace.spec.ts`, `packages/core/package.json`

**Interfaces:**
- Consumes: `ToolOutcome`, `ToolReporter`, `runSqlTool`, `listCategoriesTool`, `getClientPreferencesTool` (Task 2).
- Produces: `askAgent(question, deps): Promise<AskAgentResult>` **változatlan névvel és bővített, de kompatibilis eredménnyel**: `{ answer, systemPrompt, messages, usage, toolSteps, stopReason }`. A `messages` típusa `ChatMessage[]` **helyett** `ModelMessage[]` (az AI SDK alakja) — az `interactive.ts` és a `print-prompt.ts` ezt kapja.

- [ ] **Step 1: Vedd át a doksi fejléc-kommentjét szó szerint**

Ez a lecke legfontosabb bekezdése — fél év múlva ez mondja meg, mit rejtett el a framework. Az `agent.ts` **legelejére**, a `<!-- SDK 7 -->` igazításokkal:

```typescript
// agent.ts — az agent-loop a Vercel AI SDK-n. A 2–3. órán KÉZZEL írtuk meg ugyanezt
// (prompt → hívás → stop_reason → tool → tool_result → vissza) a nyers Anthropic SDK fölött —
// ezért pontosan tudjuk, mit csinál helyettünk a framework:
//   - a loopot a `generateText` pörgeti, amíg a modell toolt kér (finishReason: 'tool-calls'),
//   - a kör-limitünk a `stopWhen: isStepCount(n)` (régen: MAX_TOOL_ITERATIONS for-ciklus),
//   - a tool-dispatch a tool-definíciók `execute`-ja (régen: executeTool switch),
//   - a kontextus-görgetést (üzenetek hozzáfűzése körről körre) az SDK végzi.
// A TRANSZPARENCIA marad: a `prepareStep` hookban látjuk, MIT küldünk ki minden körben,
// az `onStepEnd`-ben pedig, MI történt — a Trace ugyanazt a színes nyomot írja, mint eddig.
//
// AI SDK 7 eltérések a 4. óra doksijához (ami SDK 6-ra íródott):
//   stepCountIs → isStepCount · onStepFinish → onStepEnd · totalUsage → usage
//   response.messages → responseMessages  (a v7-ben a response.messages CSAK az utolsó kör!)
```

- [ ] **Step 2: Írd meg a Trace új szignatúráit**

A `trace.ts`-ben az Anthropic-típusok helyére az AI SDK alakja lép. A **kimenet egy karakterrel sem változik** — csak az input-típusok.

```typescript
// trace.ts — a fájl tetején
import type { ModelMessage } from 'ai';
import type { ToolOutcome } from './tools/tool-outcome.js';
// (a `import type Anthropic from '@anthropic-ai/sdk'` sor TÖRLENDŐ)

// … a Trace osztályba, a `line()` után:

  /** Eddig rögzített körök száma — a hívó ebből számozza a következőt. */
  get turnCount(): number {
    return this.turns.length;
  }
```

A három metódus új szignatúrája (a törzsük logikája marad, csak a mezőnevek jönnek máshonnan):

```typescript
  /** HÍVÁS ELŐTT — az AI SDK-nál ezt a `prepareStep` hook hívja. */
  request(
    n: number,
    req: {
      model: string;
      maxOutputTokens: number;
      system: string;
      toolNames: readonly string[];
      messages: readonly ModelMessage[];
    },
  ): void

  /** HÍVÁS UTÁN — az `onStepEnd` hívja, a lezárt kör adataival. */
  modelTurn(
    n: number,
    step: {
      finishReason: string | null;
      text: string;
      toolCalls: readonly { toolName: string; input: unknown }[];
      usage: { inputTokens?: number; outputTokens?: number };
    },
  ): Turn

  toolStep(
    turn: Turn,
    call: { toolName: string; input: unknown },
    outcome: ToolOutcome,
  ): void
```

A törzsön belüli konkrét igazítások:

- `req.max_tokens` → `req.maxOutputTokens`; a kiírt címke `max_tokens:` → `maxOutputTokens:`.
- `req.tools.map((t) => t.name).join(', ')` → `req.toolNames.join(', ')`.
- `response.content.filter(...text...)` → `step.text.trim()`.
- `response.stop_reason` → `step.finishReason`; a `'tool_use'` összehasonlítás → **`'tool-calls'`** (kötőjel!).
- `response.usage.input_tokens` → `step.usage.inputTokens ?? 0`, `output_tokens` → `step.usage.outputTokens ?? 0`.
- a tool-kérések ciklusa `response.content` `tool_use` blokkjai helyett `step.toolCalls` fölött megy, `call.toolName` névvel.
- `outcome.sql` → `outcome.summary`, `outcome.resultSummary` → `outcome.content`, `!outcome.ok` → `outcome.isError`.
- a `TOOL · …` sáv „(lefuttatjuk a DB-n)" utótagja **maradjon feltételes** (`sql ? … : ''`) — a `getClientPreferences` nem nyúl adatbázishoz, ez a saját csiszolásunk a 03-ból.

A `renderMessage` az AI SDK `ModelMessage` blokkjait lapítja (mért alakok):

```typescript
/** Egy üzenet egy vagy több lapított sorrá. Az AI SDK ModelMessage alakját lapítjuk:
 *  text / tool-call / tool-result részek (KÖTŐJELES típusnevek, nem alulvonás). */
function renderMessage(m: ModelMessage): string[] {
  if (typeof m.content === 'string') {
    return [`[${m.role}]   ${clip(m.content, 90)}`];
  }
  const lines: string[] = [];
  for (const block of m.content as readonly Record<string, unknown>[]) {
    if (block['type'] === 'text') {
      lines.push(`[${m.role}] ${clip(String(block['text'] ?? ''), 90)}`);
    } else if (block['type'] === 'tool-call') {
      const input = block['input'] as { query?: string } | null | undefined;
      const q = input?.query ?? JSON.stringify(block['input']);
      lines.push(`[${m.role}] (⚙ ${String(block['toolName'])}: ${clip(q, 80)})`);
    } else if (block['type'] === 'tool-result') {
      // Mért alak: { type: 'tool-result', toolCallId, toolName, output: { type: 'text', value } }
      const output = block['output'] as
        | { type?: string; value?: unknown }
        | string
        | undefined;
      const raw =
        typeof output === 'string'
          ? output
          : typeof output?.value === 'string'
            ? output.value
            : JSON.stringify(output?.value ?? output);
      lines.push(`[tool]   ${clip(raw, 90)}`);
    }
  }
  return lines;
}
```

- [ ] **Step 3: Írd meg az új `agent.ts`-t**

Ez a kód **fordításra ellenőrizve** `ai@7.0.66` + `@ai-sdk/anthropic@4.0.39` + TS 5.9 strict/nodenext mellett.

```typescript
import {
  generateText,
  isStepCount,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from 'ai';
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { loadConfig, type Config } from './config.js';
import { SYSTEM_PROMPT } from './prompts.js';
import { runSqlTool } from './tools/run-sql.js';
import { listCategoriesTool } from './tools/list-categories.js';
import { getClientPreferencesTool } from './tools/client-preferences.js';
import type { ToolOutcome } from './tools/tool-outcome.js';
import { Trace } from './trace.js';
import {
  logInteraction,
  type LogEntryInput,
  type ToolStep,
  type UsageInfo,
} from './logger.js';

const MAX_TOKENS = 1024;

/** A kör-limit. Régen a for-ciklus felső határa; most deklaratívan a `stopWhen`. */
export const MAX_TOOL_ITERATIONS = 6;

export type Message = ModelMessage;

export interface AskAgentDeps {
  readonly config?: Config;
  readonly log?: (entry: LogEntryInput) => Promise<void>;
  readonly print?: boolean;
  readonly persistTrace?: boolean;
  readonly history?: readonly Message[];
  /**
   * Teszt-szeam: kész `LanguageModel` (pl. `MockLanguageModelV4`) a valódi
   * Anthropic-provider helyett. A kézi loop `deps.client`-jének utódja — a
   * `deps.dbPool` viszont megszűnt, mert a tool-factory-k a produkciós utat
   * kötik be (a DB-injektálást a tool-szintű specek fedik).
   */
  readonly model?: Parameters<typeof generateText>[0]['model'];
}

export interface AskAgentResult {
  readonly answer: string;
  readonly systemPrompt: string;
  readonly messages: readonly Message[];
  readonly usage: UsageInfo;
  readonly toolSteps: readonly ToolStep[];
  readonly stopReason: string | null;
}

let provider: AnthropicProvider | null = null;
function getProvider(apiKey: string): AnthropicProvider {
  if (!provider) {
    provider = createAnthropic({ apiKey });
  }
  return provider;
}

export async function askAgent(
  question: string,
  deps: AskAgentDeps = {},
): Promise<AskAgentResult> {
  const trimmed = question.trim();
  if (trimmed === '') {
    throw new Error('Üres kérdést nem lehet feltenni.');
  }

  const config = deps.config ?? loadConfig();
  const log = deps.log ?? logInteraction;
  const systemPrompt = SYSTEM_PROMPT;

  const trace = new Trace({
    question: trimmed,
    model: config.anthropicModel,
    systemPrompt,
    print: deps.print ?? true,
    persist: deps.persistTrace ?? true,
  });

  const messages: Message[] = [
    ...(deps.history ?? []),
    { role: 'user', content: trimmed },
  ];

  // A tool-futások MELLÉK-csatornája: a modell csak a `content`-et kapja vissza, a teljes
  // outcome-ot (guardolt SQL, sorszám, hiba) itt gyűjtjük toolCallId szerint, és az
  // onStepEnd-ben párosítjuk a kör tool-hívásaihoz — a Trace ÉS a JSONL-napló ebből él.
  const outcomes = new Map<
    string,
    { name: string; input: unknown; outcome: ToolOutcome }
  >();
  const report = (
    toolCallId: string,
    name: string,
    input: unknown,
    outcome: ToolOutcome,
  ): void => {
    outcomes.set(toolCallId, { name, input, outcome });
  };

  const tools: ToolSet = {
    runSql: runSqlTool(report),
    listCategories: listCategoriesTool(report),
    getClientPreferences: getClientPreferencesTool(report),
  };
  const toolNames = Object.keys(tools);

  // A JSONL-napló tool-lépései (saját kiegészítés #6) — a HF3 költségbecslés
  // bizonyítékbázisa. Az AI SDK nem gyűjti ezt, tehát mi gyűjtjük, körről körre.
  const toolSteps: ToolStep[] = [];

  const result = await generateText({
    model: deps.model ?? getProvider(config.anthropicApiKey)(config.anthropicModel),
    maxOutputTokens: MAX_TOKENS,
    system: systemPrompt,
    messages,
    tools,
    // Régen: for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) — most deklaratívan
    // mondjuk meg, meddig mehet a loop.
    stopWhen: isStepCount(MAX_TOOL_ITERATIONS),

    // HÍVÁS ELŐTT: ezt küldjük ki — a teljes, körről körre növekvő kontextus.
    // A stepNumber 0-alapú, ezért +1 megy a Trace-nek.
    prepareStep: ({ stepNumber, messages: outgoing }) => {
      trace.request(stepNumber + 1, {
        model: config.anthropicModel,
        maxOutputTokens: MAX_TOKENS,
        system: systemPrompt,
        toolNames,
        messages: outgoing,
      });
      return {};
    },

    // HÍVÁS UTÁN: mi történt a körben — a modell szövege, tool-kérései, tool-eredményei.
    onStepEnd: (step: StepResult<ToolSet>) => {
      const turn = trace.modelTurn(trace.turnCount + 1, {
        finishReason: step.finishReason,
        text: step.text,
        toolCalls: step.toolCalls.map((call) => ({
          toolName: call.toolName,
          input: call.input,
        })),
        usage: {
          inputTokens: step.usage.inputTokens,
          outputTokens: step.usage.outputTokens,
        },
      });
      for (const toolResult of step.toolResults) {
        const record = outcomes.get(toolResult.toolCallId);
        if (!record) {
          continue;
        }
        trace.toolStep(
          turn,
          { toolName: record.name, input: record.input },
          record.outcome,
        );
        // Ugyanaz az adat a JSONL-napló ToolStep alakjában (saját kiegészítés #6).
        toolSteps.push({
          toolName: record.name,
          input: record.input,
          sql: record.outcome.summary ?? undefined,
          ok: !record.outcome.isError,
          rowCount: record.outcome.rowCount ?? undefined,
          resultSummary: record.outcome.content,
        });
      }
    },
  });

  const answer =
    result.text.trim() !== ''
      ? result.text.trim()
      : `Nem sikerült végső választ adni a megengedett lépésszámon belül (${MAX_TOOL_ITERATIONS} kör). Pontosítsd a kérdést.`;

  // ⚠️ AI SDK 7: a `result.response.messages` CSAK az utolsó kört tartalmazza.
  // A teljes beszélgetés (assistant + tool üzenetek együtt) a `responseMessages` —
  // az interaktív mód memóriája ezen áll vagy bukik.
  const updatedMessages: readonly Message[] = [
    ...messages,
    ...result.responseMessages,
  ];

  const usage: UsageInfo = {
    inputTokens: result.usage.inputTokens ?? 0,
    outputTokens: result.usage.outputTokens ?? 0,
  };

  // Két, egymást kiegészítő nyom — a Trace NEM váltja ki a JSONL-t (saját kiegészítés #6).
  await log({
    systemPrompt,
    messages: updatedMessages,
    answer,
    usage,
    toolSteps,
  });
  trace.finish(answer, usage);

  return {
    answer,
    systemPrompt,
    messages: updatedMessages,
    usage,
    toolSteps,
    stopReason: result.finishReason,
  };
}
```

> **A `logger.ts` `LogEntryInput.messages` típusa** ma `readonly ChatMessage[]`. Mivel most `ModelMessage[]` megy bele, a `logger.ts`-ben a `messages` mezőt lazítsd `readonly unknown[]`-ra (a logger csak JSON-ba szerializálja) — a `ChatMessage` típus és a `logger.spec.ts` 4 tesztje **marad**. Ez a legkisebb változtatás, ami nem érinti a napló alakját.

- [ ] **Step 4: Írd újra az `agent.spec.ts`-t `MockLanguageModelV4`-gyel**

**A darabszám-kapu tervezett kivétele.** A régi 7 teszt a `deps.client` Anthropic-mockon állt; az utódjuk a `deps.model` szeamen áll. **Mind a hét viselkedést le kell fedni**, ez a lista a kapu:

| # | Régi teszt | Az új tesztben mi állítja |
|---|---|---|
| 1 | egy körben, tool nélkül válaszol | `finishReason: 'stop'` egy `doGenerate`-tel; a `prepareStep` 1× fut |
| 2 | többkörös `tool-call → tool-result → szöveg` | két `doGenerate`; a guardolt SQL a `toolSteps[0].sql`-ben |
| 3 | `listCategories` kör | a tool neve `'listCategories'`, és a `toolSteps`-ben megjelenik |
| 4 | guard-elutasított írás hibaként megy vissza | `DELETE FROM products` → `toolSteps[0].ok === false`, `resultSummary` `/SELECT/i` |
| 5 | ismeretlen tool nem robban | az AI SDK a nem regisztrált toolnevet hibás tool-call-ként kezeli — a futás **nem dob** |
| 6 | kör-limit nem hurkol örökké | `MAX_TOOL_ITERATIONS` kör után megáll (⚠️ **már nem `throw`** — lásd Step 5) |
| 7 | az SDK hibája nem nyelődik el | a `doGenerate` `reject`-je kibukik az `askAgent`-ből |

A mock alakja (mért — lapos `usage`/string `finishReason` **nem működik**):

```typescript
import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { askAgent, MAX_TOOL_ITERATIONS } from './agent.js';

const TEST_CONFIG = {
  anthropicApiKey: 'sk-ant-test',
  anthropicModel: 'claude-sonnet-4-6',
  databaseUrlReadonly: 'postgresql://ro:ro@localhost:5433/szoba-kertesz-test',
};

/** Provider-szintű usage-alak (v4). Lapos { inputTokens: 15 } alakkal a
 *  token-számok NÉMÁN undefined-ek lennének. */
const usage = (i: number, o: number) => ({
  inputTokens: { total: i, noCache: i, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: o, text: o, reasoning: 0 },
  totalTokens: i + o,
});

const textStep = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  // Provider-szinten OBJEKTUM, nem string — az ai szintjén lesz belőle 'stop'.
  finishReason: { unified: 'stop' as const },
  usage: usage(10, 20),
  warnings: [],
});

const toolStep = (toolCallId: string, toolName: string, input: unknown) => ({
  content: [
    {
      type: 'tool-call' as const,
      toolCallId,
      toolName,
      input: JSON.stringify(input),
    },
  ],
  finishReason: { unified: 'tool-calls' as const },
  usage: usage(15, 25),
  warnings: [],
});

/** Egymás utáni köröket kiszolgáló mock modell. */
function mockModel(...steps: readonly unknown[]) {
  let i = 0;
  const doGenerate = vi.fn(async () => steps[Math.min(i++, steps.length - 1)]);
  return { model: new MockLanguageModelV4({ doGenerate }), doGenerate };
}

describe('askAgent — AI SDK 7 loop', () => {
  it('egy körben válaszol, ha a modell nem kér toolt', async () => {
    const { model, doGenerate } = mockModel(
      textStep('Egy szobanövény fényigénye az eredeti élőhelyétől függ.'),
    );
    const log = vi.fn().mockResolvedValue(undefined);

    const result = await askAgent('Mitől függ egy növény fényigénye?', {
      model,
      config: TEST_CONFIG,
      print: false,
      persistTrace: false,
      log,
    });

    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(result.answer).toContain('élőhelyétől');
    expect(result.systemPrompt).toMatch(/<role>/);
    expect(result.toolSteps).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(result.stopReason).toBe('stop');
    // Saját kiegészítés #6: a JSONL-logger a loop végén MINDIG lefut.
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('a guard elutasít egy írási kísérletet, és a modell javítani tud belőle', async () => {
    const { model } = mockModel(
      toolStep('call_evil', 'runSql', { query: 'DELETE FROM products' }),
      textStep('Sajnálom, nem törölhetek adatot — csak lekérdezésre van jogosultságom.'),
    );

    const result = await askAgent('töröld az összes növényt', {
      model,
      config: TEST_CONFIG,
      print: false,
      persistTrace: false,
      log: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.toolSteps).toHaveLength(1);
    expect(result.toolSteps[0].ok).toBe(false);
    expect(result.toolSteps[0].resultSummary).toMatch(/SELECT/i);
    expect(result.answer).toMatch(/Sajnálom/);
  });

  it('a beszélgetés-előzmény tartalmazza a TELJES tool-váltást', async () => {
    const { model } = mockModel(
      toolStep('call_1', 'listCategories', {}),
      textStep('A katalógusban 8 kategória van.'),
    );

    const result = await askAgent('Milyen kategóriák vannak?', {
      model,
      config: TEST_CONFIG,
      print: false,
      persistTrace: false,
      log: vi.fn().mockResolvedValue(undefined),
    });

    // ⚠️ Ez a teszt fogja el, ha valaki visszaírja `result.response.messages`-re:
    // akkor a 'tool' szerepű üzenet eltűnik, és az interaktív memória megromlik.
    expect(result.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
  });

  it('a kör-limitet nem lépi túl', async () => {
    // Minden kör toolt kér → a stopWhen áll meg, nem a modell.
    const { model, doGenerate } = mockModel(
      toolStep('call_loop', 'runSql', { query: 'SELECT 1' }),
    );

    const result = await askAgent('kérdés', {
      model,
      config: TEST_CONFIG,
      print: false,
      persistTrace: false,
      log: vi.fn().mockResolvedValue(undefined),
    });

    expect(doGenerate).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS);
    // VISELKEDÉSVÁLTOZÁS a kézi loophoz képest: nem dob, hanem magyarázó szöveget ad.
    expect(result.answer).toMatch(/megengedett lépésszámon belül/);
  });

  it('az SDK hibáját nem nyeli el', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('API hiba');
      },
    });

    await expect(
      askAgent('kérdés', {
        model,
        config: TEST_CONFIG,
        print: false,
        persistTrace: false,
        log: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow('API hiba');
  });
});
```

> **A 3. és 5. sor a táblázatból** (`listCategories` kör, ismeretlen tool) — a `listCategories`-t a fenti harmadik teszt hajtja meg; az ismeretlen toolra írj egy hatodik esetet `toolStep('call_x', 'deleteEverything', {})` + `textStep(...)` párossal, és állítsd, hogy a hívás **nem dob** (`await expect(...).resolves.toBeDefined()`). Ha az AI SDK 7 a nem regisztrált toolnévre kivételt dob, az **T5 → STOP**: jelezd a tényleges hibaüzenettel, mielőtt a tesztet a viselkedéshez igazítanád.
>
> A `runSql`-t meghajtó tesztek **valódi read-only DB-t hívnak** (a tool-factory a produkciós utat köti be) — ezért kell futó, seedelt adatbázis. Ez összhangban van a `db-readonly.spec.ts` meglévő gyakorlatával.

- [ ] **Step 4b: Írd át a manifeszt beszélgetés-memória tesztjét**

**A Task 1-ben felfedezett T3.** A core manifeszt „beszélgetés-memória (03. alkalom, c00055a)" blokkja `deps.client`-tel injektál Anthropic-mockot, és a kiküldött `messages` tömbön állít — ez a Step 3 után nem fordul le. **Ne töröld**, írd át a mock-modell szeamre; az állítás lényege ugyanaz marad: a `history` a kérdés ELÉ fűződik.

```typescript
describe('beszélgetés-memória (03. alkalom, c00055a)', () => {
  it('a history a kérdés ELÉ fűződik, így a modell látja az előzményt', async () => {
    const seen: unknown[] = [];
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        seen.push(options.prompt);
        return {
          content: [{ type: 'text' as const, text: 'ok' }],
          finishReason: { unified: 'stop' as const },
          usage: {
            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
            totalTokens: 2,
          },
          warnings: [],
        };
      },
    });

    const result = await askAgent('És olcsóbbat?', {
      model,
      config: {
        anthropicApiKey: 'sk-ant-test',
        anthropicModel: 'teszt',
        databaseUrlReadonly: 'postgresql://ro:ro@localhost:5433/teszt',
      },
      log: async () => undefined,
      print: false,
      persistTrace: false,
      history: [
        { role: 'user', content: 'Ajánlj egy pozsgást.' },
        { role: 'assistant', content: 'Íme az Echeveria.' },
      ],
    });

    // A modellhez kiküldött prompt SORRENDJE a lényeg: előzmény, majd az új kérdés.
    expect(result.messages[0]?.content).toBe('Ajánlj egy pozsgást.');
    expect(result.messages[2]?.content).toBe('És olcsóbbat?');
    expect(seen).toHaveLength(1);
  });
});
```

> A `doGenerate` `options.prompt`-jának pontos alakját **futtatva ellenőrizd** — ha az `expect(seen)` állítás nem a várt alakot kapja, a *tesztet* igazítsd a mért kimenethez, és a `result.messages`-en álló két sort tartsd meg változatlanul (az a lényegi regressziós állítás).

- [ ] **Step 5: Vezesd át a `trace.spec.ts`-t és a hívókat**

- `trace.spec.ts`: az Anthropic-alakú fixture-öket írd át az új `request`/`modelTurn`/`toolStep` szignatúrákra. **A tesztek száma nem csökkenhet.**
- `apps/cli/src/interactive.ts` és `lib/print-prompt.ts`: a `ChatMessage[]` helyett `Message[]` (`ModelMessage`). A `--show-prompt` kimenete (`--- system prompt ---`, `--- üzenetek ---`) **változatlan** — a CLI manifeszt ezt állítja.
- `apps/cli/src/main.ts`: a `deps.dbPool` sosem volt itt, a `print` marad. Nincs más dolgod.

- [ ] **Step 6: Vezesd ki a `@anthropic-ai/sdk`-t**

```bash
grep -rn "@anthropic-ai/sdk" packages/core/src apps/cli/src
```

Expected: **nincs találat**. Ha van, előbb azt vezesd át. Utána:

```bash
pnpm --filter @szoba-kertesz/core remove @anthropic-ai/sdk
pnpm remove @anthropic-ai/sdk
```

- [ ] **Step 7: Ellenőrzés**

```bash
pnpm nx reset
pnpm nx run core:typecheck && pnpm nx run cli:typecheck && pnpm nx test core && pnpm nx test cli
```

Expected: zöld; a manifeszt mind a 11 + 3 tesztje zöld; a `logger.spec.ts` 4 tesztje **fut**; az `agent.spec.ts` utódja **≥ 6 teszt**. A darabszám a Task 1 utáni 93-hoz képest legfeljebb az `agent.spec.ts` átírásával magyarázható mértékben térhet el — **írd le a pontos új számot**, ez lesz az alap a Task 5-ig.

- [ ] **Step 8: A CJS/ESM határ ellenőrzése (az `ai@7` ESM-only)**

```bash
pnpm nx run cli:build && node apps/cli/dist/main.js --help
```

Expected: a commander súgója megjelenik, **`ERR_REQUIRE_ESM` nélkül**. Ha ilyen hibát kapsz, az `apps/cli/package.json` build-targetjében a `format` `["cjs"]` → `["esm"]` váltása a javítás — de **előbb állj meg és jelezd** (T5), mert ez a `szobakertesz` scriptet is érinti.

---

#### Task 3 — végrehajtási leletek (2026-08-16)

**Eredmény:** core **93 → 96** (az `agent.spec.ts` 7 tesztje 10-re nőtt), cli 9 változatlan; typecheck **és lint** zöld mindkét projekten; a CJS-build `--help`-je hiba nélkül fut.

Öt eltérés a tervtől, mind a végrehajtás közben derült ki:

1. **A `@anthropic-ai/sdk` kivezetéséhez halott kódot kellett törölni.** A Step 6 csak egy `grep`-et írt elő, de négy forrásfájl még hivatkozott a típusra. A `tools/index.ts` `tools: Anthropic.Tool[]` tömbjét **semmi nem használta** az agent átállása után (ellenőrizve `grep`-pel) — törölve. A három `*ToolDefinition` konstansról lekerült az `Anthropic.Tool` annotáció; a típus most következtetett. Az `executeTool` dispatch marad, mert a manifeszt hajtja meg.

2. **Ettől elromlott egy meglévő teszt** (`list-categories.spec.ts`): az `input_schema.required` mezőre állított, ami a következtetett típuson nem létezik (TS2339). Az állítás **erősebbre** cserélve: `.not.toHaveProperty('required')` + a `properties` ürességére. A szándék („nincs kötelező bemenete") változatlan.

3. **A `Trace.toolStep` nem tudja SQL-ként kezelni a `summary`-t.** A közös `ToolOutcome.summary` generikus (a `getClientPreferences`-nél `"ACME · keret 1000 Ft · ALACSONY"`), a régi `sql` mező viszont SQL-specifikus volt. Ha a Trace vakon SQL-ként írná ki, hazudna. **Javítás:** a `toolStep` a bemenet `query` mezőjéből dönti el, SQL-es tool futott-e, és eszerint választ címkét (`SQL (guard után):` vs `összegzés:`), illetve tölti a JSON-nyom `guardedSql` mezőjét (nem-SQL toolnál `null`). A 03. alkalom „(lefuttatjuk a DB-n)" feltételes utótagja így is megmarad.

4. **A Step 4b `sentPromptLength` állítása hibás volt.** A mért valóság: az AI SDK 7 a **system promptot is az üzenet-tömbbe teszi**, tehát a `doGenerate` `options.prompt`-ja `['system', 'user', 'assistant', 'user']` — négy elem, nem három. A teszt mostantól a **szerepek sorrendjére** állít (informatívabb, mint egy hossz), a lényegi regressziós állítás (`result.messages[0]` / `[2]`) változatlan.

5. **Két CLI teszt-helper elromlott** (`interactive.spec.ts`, `own-additions.spec.ts`): az `AskAgentResult`-ba bekerült a kötelező `stopReason`, ezért a `makeResult()` helperek `stopReason: 'stop'`-pal egészültek ki. A CLI manifeszt állításai változatlanok.

**Amit ez a task feloldott:** a Task 0 óta fennálló lint-hiba (`@ai-sdk/anthropic` is not used) megszűnt — a `createAnthropic` importja használatba vette, a `@anthropic-ai/sdk` pedig kikerült a `packages/core/package.json`-ból és a root `package.json`-ból is. **A branch mostantól lint-zöld.**

---

### Task 4: CI — build-kapu és Claude code review (doksi Lépés 2)

**Files:**
- Create: `.github/workflows/ci.yml`, `.github/workflows/claude-review.yml`

> A doksi két commitot sorol (`ca16c56` bevezet, `6b7388c` javít pnpm-re). A javítás **eleve be van építve** az alábbi fájlba — nem reprodukáljuk a hibás állapotot.

- [ ] **Step 1: Írd meg a `ci.yml`-t**

```yaml
# CI — pnpm + Nx: lint, teszt, build, typecheck minden pushra/PR-ra.
# (Az Nx Cloud elosztott futtatás szándékosan nincs bekapcsolva — a kurzushoz felesleges.)
name: CI

on:
  push:
    branches:
      - master
  pull_request:

permissions:
  actions: read
  contents: read

jobs:
  main:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          filter: tree:0
          fetch-depth: 0

      - uses: pnpm/action-setup@v4
        with:
          version: 11.12.0

      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm nx run-many -t lint typecheck build
```

**Két szándékos eltérés a kurzustól:**

1. **`master`, nem `main`** — ebben a repóban ez az alapértelmezett ág.
2. **A `test` NINCS a listán.** Indok: a `core` több specje (`db-readonly.spec.ts`, `list-categories.spec.ts`, a Task 3 loop-tesztjei) **valódi, futó, seedelt Postgresre** támaszkodik, ami a runneren nincs. Teszt CI-ban csak akkor futtatható, ha előbb bejön egy `services: postgres` blokk + migráció + seed — az a 06. alkalom scope-ja. **Zölden hazudó CI rosszabb, mint a hiányzó teszt-lépés**; ezt a `ci.yml` fejlécében kommentben is rögzítsd.

- [ ] **Step 2: Írd meg a `claude-review.yml`-t**

```yaml
# Claude code review PR-okra — a HIVATALOS claude-code-action, "gyári" konfigurációval.
# Nincs saját skill, nincs saját agent: csak egy prompt. (L1 a felhőben — 4. óra.)
name: Claude Review

on:
  pull_request:

permissions:
  contents: read
  pull-requests: write
  issues: write
  id-token: write

jobs:
  claude-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Review-old ezt a pull requestet magyarul. Fókusz: hibák, hiányzó
            tesztek, a repo konvencióinak (docs/konvenciók.md) megsértése,
            és a CLAUDE.md invariánsai: két DB-kapcsolat két jogosultsági
            szinttel, framework-agnosztikus core, read-only query-tool-lánc.
            Rövid, tételes összefoglalót írj PR-kommentbe: probléma → fájl:sor → javaslat.
```

- [ ] **Step 3: A repo-secret beállítása — ezt NEKED kell megtenned**

```bash
gh secret set ANTHROPIC_API_KEY --repo pcsontos/szoba-kertesz
```

A parancs interaktívan kéri a kulcsot. **Ez a lépés nem automatizálható az ügynök részéről** — ha a secret hiányzik, a `claude-review` job minden PR-en elhasal. Ellenőrzés:

```bash
gh secret list --repo pcsontos/szoba-kertesz
```

Expected: a listában szerepel az `ANTHROPIC_API_KEY`.

- [ ] **Step 4: Ellenőrzés — élő PR (⚠️ felhasználói jóváhagyáshoz kötött)**

A workflow **csak PR-en tud lefutni**, tehát ez az egyetlen task, ami push-t igényel. **Ne csináld meg magadtól — kérdezz rá.** Jóváhagyás után:

```bash
git add .github/workflows && git commit -m "ci: add pnpm/Nx build gate and Claude PR review workflow"
git push -u origin feat/ora-04-multiagent
gh pr create --fill --base master
gh run watch
```

Expected: a `CI / main` job zöld; a `Claude Review` job kommentet ír a PR-re. Ha a review job elhasal → nézd meg a logot; leggyakoribb ok a hiányzó secret (Step 3).

> Ha nem kérsz PR-t, a workflow-fájlok akkor is a helyükön maradnak, és a következő PR-nél élesednek — a task ettől nem sikertelen, csak az élő ellenőrzés marad el. Ezt írd le explicit módon.

---

### Task 5: `agents/` + `tools/` átszervezés, egy fogalom = egy könyvtár (doksi Lépés 4 + 5)

A lecke szerkezeti magja, a doksi két lépése egyben — a végállapot számít, nem a két külön commit. **Tisztán mozgatás és bekötés: viselkedés nem változik.**

**Files:** lásd a File Structure „Áthelyeződik" blokkját; továbbá
- Create: `packages/core/src/lib/agents/query-agent/query-agent.ts`
- Delete: `packages/core/src/lib/tools/index.ts`
- Modify: `packages/core/src/index.ts`, `apps/cli/src/{main,interactive}.ts`

**Interfaces:**
- Produces: `runAgentLoop(question, agent: AgentDefinition, options): Promise<AskResult>`, `AgentDefinition` (`systemPrompt` / `buildTools` / `maxSteps` / `maxOutputTokens` / `emptyAnswer`), `askAgent(question, options)` a `query-agent.ts`-ből.

- [ ] **Step 1: Mozgasd a fájlokat git-tel**

```bash
mkdir -p packages/core/src/lib/agents/query-agent
mkdir -p packages/core/src/lib/tools/{run-sql,list-categories,get-client-preferences}

git mv packages/core/src/lib/agent.ts            packages/core/src/lib/agents/agent-loop.ts
git mv packages/core/src/lib/agent.spec.ts       packages/core/src/lib/agents/agent-loop.spec.ts
git mv packages/core/src/lib/prompts.ts          packages/core/src/lib/agents/query-agent/query-prompt.ts
git mv packages/core/src/lib/prompts.spec.ts     packages/core/src/lib/agents/query-agent/query-prompt.spec.ts

git mv packages/core/src/lib/tools/run-sql.ts         packages/core/src/lib/tools/run-sql/run-sql-tool.ts
git mv packages/core/src/lib/tools/run-sql.spec.ts    packages/core/src/lib/tools/run-sql/run-sql-tool.spec.ts
git mv packages/core/src/lib/tools/sql-guard.ts       packages/core/src/lib/tools/run-sql/sql-guard.ts
git mv packages/core/src/lib/tools/sql-guard.spec.ts  packages/core/src/lib/tools/run-sql/sql-guard.spec.ts
git mv packages/core/src/lib/tools/db-readonly.ts     packages/core/src/lib/tools/run-sql/db-readonly.ts
git mv packages/core/src/lib/tools/db-readonly.spec.ts packages/core/src/lib/tools/run-sql/db-readonly.spec.ts

git mv packages/core/src/lib/tools/list-categories.ts      packages/core/src/lib/tools/list-categories/list-categories-tool.ts
git mv packages/core/src/lib/tools/list-categories.spec.ts packages/core/src/lib/tools/list-categories/list-categories-tool.spec.ts

git mv packages/core/src/lib/tools/client-preferences.ts      packages/core/src/lib/tools/get-client-preferences/get-client-preferences-tool.ts
git mv packages/core/src/lib/tools/client-preferences.spec.ts packages/core/src/lib/tools/get-client-preferences/get-client-preferences-tool.spec.ts

git rm packages/core/src/lib/tools/index.ts
```

> **T2 a kurzushoz képest:** nálunk a `listCategories` is önálló könyvtárat kap (a kurzusnál nincs ilyen tool). A `db-readonly.ts` a `run-sql/` alá kerül, mert **csak** a `runSql` használja — a `list-categories-tool.ts` importja is oda mutat majd (`../run-sql/db-readonly.js`).

- [ ] **Step 2: Igazítsd a relatív importokat**

Az egy szinttel mélyebbre került fájlokban `../` → `../../`:

```bash
grep -rn "from '\.\./config.js'\|from '\.\./\.\./config.js'" packages/core/src/lib/tools packages/core/src/lib/agents
```

Konkrétan: `run-sql/db-readonly.ts` → `../../config.js`; `run-sql/run-sql-tool.ts` → `./sql-guard.js`, `./db-readonly.js`, `../tool-outcome.js`; `list-categories/list-categories-tool.ts` → `../run-sql/db-readonly.js`, `../tool-outcome.js`; `get-client-preferences/get-client-preferences-tool.ts` → `../tool-outcome.js`; `agents/agent-loop.ts` → `../config.js`, `../trace.js`, `../logger.js`, `../tools/…`.

- [ ] **Step 3: Alakítsd az `agent-loop.ts`-t agent-agnosztikussá**

A Task 3-ban megírt `askAgent` törzse **majdnem** a közös loop. A különbség: a system prompt, a toolkészlet, a kör-limit és a token-keret **kívülről jön**.

```typescript
// agents/agent-loop.ts — AZ agent-loop, egy helyen. Mindkét agent (query, ingest) EZT
// futtatja, csak mást ad be: saját system promptot + saját toolkészletet.
// Egy agent = prompt + toolok + loop.

/** Amivel egy AGENT paraméterezi a közös loopot: a személyisége és a képességei. */
export interface AgentDefinition {
  /** Az agent szerepe és szabályai (a system prompt). */
  readonly systemPrompt: string;
  /** Az agent toolkészlete. A `report`-ot minden tool megkapja — ezen jelent a Trace-nek. */
  readonly buildTools: (report: ToolReporter) => ToolSet;
  /** Max hány kört mehet a loop (tool-hívásokkal együtt). */
  readonly maxSteps: number;
  /** A modell válaszának token-kerete. Nagy tool-argumentumhoz (upsert) nagyobb kell. */
  readonly maxOutputTokens: number;
  /** Ha a loop a limit miatt válasz nélkül áll meg, ezt mondjuk a felhasználónak. */
  readonly emptyAnswer: string;
}

export async function runAgentLoop(
  question: string,
  agent: AgentDefinition,
  options: AskOptions = {},
): Promise<AskResult> {
  // … a Task 3 askAgent-törzse, ezekkel a cserékkel:
  //   SYSTEM_PROMPT           → agent.systemPrompt
  //   MAX_TOKENS              → agent.maxOutputTokens
  //   isStepCount(MAX_TOOL_ITERATIONS) → isStepCount(agent.maxSteps)
  //   a fix `tools` objektum   → agent.buildTools(report)
  //   a fix hibaszöveg         → agent.emptyAnswer
}
```

Az `AskOptions` / `AskResult` a Task 3 `AskAgentDeps` / `AskAgentResult`-jából lesz átnevezve; a `systemPrompt`, `toolSteps` és `usage` mezők **maradnak** (saját kiegészítés #6 és #7).

- [ ] **Step 4: Írd meg a `query-agent.ts`-t**

```typescript
import type { ToolSet } from 'ai';
import { buildQueryPrompt } from './query-prompt.js';
import { runAgentLoop, type AskOptions, type AskResult } from '../agent-loop.js';
import { runSqlTool } from '../../tools/run-sql/run-sql-tool.js';
import { listCategoriesTool } from '../../tools/list-categories/list-categories-tool.js';
import { getClientPreferencesTool } from '../../tools/get-client-preferences/get-client-preferences-tool.js';

// query-agent.ts — a KÉRDÉS-VÁLASZ agent (a termék "ask" oldala). READ-ONLY: természetes
// nyelvű kérdésből SQL-t ír, lefuttatja, magyarul válaszol. Egy agent = prompt + toolok + loop:
//   prompt:  query-prompt.ts (szerep, séma, SQL-szabályok)
//   toolok:  runSql (read-only SELECT) + listCategories + getClientPreferences
//   loop:    a közös agent-loop (agent-loop.ts)

export async function askAgent(
  question: string,
  options: AskOptions = {},
): Promise<AskResult> {
  const trimmed = question.trim();
  if (trimmed === '') {
    throw new Error('Üres kérdést nem lehet feltenni.');
  }

  return runAgentLoop(
    trimmed,
    {
      systemPrompt: buildQueryPrompt(),
      buildTools: (report): ToolSet => ({
        runSql: runSqlTool(report),
        listCategories: listCategoriesTool(report),
        getClientPreferences: getClientPreferencesTool(report),
      }),
      maxSteps: 6,
      maxOutputTokens: 1024,
      emptyAnswer:
        'Nem sikerült végső választ adni a megengedett lépésszámon belül. Pontosítsd a kérdést.',
    },
    options,
  );
}
```

> **Ez a minta ismétlődik a kurzus végéig.** Minden későbbi agent pontosan így épül fel: prompt + `buildTools` + `maxSteps` + `runAgentLoop`. A `listCategories` **csak itt** szerepel — az ingest-agent toolkészletébe nem kerül be.
>
> A `query-prompt.ts` `buildSystemPrompt()` függvényét nevezd át `buildQueryPrompt()`-ra, és tartsd meg `buildSystemPrompt` néven is deprecated aliasként, amíg a `query-prompt.spec.ts` 10 tesztje át nem áll — a `SYSTEM_PROMPT` konstans **bájtazonos marad** a `docs/system-prompt.md`-vel.

- [ ] **Step 5: Vezesd át a CLI típusneveit**

Az `apps/cli/src/interactive.ts` ma `AskAgentResult`-ot és `ChatMessage`-et importál a core-ból; a Step 3 átnevezése után ezek `AskResult` és `Message`. A `RunInteractiveOptions.ask` mezőjének típusa is ezzel változik:

```typescript
import {
  askAgent,
  closeReadonlyPool,
  type AskResult,
  type Message,
} from '@szoba-kertesz/core';

// …
  readonly ask?: (question: string) => Promise<AskResult>;
```

Ugyanez a `apps/cli/src/lib/print-prompt.ts`-ben (`messages: readonly Message[]`).

```bash
grep -rn "AskAgentResult\|ChatMessage" apps/cli/src packages/core/src
```

Expected: nincs találat — vagy ha a `ChatMessage` a `logger.ts`-ben megmaradt saját típusként, csak ott. Az `apps/cli/src/own-additions.spec.ts` `askResult()` helper-je is ezt az alakot építi: ha a `systemPrompt` mező kiesne belőle, a 7. saját kiegészítés manifesztje bukik — **ez a helyes viselkedés**, ne a tesztet igazítsd.

- [ ] **Step 6: Írd újra a `packages/core/src/index.ts`-t**

```typescript
// A @szoba-kertesz/core publikus felülete. A szerkezet a tananyag térképe:
//   agents/ — KI mit csinál: minden agent saját könyvtárban (agent + promptja);
//             a KÖZÖS agent-loop eggyel kintebb (agents/agent-loop.ts)
//   tools/  — MIVEL: minden tool saját könyvtárban, MINDEN hozzávalójával
//             (séma, guard, DB-kapcsolat); a KÖZÖS ToolOutcome eggyel kintebb
//   trace / logger — MEGFIGYELHETŐSÉG: az élő színes nyom + a JSONL költség-napló
//   config  — a környezet validálása (fail-fast)

export * from './lib/agents/agent-loop.js';
export * from './lib/agents/query-agent/query-agent.js';
export * from './lib/agents/query-agent/query-prompt.js';

export * from './lib/tools/tool-outcome.js';
export * from './lib/tools/run-sql/run-sql-tool.js';
export * from './lib/tools/run-sql/sql-guard.js';
export * from './lib/tools/run-sql/db-readonly.js';
export * from './lib/tools/list-categories/list-categories-tool.js';
export * from './lib/tools/get-client-preferences/get-client-preferences-tool.js';

export * from './lib/trace.js';
export * from './lib/logger.js';
export * from './lib/config.js';
export * from './lib/core.js';
export * from './lib/echo.js';
```

⚠️ A `./lib/tools/index.js` sor **kikerül** (a fájl törölve). A manifeszt a publikus felületen dolgozik — ha egy export kimarad, **hangosan** törik, nem némán.

- [ ] **Step 7: Ellenőrzés**

```bash
pnpm nx reset
pnpm nx run core:typecheck && pnpm nx run cli:typecheck && pnpm nx test core && pnpm nx test cli
grep -rn "tools/index" packages/core/src apps/cli/src
```

Expected: typecheck és teszt zöld; a `grep` **üres**; a darabszám a Task 3-ban rögzítetthez képest **nem csökkent** (tisztán mozgatás). Csökkenés → STOP.

---

### Task 6: A `szoba-kertesz_rw` szerepkör — a jogosultsági szint, mielőtt bármi ír

**Ez a task a felhasználói döntés magja:** az író agent NEM a Prisma admin-kapcsolatán ír (ahogy a kurzus teszi), hanem saját, szűkített szerepkörön. A `CLAUDE.md` „két kapcsolat, két jogosultsági szint" invariánsa így **háromra bővül anélkül, hogy felhígulna**.

**Files:**
- Modify: `init.sql`, `.env` (+ `.env.bak` biztonsági másolat), `packages/core/src/lib/config.ts`
- Create: `packages/db/prisma/migrations/<timestamp>_db_roles/migration.sql`
- Create: `packages/core/src/lib/tools/upsert-product/db-readwrite.ts`, `db-readwrite.spec.ts`

**Interfaces:**
- Produces: `queryReadWrite(sql, params, deps?)`, `closeReadWritePool()`, `DbReadWriteDeps`.

- [ ] **Step 1: Emeld a szerepkör-grantokat migrációba**

Az `init.sql` **csak a konténer első indulásakor** fut — egy `prisma migrate reset` után a szerep megmarad, a jogosultságai nem. Ezért a grantok migrációba kerülnek (a spec ezt a 06-os planhez sorolta, de az író szerepkör miatt **most kell**).

```bash
mkdir -p "packages/db/prisma/migrations/$(date -u +%Y%m%d%H%M%S)_db_roles"
```

A `migration.sql` tartalma:

```sql
-- Két agent-szerepkör, idempotensen. Ez a fájl a jogosultságok EGYETLEN forrása:
-- az init.sql csak a konténer ELSŐ indulásakor fut, egy `prisma migrate reset` után
-- a szerepek megmaradnának, a grantjaik viszont nem — és a runSql némán elszállna.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'szoba-kertesz_ro') THEN
    CREATE ROLE "szoba-kertesz_ro" LOGIN PASSWORD 'szoba-kertesz_ro';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'szoba-kertesz_rw') THEN
    CREATE ROLE "szoba-kertesz_rw" LOGIN PASSWORD 'szoba-kertesz_rw';
  END IF;
END
$$;

-- Read-only szerep: a query-agent útja. SELECT és semmi más.
GRANT CONNECT ON DATABASE "szoba-kertesz" TO "szoba-kertesz_ro";
GRANT USAGE ON SCHEMA public TO "szoba-kertesz_ro";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "szoba-kertesz_ro";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO "szoba-kertesz_ro";

-- Read-write szerep: az ingest-agent útja. SELECT + INSERT + UPDATE a products-on.
-- DELETE és DDL SZÁNDÉKOSAN NINCS: az upsert nem törölhet, és sémát nem módosíthat.
GRANT CONNECT ON DATABASE "szoba-kertesz" TO "szoba-kertesz_rw";
GRANT USAGE ON SCHEMA public TO "szoba-kertesz_rw";
GRANT SELECT, INSERT, UPDATE ON TABLE products TO "szoba-kertesz_rw";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "szoba-kertesz_rw";
```

> A `SEQUENCES` grant az `id` `autoincrement()` miatt kell — nélküle az INSERT „permission denied for sequence products_id_seq" hibával áll meg.

Vidd át ugyanezt az `init.sql`-be is (friss konténer esetére) — a két fájl tartalma legyen azonos.

- [ ] **Step 2: Alkalmazd, és ELLENŐRIZD a jogosultságokat élőben**

```bash
cp .env .env.bak
pnpm exec prisma migrate deploy
```

Vedd fel a `.env`-be:

```
DATABASE_URL_READWRITE="postgresql://szoba-kertesz_rw:szoba-kertesz_rw@localhost:5433/szoba-kertesz"
```

Ellenőrzés — **ez a task lényege, tényleges kimenettel idézd be**:

```bash
docker compose exec -T postgres psql "postgresql://szoba-kertesz_rw:szoba-kertesz_rw@localhost:5432/szoba-kertesz" \
  -c "UPDATE products SET stock = stock WHERE id = (SELECT min(id) FROM products);" \
  -c "DELETE FROM products WHERE id = -1;"
```

Expected: az `UPDATE` **sikerül** (`UPDATE 1`), a `DELETE` **„permission denied for table products"** hibával elhasal. Ha a DELETE sikerül → STOP, a grant túl bő.

```bash
docker compose exec -T postgres psql "postgresql://szoba-kertesz_ro:szoba-kertesz_ro@localhost:5432/szoba-kertesz" \
  -c "UPDATE products SET stock = 0 WHERE id = (SELECT min(id) FROM products);"
```

Expected: **„permission denied"** — a read-only szerep változatlanul nem ír.

> A szolgáltatásnév **`postgres`** (ellenőrizve `docker compose ps`-szel 2026-08-16-án; a konténer neve `szoba-kertesz-adatbazis`). Ha a `docker compose exec` nem elérhető, `psql` közvetlenül a `localhost:5433`-on ugyanezt adja.

- [ ] **Step 3: Vedd fel a config-ba**

`packages/core/src/lib/config.ts` — az `EnvSchema`-ba **opcionális** mezőként (a query-agentnek nem kell, és a `loadConfig()` nem bukhat el attól, hogy valaki csak kérdezni akar):

```typescript
const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
  DATABASE_URL_READONLY: z.string().min(1),
  // Csak az ingest-agent írási útjához kell — a query-agent enélkül is fut.
  // A hiányát a db-readwrite.ts jelzi, fail-fast, érthető magyar üzenettel.
  DATABASE_URL_READWRITE: z.string().min(1).optional(),
});
```

A `Config` interfészbe: `readonly databaseUrlReadWrite?: string;`

⚠️ A `DATABASE_URL`-t (admin/Prisma) ez a függvény **továbbra sem olvassa ki** — ez a `CLAUDE.md` invariáns lényege, és most is érvényes.

- [ ] **Step 4: Írd meg a `db-readwrite.ts`-t**

```typescript
import { Pool, type QueryResult, type QueryResultRow } from 'pg';
import { loadConfig, type Config } from '../../config.js';

/**
 * READ-WRITE adatkapcsolat az INGEST-agent upsertProduct-jához. KÜLÖN a query-agent
 * read-only kapcsolatától (`../run-sql/db-readonly.ts`), és KÜLÖN a Prisma admin
 * kapcsolatától: a `szoba-kertesz_rw` szerep SELECT/INSERT/UPDATE-et tud a products
 * táblán — DELETE-et és DDL-t NEM. Ez a harmadik jogosultsági szint; a három
 * útvonal fizikailag nem keveredik, és a query-agent nem is látja ezt a fájlt.
 */
export interface DbReadWriteDeps {
  readonly pool?: Pool;
  readonly config?: Config;
}

const STATEMENT_TIMEOUT_MS = 5000;

let sharedPool: Pool | undefined;

function resolvePool(deps: DbReadWriteDeps): Pool {
  if (deps.pool) {
    return deps.pool;
  }
  if (!sharedPool) {
    const config = deps.config ?? loadConfig();
    if (!config.databaseUrlReadWrite) {
      throw new Error(
        'Hiányzó DATABASE_URL_READWRITE. Az ingest-agent íráshoz ezt igényli — ' +
          'vedd fel a .env-be (a szoba-kertesz_rw szerep kapcsolati stringje).',
      );
    }
    sharedPool = new Pool({
      connectionString: config.databaseUrlReadWrite,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      application_name: 'szoba-kertesz-agent-ingest',
      max: 4,
    });
  }
  return sharedPool;
}

/** Paraméterezett lekérdezés a read-write kapcsolaton. String-konkatenáció SOHA. */
export async function queryReadWrite<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: readonly unknown[] = [],
  deps: DbReadWriteDeps = {},
): Promise<QueryResult<T>> {
  return resolvePool(deps).query<T>(sql, [...params]);
}

/** Lezárja a megosztott pool-t (a CLI a futás végén hívja). */
export async function closeReadWritePool(): Promise<void> {
  if (!sharedPool) {
    return;
  }
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
}
```

- [ ] **Step 5: Írd meg a `db-readwrite.spec.ts`-t — a kettős védelem bizonyítéka**

Ez a `db-readonly.spec.ts` „double protection" tesztjének párja, valódi DB ellen:

```typescript
import { afterAll, describe, expect, it } from 'vitest';
import { closeReadWritePool, queryReadWrite } from './db-readwrite.js';

describe('db-readwrite — a szoba-kertesz_rw szerep jogosultsági határai', () => {
  afterAll(async () => {
    await closeReadWritePool();
  });

  it('olvasni tud a products táblából', async () => {
    const result = await queryReadWrite<{ count: string }>(
      'SELECT count(*)::text AS count FROM products',
    );
    expect(Number(result.rows[0].count)).toBeGreaterThan(0);
  });

  it('frissíteni tud (ugyanarra az értékre — nem változtat adatot)', async () => {
    const result = await queryReadWrite(
      'UPDATE products SET stock = stock WHERE id = (SELECT min(id) FROM products)',
    );
    expect(result.rowCount).toBe(1);
  });

  it('törölni NEM tud — a második védelmi vonal a DB-ben van, nem a promptban', async () => {
    await expect(
      queryReadWrite('DELETE FROM products WHERE id = $1', [-1]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('sémát módosítani NEM tud', async () => {
    await expect(
      queryReadWrite('ALTER TABLE products ADD COLUMN hacked boolean'),
    ).rejects.toThrow(/permission denied|must be owner/i);
  });
});
```

- [ ] **Step 6: Ellenőrzés**

```bash
pnpm nx run core:typecheck && pnpm nx test core && pnpm nx test cli
```

Expected: zöld; **+4 core teszt**. A DELETE- és ALTER-teszt **tényleg elhasal permission denied-del** — ha bármelyik átmegy, a grant túl bő → STOP.

---

### Task 7: `product-schema.ts` + `upsertProduct` — az EGYETLEN írási út

**Files:**
- Create: `packages/core/src/lib/tools/upsert-product/product-schema.ts`, `product-schema.spec.ts`, `upsert-product-tool.ts`, `upsert-product-tool.spec.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `queryReadWrite` (Task 6), `ToolOutcome`/`ToolReporter` (Task 2).
- Produces: `ProductInputSchema`, `ProductInput`, `PRODUCT_COLUMNS`, `executeUpsertProduct(rawInput): Promise<ToolOutcome>`, `upsertProductTool(report?)`, `upsertProduct(input, deps?)`.

- [ ] **Step 1: Írd meg a sémát**

A referencia átvehető, mert a `packages/db/prisma/schema.prisma` mezői **pontosan egyeznek** a kurzuséval (ellenőrizve: `latin_name`, `sale_price`, `current_height_cm`, `max_height_cm`, `current_pot_cm`, `pet_safe`, `kid_safe`, `air_purifying`, `reviews_count`).

```bash
git -C ../ai-agent-kurzus show d8839d0:packages/core/src/lib/tools/upsert-product/product-schema.ts
```

Vedd át változtatás nélkül, két igazítással:

1. Az enum-értékek forrása nálunk a `CLAUDE.md` „Domain model: `products`" szakasza és a `docs/system-prompt.md` `<schema>` blokkja — ellenőrizd, hogy a `CATEGORY` / `LOCATION` / `LIGHT` / `WATERING` / `DIFFICULTY` listák **karakterre egyeznek** velük (ékezetes kisbetűs alak).
2. A fájl tetejére kommentbe: az enumok forrása a `docs/system-prompt.md`, és ha ott változnak, itt is változniuk kell.

- [ ] **Step 2: Írd meg a séma tesztjét**

```typescript
import { describe, expect, it } from 'vitest';
import { PRODUCT_COLUMNS, ProductInputSchema } from './product-schema.js';

const valid = {
  name: 'Szobafenyő',
  latinName: 'Araucaria heterophylla',
  category: 'szobanövény',
  location: 'beltéri',
  price: 12900,
  salePrice: null,
  stock: 5,
  light: 'közepes',
  watering: 'közepes',
  difficulty: 'kezdő',
  currentHeightCm: 60,
  maxHeightCm: 200,
  currentPotCm: 17,
  petSafe: true,
  kidSafe: true,
  airPurifying: true,
  rating: 0,
  reviewsCount: 0,
  description: 'Örökzöld szobanövény, párás levegőt kedvel.',
};

describe('ProductInputSchema', () => {
  it('elfogad egy teljes, érvényes terméket', () => {
    expect(ProductInputSchema.safeParse(valid).success).toBe(true);
  });

  it('elutasítja az árnál nem kisebb akciós árat', () => {
    const result = ProductInputSchema.safeParse({ ...valid, salePrice: 12900 });
    expect(result.success).toBe(false);
  });

  it('elutasítja az érvénytelen kategóriát', () => {
    const result = ProductInputSchema.safeParse({ ...valid, category: 'növény' });
    expect(result.success).toBe(false);
  });

  it('elutasítja az ismeretlen mezőt (strict)', () => {
    const result = ProductInputSchema.safeParse({ ...valid, hacked: true });
    expect(result.success).toBe(false);
  });

  it('az oszlop-térkép minden sémamezőt lefed', () => {
    const schemaKeys = Object.keys(valid).sort();
    const mapped = PRODUCT_COLUMNS.map(([field]) => field).sort();
    expect(mapped).toEqual(schemaKeys);
  });
});
```

> Az utolsó teszt azt a hibaosztályt fogja el, amit a `PRODUCT_COLUMNS`-ból összeálló paraméterezett INSERT/UPDATE elcsúszása okoz — ha egy mező kimarad a térképből, némán nem íródna ki.

- [ ] **Step 3: Írd meg az `upsert-product-tool.ts`-t**

```bash
git -C ../ai-agent-kurzus show d8839d0:packages/core/src/lib/tools/upsert-product/upsert-product-tool.ts
```

Vedd át, **három** igazítással:

1. A `db-readwrite.ts` importja a mi `queryReadWrite(sql, params, deps)` szignatúránkat használja, nem a kurzus `upsertProduct(input)`-ját — az upsert-logikát (SELECT id → UPDATE vagy INSERT ... RETURNING) tedd az `upsert-product-tool.ts` mellé egy `upsertProduct(input, deps?)` függvénybe, ugyanabban a könyvtárban.
2. A `report?.(toolCallId, 'upsertProduct', input, outcome)` hívás a mi `ToolReporter`-ünket használja.
3. A `ToolOutcome` a mi `tool-outcome.ts`-ünkből jön (`../tool-outcome.js`).

Az upsert magja (paraméterezett, string-konkatenáció nélkül — az oszlopnevek a `PRODUCT_COLUMNS` fix, kódban rögzített listájából jönnek, nem a modell inputjából):

```typescript
export type UpsertAction = 'created' | 'updated';

export interface UpsertResult {
  readonly action: UpsertAction;
  readonly id: number;
  readonly latinName: string;
}

/** Upsert latin név szerint (case-insensitive). Meglévőt frissít, újat beszúr — idempotens. */
export async function upsertProduct(
  input: ProductInput,
  deps: DbReadWriteDeps = {},
): Promise<UpsertResult> {
  const values = PRODUCT_COLUMNS.map(([field]) => input[field]);

  const found = await queryReadWrite<{ id: number }>(
    'SELECT id FROM products WHERE lower(latin_name) = lower($1) LIMIT 1',
    [input.latinName],
    deps,
  );

  if (found.rows.length > 0) {
    const id = found.rows[0].id;
    const setClause = PRODUCT_COLUMNS.map(
      ([, col], i) => `${col} = $${i + 1}`,
    ).join(', ');
    await queryReadWrite(
      `UPDATE products SET ${setClause} WHERE id = $${PRODUCT_COLUMNS.length + 1}`,
      [...values, id],
      deps,
    );
    return { action: 'updated', id, latinName: input.latinName };
  }

  const cols = PRODUCT_COLUMNS.map(([, col]) => col).join(', ');
  const placeholders = PRODUCT_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
  const inserted = await queryReadWrite<{ id: number }>(
    `INSERT INTO products (${cols}) VALUES (${placeholders}) RETURNING id`,
    values,
    deps,
  );
  return {
    action: 'created',
    id: inserted.rows[0].id,
    latinName: input.latinName,
  };
}
```

- [ ] **Step 4: Írd meg a tool tesztjét injektált pool-lal**

```typescript
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { executeUpsertProduct } from './upsert-product-tool.js';

function fakePool(rows: readonly Record<string, unknown>[][]): Pool {
  const query = vi.fn();
  for (const r of rows) {
    query.mockResolvedValueOnce({ rows: r, rowCount: r.length });
  }
  return { query } as unknown as Pool;
}

describe('executeUpsertProduct', () => {
  it('érvénytelen terméknél NEM ír DB-be, és MINDEN hibát egyben ad vissza', async () => {
    const pool = fakePool([]);
    const outcome = await executeUpsertProduct(
      { name: 'x', category: 'nemlétező' },
      { pool },
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.content).toMatch(/Érvénytelen termék/);
    expect(pool.query).not.toHaveBeenCalled();
  });
});
```

> A `deps` második paramétert vezesd át az `executeUpsertProduct`-on is (`rawInput: unknown, deps: DbReadWriteDeps = {}`), hogy a tool tesztelhető legyen valódi DB nélkül — a tool-factory `execute`-ja `deps` nélkül hívja, tehát a produkciós út változatlan.

- [ ] **Step 5: Vedd fel az exportokat és ellenőrizz**

`packages/core/src/index.ts`:

```typescript
export * from './lib/tools/upsert-product/upsert-product-tool.js';
export * from './lib/tools/upsert-product/product-schema.js';
export * from './lib/tools/upsert-product/db-readwrite.js';
```

```bash
pnpm nx run core:typecheck && pnpm nx test core && pnpm nx test cli
```

Expected: zöld; **+6 core teszt** (5 séma + 1 tool). Csökkenés → STOP.

---

### Task 8: `fetchFeed` — az élő Shopify-feed

**Files:**
- Create: `packages/core/src/lib/tools/fetch-feed/shopify-feed.ts`, `shopify-feed.spec.ts`, `fetch-feed-tool.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `fetchFeedCandidates({ source?, filter?, limit? })`, `FeedCandidate`, `FeedDomain`, `executeFetchFeed(rawInput)`, `fetchFeedTool(report?)`.

- [ ] **Step 1: Portold a feed-motort**

```bash
git -C ../ai-agent-kurzus show d8839d0:packages/core/src/lib/tools/fetch-feed/shopify-feed.ts
```

236 sor, **változtatás nélkül átvehető** — sima kliens-kód, LLM nélkül: letölt + lapoz (`/products.json?limit=250&page=N`, max 20 oldal), kiszűri a nem-növényeket, HUF-ra vált (USD 310 / EUR 350), dedupál latin név szerint. Két igazítás:

1. A `fetch`-hez adj **`AbortSignal.timeout(10_000)`-t** — a kurzus verziójában nincs időkorlát, és egy nem válaszoló feed a teljes agent-futást megakasztaná.
2. A fájl fejlécébe: ez a tool **motorja**, nem tool; az adatbázisba nem ez ír.

- [ ] **Step 2: Írd meg a motor tesztjét injektált `fetch`-csel**

A tesztnek **nem szabad valódi HTTP-t hívnia** (a CI és az offline futás miatt):

```typescript
import { describe, expect, it, vi } from 'vitest';
import { fetchFeedCandidates } from './shopify-feed.js';

const page = (products: unknown[]) => ({
  ok: true,
  status: 200,
  json: async () => ({ products }),
});

describe('fetchFeedCandidates', () => {
  it('normalizál, HUF-ra vált, és kiszűri a nem-növényeket', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        page([
          {
            handle: 'monstera-deliciosa',
            title: 'Monstera deliciosa',
            product_type: 'plant',
            tags: ['botanical:Monstera deliciosa'],
            body_html: '<p>Nagy levelű</p>',
            variants: [{ price: '19900', compare_at_price: null, available: true }],
          },
          {
            handle: 'cserep',
            title: 'Kerámia cserép',
            product_type: 'planter',
            variants: [{ price: '2900', available: true }],
          },
        ]),
      )
      .mockResolvedValueOnce(page([]));

    const result = await fetchFeedCandidates(
      { source: 'tropicalhome.hu' },
      { fetch: fetchMock },
    );

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].latinName).toMatch(/Monstera/i);
    expect(result.candidates[0].priceHuf).toBe(19900);
  });

  it('a filter szűkíti a találatokat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(page([]));
    const result = await fetchFeedCandidates(
      { source: 'tropicalhome.hu', filter: 'monstera' },
      { fetch: fetchMock },
    );
    expect(result.candidates).toEqual([]);
  });
});
```

> Ehhez a `fetchFeedCandidates`-nek **második, opcionális `deps` paramétert** kell kapnia (`{ fetch?: typeof globalThis.fetch }`), alapból a globális `fetch`-csel. Ez a kurzus verziójában nincs — nálunk a tesztelhetőség miatt bejön (T2, additív). A pontos állítások (`latinName`, `priceHuf`) a portolt kód tényleges viselkedéséhez igazítandók: **futtasd, és a tesztet igazítsd a kódhoz**, ne fordítva.

- [ ] **Step 3: Írd meg a tool-héjat**

```bash
git -C ../ai-agent-kurzus show d8839d0:packages/core/src/lib/tools/fetch-feed/fetch-feed-tool.ts
```

Átvehető, a `ToolOutcome` a mi `../tool-outcome.js`-ünkből.

- [ ] **Step 4: Ellenőrzés**

```bash
pnpm nx run core:typecheck && pnpm nx test core && pnpm nx test cli
```

Expected: zöld; **+2 core teszt**; a teszt-futás **nem megy ki a hálózatra** (ha lassú vagy hálózati hibát ad, az injektálás nem sikerült → STOP).

---

### Task 9: Az ingest-agent + a `pnpm cli ingest` parancs (doksi Lépés 3)

**Files:**
- Create: `packages/core/src/lib/agents/ingest-agent/ingest-agent.ts`, `ingest-prompt.ts`, `ingest-prompt.spec.ts`
- Modify: `packages/core/src/index.ts`, `apps/cli/src/main.ts`, `apps/cli/src/interactive.ts`

**Interfaces:**
- Consumes: `runAgentLoop`/`AgentDefinition` (Task 5), `runSqlTool` (Task 2), `upsertProductTool` (Task 7), `fetchFeedTool` (Task 8).
- Produces: `askIngestAgent(instruction, options): Promise<AskResult>`, `buildIngestPrompt(): string`.

- [ ] **Step 1: Írd meg az ingest promptot**

```bash
git -C ../ai-agent-kurzus show d8839d0:packages/core/src/lib/agents/ingest-agent/ingest-prompt.ts
```

Átvehető, **négy** igazítással:

1. „Plantbase" → **„Szobakertész"** mindenhol.
2. A `<schema>` blokk egyezzen a `docs/system-prompt.md` sémájával (ugyanaz a tábla, ugyanazok az enumok).
3. A `<tools>` szekcióból **hagyd ki a `listCategories`-t** — az ingest-agent nem kapja meg.
4. A `<rules>`-ba vedd fel: „**TÖRÖLNI nem tudsz és nem is szabad** — az adatbázis-szerep sem enged (`szoba-kertesz_rw`). Ha a felhasználó törlést kér, mondd meg, hogy ez nem az ingest-agent jogköre."

- [ ] **Step 2: Írd meg a prompt tesztjét**

```typescript
import { describe, expect, it } from 'vitest';
import { buildIngestPrompt } from './ingest-prompt.js';
import { buildQueryPrompt } from '../query-agent/query-prompt.js';

describe('buildIngestPrompt', () => {
  it('a szerkesztő szerepet írja le, nem a vásárlói kérdés-választ', () => {
    expect(buildIngestPrompt()).toMatch(/katalógus-kezelő/i);
  });

  it('kimondja, hogy írni CSAK az upsertProduct-tal lehet', () => {
    expect(buildIngestPrompt()).toMatch(/upsertProduct/);
    expect(buildIngestPrompt()).toMatch(/runSql csak SELECT|nyers módosító SQL-t NE/i);
  });

  it('NEM említi a listCategories toolt — az a query-agenté', () => {
    expect(buildIngestPrompt()).not.toMatch(/listCategories/);
  });

  it('külön prompt a query-agentétől', () => {
    expect(buildIngestPrompt()).not.toBe(buildQueryPrompt());
  });
});
```

- [ ] **Step 3: Írd meg az agentet**

```typescript
import type { ToolSet } from 'ai';
import { buildIngestPrompt } from './ingest-prompt.js';
import { runAgentLoop, type AskOptions, type AskResult } from '../agent-loop.js';
import { runSqlTool } from '../../tools/run-sql/run-sql-tool.js';
import { fetchFeedTool } from '../../tools/fetch-feed/fetch-feed-tool.js';
import { upsertProductTool } from '../../tools/upsert-product/upsert-product-tool.js';

// ingest-agent.ts — a KATALÓGUS-KEZELŐ agent. Ugyanaz a loop, mint a query-agentnél, de MÁS a
// szerep és a toolkészlet: itt a modell OLVAS (runSql), feedet néz (fetchFeed) ÉS ÍR
// (upsertProduct). A read/write szétválasztás KÉT szinten él: a tool-rétegben (az írás egyetlen,
// szigorúan validált, latin-név-kulcsú upsert; nyers write-SQL nincs) ÉS a DB-szerepkörben
// (szoba-kertesz_rw: SELECT/INSERT/UPDATE, de DELETE és DDL nélkül).
// Egy agent = prompt + toolok + loop:
//   prompt:  ingest-prompt.ts (szerkesztő szerep, normalizálási szabályok)
//   toolok:  runSql + fetchFeed + upsertProduct  — listCategories NINCS köztük
//   loop:    a közös agent-loop (agent-loop.ts)

export async function askIngestAgent(
  instruction: string,
  options: AskOptions = {},
): Promise<AskResult> {
  const trimmed = instruction.trim();
  if (trimmed === '') {
    throw new Error('Üres utasítást nem lehet végrehajtani.');
  }

  return runAgentLoop(
    trimmed,
    {
      systemPrompt: buildIngestPrompt(),
      buildTools: (report): ToolSet => ({
        runSql: runSqlTool(report),
        fetchFeed: fetchFeedTool(report),
        upsertProduct: upsertProductTool(report),
      }),
      // Az ingest több lépés lehet: feed-olvasás → katalógus-ellenőrzés → írás.
      maxSteps: 8,
      // Az upsert tool-argumentuma (teljes termék) a modell OUTPUTJA — nagyobb keret kell.
      maxOutputTokens: 4096,
      emptyAnswer:
        'Nem sikerült befejezni a katalógus-módosítást a megengedett lépésszámon belül. Pontosítsd az utasítást.',
    },
    options,
  );
}
```

- [ ] **Step 4: Vedd fel az `ingest` parancsot a CLI-ba**

Az `apps/cli/src/main.ts`-be, az `ask` parancs **mellé** (a meglévő `ask`, `--show-prompt`, `--quiet`, az argumentum nélküli interaktív indítás és a `STANDALONE_FLAGS` logika **változatlan marad**):

```typescript
program
  .command('ingest <instruction>')
  .description(
    'Katalógus-kezelő agent: természetes nyelvű utasításból vesz fel vagy frissít ' +
      'terméket. FIGYELEM: ez a parancs ÍR az adatbázisba.',
  )
  .option('--quiet', 'az élő, színes Trace elnémítása')
  .action(async (instruction: string, options: { quiet?: boolean }) => {
    try {
      const print = !options.quiet;
      const result = await askIngestAgent(instruction, { print });
      if (!print) {
        console.log(result.answer);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      // Az ingest-agent OLVAS (read-only pool) ÉS ÍR (read-write pool) — mindkettőt zárjuk,
      // különben a pg idleTimeoutMillis-e miatt a folyamat életben maradna.
      await Promise.all([closeReadonlyPool(), closeReadWritePool()]);
    }
  });
```

Az importba: `askIngestAgent`, `closeReadWritePool` a `@szoba-kertesz/core`-ból.

- [ ] **Step 5: Ellenőrzés**

```bash
pnpm nx run core:typecheck && pnpm nx run cli:typecheck && pnpm nx test core && pnpm nx test cli
pnpm cli ingest --help
```

Expected: zöld; **+4 core teszt**; a `--help` kiírja az `ingest` parancsot **API-hívás nélkül**. Az élő ingest-futás a Task 11-ben van.

⚠️ Ellenőrizd, hogy az `apps/cli/src/own-additions.spec.ts` 3 tesztje (readline-guard, `--show-prompt`) **továbbra is zöld** — az `interactive.ts` hozzányúlása a 4. saját kiegészítést fenyegeti.

---

### Task 10: Dokumentáció-igazítás

**Ezt nem szabad mellékhatásként megtörténni hagyni.** Ez az alkalom négy dokumentumot avít el.

**Files:** Modify: `CLAUDE.md`, `docs/konvenciók.md`, `docs/architektura.md`, `docs/system-prompt.md`

- [ ] **Step 1: `CLAUDE.md` — négy pont**

1. **„Hand-rolled agent loop" invariáns** → átírni: az `askAgent` a Vercel AI SDK 7 `generateText`-jén fut, `stopWhen: isStepCount(n)` kör-limittel; a mechanika a `prepareStep` / `onStepEnd` hookokon **továbbra is látható**, és a 2–3. óra kézi loopja adja a megértés alapját. **Ez tudatos döntés, nem sodródás** — írd le, hogy miért (a 05. streamelés).
2. **„Two DB connections, two privilege levels"** → **három** kapcsolat, három szint: `DATABASE_URL` (Prisma, admin), `DATABASE_URL_READONLY` (`szoba-kertesz_ro`, query-agent), `DATABASE_URL_READWRITE` (`szoba-kertesz_rw`, ingest-agent — SELECT/INSERT/UPDATE a products-on, DELETE és DDL nélkül). A query-agent **nem látja** az író toolokat.
3. **„Key files"** → az új szerkezet: `agents/agent-loop.ts`, `agents/query-agent/`, `agents/ingest-agent/`, `tools/<tool>/`, `tools/tool-outcome.ts`. A `tools/index.ts` dispatch **megszűnt** — új tool = egy sor az agent toolsetjében.
4. **„Commands"** → `pnpm cli ingest "<utasítás>"`; a grantok mostantól migrációban vannak (`prisma migrate deploy` a friss DB-hez is elég).

- [ ] **Step 2: `docs/konvenciók.md` — a doksi Lépés 5 szabályai**

A „Naming" szakasz végére:

```markdown
- **A fájlnév hordozza a szerepét is** — a típus-utótagból ránézésre látszik, mi micsoda:
  `*-agent.ts`, `*-tool.ts`, `*-prompt.ts`, `*-schema.ts`, `*.spec.ts`. Ne legyen két,
  csak szórendben eltérő név két különböző dologra (pl. `fetch-feed` tool vs `feed-fetch`
  kliens — az utóbbit nevezd a funkciójáról: `shopify-feed`).
```

A „Fájlszervezés" szakasz végére:

```markdown
- **Egy fogalom = egy könyvtár, benne MINDEN hozzávalója.** Agent-projektben: minden agent
  és minden tool saját könyvtárat kap a teljes felszerelésével (séma, guard, kliens,
  DB-kapcsolat, teszt) — aki a toolt olvassa, egy helyen lát mindent, ami hozzá tartozik.
- **A közös kód eggyel kintebb lakik**, a fogalmak szintjén (`agents/agent-loop.ts`,
  `tools/tool-outcome.ts`) — így a könyvtárlista maga a térkép: ami mappa, az egy példány;
  ami fájl, az a közös alap.
- Bekötés = egy sor: új tool felvétele az agenthez csak egy bejegyzés a toolsetjében.
  Ne legyen központi dispatch/registry, amit párhuzamosan kell karbantartani.
- A teszt a tesztelt kód mellett lakik (`run-sql/run-sql-tool.spec.ts`), nem külön fában.
```

- [ ] **Step 3: `docs/architektura.md`**

A `packages/core` leírásába vedd fel az `agents/` + `tools/` bontást és a két agentet. A „framework-agnosztikus core" invariáns **érvényben marad** (a core továbbra sem tud a belépési pontjáról) — csak a loop implementációja változott.

- [ ] **Step 4: `docs/system-prompt.md` bájtazonosság**

A `SYSTEM_PROMPT` konstans most a `agents/query-agent/query-prompt.ts`-ben él. Futtasd a `CLAUDE.md`-ben dokumentált diffet az **új útvonallal**:

````bash
diff <(sed -n '/^export const SYSTEM_PROMPT = `/,/^`;$/p' packages/core/src/lib/agents/query-agent/query-prompt.ts | sed '1s/^export const SYSTEM_PROMPT = `//' | sed '$d') \
     <(awk '/^```xml$/{f=1;next} /^```$/{f=0} f' docs/system-prompt.md)
````

Expected: **nincs eltérés**. Frissítsd a `CLAUDE.md`-ben magát a parancsot is az új útvonalra (a `prompts.ts` → `agents/query-agent/query-prompt.ts` csere).

- [ ] **Step 5: Ellenőrzés**

```bash
pnpm nx run core:typecheck && pnpm nx run cli:typecheck && pnpm nx test core && pnpm nx test cli
```

Expected: zöld; a `query-prompt.spec.ts` 10 tesztje fut; a diff üres.

---

### Task 11: Záró élő ellenőrzés

Most jönnek az API-költséges hívások, egyszerre. **A tényleges kimenettel számolj be, ne a várttal.**

- [ ] **Step 1: Teljes automata kapu**

```bash
pnpm nx reset
pnpm nx run core:typecheck && pnpm nx run cli:typecheck && pnpm nx test core && pnpm nx test cli
```

Expected: zöld; a darabszám **nem alacsonyabb**, mint a Task 3-ban rögzített alap + a Task 6/7/8/9 hozzáadásai (+4 +6 +2 +4 = **+16**). A 11 + 3 manifeszt-teszt zöld.

- [ ] **Step 2: A doksi „Végállapot ellenőrzése" blokkja, élőben**

```bash
# 2. A viselkedés nem változott a framework-váltástól
pnpm cli ask "Mit ajánlasz az ACME-nek?"
#    -> ugyanaz a válasz-jelleg és ugyanolyan trace, mint a 03. végén:
#       kör → tool → kör → válasz, körönként NŐTT üzenetszámmal

# 3. A két agent külön toolkészlettel fut
pnpm cli ask "Hány kaktusz van készleten?"
#    -> a trace tools sora: [runSql, listCategories, getClientPreferences]
pnpm cli ingest "állítsd a Kentia pálma készletét 7-re"
#    -> a trace tools sora: [runSql, fetchFeed, upsertProduct]
#    -> a két lista NEM fedi egymást, és a query-agent SOHA nem lát upsertProduct-ot

# 4. Az írás tényleg megtörténik
pnpm exec prisma studio
#    -> az ingest után a products táblában frissült a sor
```

- [ ] **Step 3: Regresszió-kapu — a saját kiegészítések élőben**

```bash
pnpm cli ask "Milyen növénykategóriák közül választhatok?"
#    -> a trace-ben listCategories fut le, NEM runSql

pnpm cli ask --show-prompt "Hány kaktusz van?"
#    -> kiírja a system promptot ÉS az üzenet-tömböt (saját kiegészítés #7)

ls -t logs/*.jsonl | head -1 | xargs tail -1 | python3 -m json.tool | grep -A3 usage
#    -> a JSONL utolsó sorában ott a token usage (saját kiegészítés #6 — a HF3
#       költségbecslés bizonyítékbázisa). Ha üres vagy hiányzik → STOP.

pnpm cli
#    interaktív módban visszautaló kérdés ("és olcsóbbat?")
#    -> a válasz az ELŐZŐ fordulóra épül. Ez a responseMessages-döntést validálja:
#       ha valaki response.messages-re írná vissza, a tool-váltás kiesne a memóriából,
#       és a visszautaló kérdés értelmezhetetlenné válna.

tail -f logs/agent.log   # másik terminálban, --quiet mellett is folyik
```

- [ ] **Step 4: Az író út határai élőben**

```bash
pnpm cli ingest "töröld a katalógusból az összes kaktuszt"
```

Expected: az agent **megtagadja** (nincs törlő toolja, és a prompt is kimondja). Ha bármilyen módon mégis törlésre kerül sor → **azonnal STOP**, és jelezd — az a jogosultsági réteg hibája.

- [ ] **Step 5: Lezárás**

Használd a `superpowers:verification-before-completion` skillt a spec négy kész-feltételére:

1. A doksi minden lépése végrehajtva, lefordított ellenőrző paranccsal, **tényleges** kimenettel.
2. `typecheck` + teszt zöld, **és a darabszám nem csökkent**.
3. A manifeszt zöld, mind a hét kiegészítésre.
4. A „Végállapot ellenőrzése" blokk élőben lefuttatva, a tényleges kimenet beidézve.

**Commit nincs**, hacsak a felhasználó nem kéri — kivéve a Task 4-ben már jóváhagyott CI-commitot.

---

## Ami NEM ebbe az alkalomba tartozik

- **Streamelés** (`streamText`) — a 05. alkalom. Az AI SDK 7 miatt ez lesz a könnyebb rész.
- **Teszt a CI-ban** — futó Postgres `services:` blokkot igényel; a 06-os plan viszi, a pgvector-migrációval együtt.
- **`CREATE EXTENSION "vector"` és `OPENAI_API_KEY`** — a 06. alkalom.
- **A `.claude/` oldali tooling** a kurzus `b01415d`-jéből (`skills/product-ingest/`, `agents/convention-audit.md`, `commands/ddd-audit.md`, `docs/ddd/`) — ez Claude Code-oldali szerszám, nem a termék része; külön döntés, külön alkalom.
- **`echo.ts`** — a kurzus a 07. alkalmon törli; addig marad.
