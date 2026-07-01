# Szobakertesz — implementációs terv (proposal)

> **Generálva:** 2026-07-01
> **Forrás:** `brs-szoba-kertesz.md`, `architektura.md`, `tech-stack.md`, `konvenciók.md`, `dev-workflow.md`, `system-prompt.md`.
> **Komplexitás:** közepes-magas (Nx monorepo + kézzel írt LLM tool-use agent).
> A terv két nagy részből áll: **A) a környezet létrehozása** (mérföldkő: kész, futó, tesztelhető projekt) és **B) az implementáció 3 fázisa** (echo → LLM DB nélkül → SQL-es agent). Minden lépés kicsi, önállóan tesztelhető increment. A lépés végén **te tesztelsz**, utána **feature branch-en commit + merge a masterbe** zárja (Conventional Commits — lásd `dev-workflow.md`).

---

## Ellenőrzött előfeltételek (már megvannak)

- **Postgres fut:** `szoba-kertesz-postgres-1` konténer healthy, `docker compose ps` szerint. Az `init.sql` már lefutott: a `szoba-kertesz_ro` (READ-ONLY) role létezik az adatbázisban.
- **`.env` kész:** `DATABASE_URL` (RW, `admin`), `DATABASE_URL_READONLY` (RO, `szoba-kertesz_ro`), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL=claude-sonnet-4-6`.
- **Eszközök lokálisan:** Node v25.2.1, pnpm 10.30.2, Docker 29.4.0.
- **Seed-forrás:** a testvér `ai-agent-kurzus` repóban (`../ai-agent-kurzus/seed/plants.ts` + `seed.ts`) kész, ~30 soros, a `products` sémának megfelelő szintetikus adat — ezt **szó szerint átvesszük**, nem generáljuk újra.
- **`docker-compose.yml` és `init.sql`** már a repóban vannak, de még nincsenek commitolva (untracked) — az A rész első lépése ezt lezárja.

## Döntések (a mai válaszaid alapján — nem kell újra megkérdezni)

1. **Referencia-kód köre:** a testvér repóból **csak a seed-adatot és a függőség-verziókat** vesszük át. Az Nx scaffoldot, a tooling configot és a teljes B-rész agent-kódját (echo/LLM/runSql) a doksik alapján, nulláról építjük — ez tartja meg a "rétegenként látszik, ahogy épül" tanulási célt.
2. **CLI parancs neve:** `szobakertesz` (kötőjel nélkül, a doksik prózai brandingjéhez igazítva). A package-scope és a DB/RO-role viszont kötőjeles marad (`szoba-kertesz`, `szoba-kertesz_ro`), mert ezek már léteznek a repóban/DB-ben. **Ez szándékos eltérés, nem elírás** — lásd az egyes taskoknál.
3. **Git:** minden lépés (A1–A6, B1–B3) külön `feat/<leírás>` branch-en készül, a te tesztelésed után merge a `master`-be (a repo tényleges default branch-e `master`, a `dev-workflow.md` `main`-re vonatkozó szabályát erre értjük).
4. **Docs:** lapos marad, ez a terv is `docs/`-ban.
5. **Modell:** `.env`-ből `ANTHROPIC_MODEL=claude-sonnet-4-6`, nem váltunk módosítás nélkül. **Kockázat:** nem tudom megerősíteni, hogy ez érvényes, jelenleg elérhető modell-azonosító — ha a B2 fázisban az API elutasítja, egy aktuális stabil Claude modellre frissítjük (lásd Buktatók).
6. **Tool-use loop:** a nyers `messages.create` + kézzel írt `while (stop_reason === "tool_use")` ciklust használjuk, **NEM** az SDK `toolRunner`/`betaZodTool` helperét — ez a doksi kifejezett architektúra-döntése (3. pont: "hogy a mechanika látható maradjon").

## Package-elrendezés

```
pnpm-workspace.yaml: packages/*, apps/*

@szoba-kertesz/core   packages/core   framework-agnosztikus agent-logika (LLM-hívás, runSql tool, séma-kontextus, naplózás)
                                       — pg-vel (RAW, nem Prismán!) éri el a DB-t, csak DATABASE_URL_READONLY-n
@szoba-kertesz/db      packages/db    Prisma lib (séma, migráció, generált kliens, seed) — RW kapcsolaton
@szoba-kertesz/cli     apps/cli       CLI belépési pont, bin: szobakertesz
```

`packages/core` **nem függ** `packages/db`-től: az agent read-only `pg` klienssel dolgozik, a Prisma csak a séma/migráció/seed oldalon létezik (`architektura.md` 2. pont).

---

# A) A KÖRNYEZET LÉTREHOZÁSA

> **Mérföldkő:** a projekt felépül, a Postgres fut, a séma migrálva, a kész seed betöltve (~30 növény), és egy üres CLI elindul.

### A1 — Nx monorepo + tooling váz

- **Location:** repo gyökér.
- **Description:** `create-nx-workspace` (TS monorepo, `nrwl/typescript-template`, pnpm), `pnpm-workspace.yaml` (`packages/*`, `apps/*`). TypeScript **strict** (`tsconfig.base.json`), ESLint + Prettier, Vitest workspace config, `tsx`. `.gitignore` kiegészítése: `node_modules`, `dist`, `.nx`, `packages/db/generated`, `logs/`. `.env.example` létrehozása (a `.env` valós kulcsok nélküli váza).
- **Dependencies:** nincs (első lépés).
- **Context7:** Nx (`create-nx-workspace` + workspace-generátorok) — ellenőrizve, lásd fent.
- **Acceptance criteria:** `pnpm nx report` és `pnpm nx graph` lefut hiba nélkül; `pnpm prettier --check .` és a lint zöld.
- **Validation (te teszted):** a fenti két parancs sikeresen lefut.
- **Branch/Commit:** `feat/nx-scaffold` → `chore: scaffold nx workspace and tooling` → merge `master`-be.

### A2 — `packages/core` és `apps/cli` váz (üres)

- **Location:** `packages/core`, `apps/cli`.
- **Description:** `nx g @nx/js:lib core --directory=packages/core` (tsc bundler, framework-agnosztikus mag). `nx g @nx/node:app cli --directory=apps/cli --bundler=esbuild` (a build cjs kimenetet ad, ahogy a referencia is). Package-nevek: `@szoba-kertesz/core`, `@szoba-kertesz/cli`. Mindkettőbe egy triviális Vitest smoke-teszt.
- **Dependencies:** A1.
- **Acceptance criteria:** `pnpm nx build core`, `pnpm nx run cli:build`, `pnpm nx test core` mind zöldek.
- **Validation (te teszted):** a három parancs fut és zöld.
- **Branch/Commit:** `feat/core-cli-skeleton` → `chore: add core lib and cli app skeletons` → merge.

### A3 — Postgres ellenőrzés + commit (a fájlok már megvannak)

- **Location:** repo gyökér (`docker-compose.yml`, `init.sql`, `.env.example`).
- **Description:** A `docker-compose.yml` és `init.sql` már a repóban van és működik (lásd Előfeltételek) — ezt a lépést csak **igazoljuk és commitoljuk**, nem hozzuk létre újra. `.env.example` bővítése a három szükséges kulccsal (`ANTHROPIC_API_KEY`, `DATABASE_URL`, `DATABASE_URL_READONLY`) valós érték nélkül.
- **Dependencies:** A1 (`.gitignore`).
- **Acceptance criteria:** `docker compose ps` healthy; `docker compose exec postgres psql -U admin -d szoba-kertesz -c "\du"` mutatja a `szoba-kertesz_ro` role-t.
- **Validation (te teszted):** fenti két parancs kimenete megfelel.
- **Branch/Commit:** `feat/postgres-env` → `chore: commit postgres docker-compose with rw and read-only roles` → merge.

### A4 — `packages/db` Prisma lib (products séma + migráció)

- **Location:** `packages/db/prisma/schema.prisma`.
- **Description:** `@prisma/client` + `prisma` telepítése. `schema.prisma`: `generator client { output = "../generated/client" }`, `datasource db { url = env("DATABASE_URL") }`, `Product` modell a `tech-stack.md` séma szerint (camelCase mezők, snake_case oszlopok `@map`-pel, tábla `@@map("products")` — pontosan úgy, ahogy a `system-prompt.md` `<schema>`-ja leírja). Root `package.json`: `"prisma": {"schema": "packages/db/prisma/schema.prisma"}`. `prisma migrate dev --name init_products`.
- **Dependencies:** A3 (fut a DB).
- **Context7:** Prisma schema/generator/`@map`/migrate dev — ellenőrizve, lásd fent.
- **Acceptance criteria:** `docker compose exec postgres psql -U admin -d szoba-kertesz -c "\d products"` mutatja az oszlopokat; `pnpm prisma migrate status` clean.
- **Validation (te teszted):** fenti két parancs kimenete megfelel.
- **Branch/Commit:** `feat/db-prisma-schema` → `feat: add prisma db lib with products schema and initial migration` → merge.

### A5 — Kész seed betöltése (NEM generáljuk újra)

- **Location:** `packages/db/prisma/plants.ts`, `packages/db/prisma/seed.ts`.
- **Description:** A `../ai-agent-kurzus/seed/plants.ts` + `seed.ts` **szó szerinti** másolása ide (csak a fejléc-komment "Plantbase" → "Szobakertesz" cseréje, az adat és a logika változatlan). Root `package.json`: `"prisma": {"seed": "tsx packages/db/prisma/seed.ts"}` (a `schema` kulcs mellé). `pnpm prisma db seed`.
- **Dependencies:** A4.
- **Acceptance criteria:** `select count(*) from products;` → 30; egy mintalekérdezés (pl. `select name, category, price from products limit 5;`) értelmes magyar adatot ad.
- **Validation (te teszted):** fenti két lekérdezés kimenete megfelel.
- **Branch/Commit:** `feat/seed-data` → `feat: load prebuilt plant catalog seed` → merge.

### A6 — Üres CLI elindul (LLM és DB nélkül)

- **Location:** `apps/cli/src/main.ts`.
- **Description:** Commander program, `program.name("szobakertesz")`. Regisztrált `ask <question>` parancs (egyelőre placeholder: "nincs implementálva") + `--help`/`--version`. Még nincs LLM-hívás, nincs DB-elérés. Root `package.json` scriptben egy kényelmi alias (`pnpm szobakertesz -- <args>` → `nx run cli:build && node apps/cli/dist/main.js`).
- **Dependencies:** A2.
- **Context7:** Commander v15 (`program.argument`, action handler) — ellenőrizve, lásd fent.
- **Acceptance criteria:** a buildelt bin `--help`-re kiírja a használatot és tisztán (exit code 0) kilép.
- **Validation (te teszted):** `pnpm nx run cli:build && node apps/cli/dist/main.js --help`.
- **Branch/Commit:** `feat/cli-bootstrap` → `feat: bootstrap empty szobakertesz cli entrypoint` → merge.

**→ Mérföldkő kész: a környezet fut és tesztelhető.**

---

# B) AZ IMPLEMENTÁCIÓ — 3 FÁZIS

> Rétegről rétegre: előbb a CLI-mechanika (echo), majd az LLM (DB nélkül), végül az SQL-es tool. Mindegyik fázis előtt Context7, utána **te tesztelsz**, majd branch+commit+merge.

## B1 — CLI visszhang (echo), LLM nélkül

**Cél:** a CLI-n keresztül interaktálsz, a program visszaírja, amit beírtál. Még nincs LLM, nincs DB.

- **Context7:** Commander (parancsok/opciók, már ellenőrizve) + Node `readline` interaktív mód (beépített Node API, hivatalos Node-doksi alapján ellenőrizzük kódolás előtt).
- **Task B1.1** (`packages/core/src/lib/echo.ts`): tiszta függvény `echo(input: string): string`. TDD: előbb `echo.spec.ts` (piros), utána a minimál implementáció (zöld).
- **Task B1.2** (`apps/cli/src/main.ts` + `interactive.ts`): `szobakertesz ask "<kérdés>"` → visszhangozza (`echo: <amit beírtál>`); argumentum nélkül **interaktív readline mód** (`exit`-ig), minden sort visszaír.
- **Dependencies:** A6.
- **Validation (te teszted):** `szobakertesz ask "szia"` → `echo: szia`; interaktív módban több sor visszhangzik, `exit` kilép.
- **Branch/Commit:** `feat/cli-echo` → `feat: cli echo loop (single-shot and interactive)` → merge.

## B2 — LLM, adatbázis nélkül

**Cél:** a CLI egy sima LLM-hívásba van kötve. Az agent válaszol, DE **nincs DB-hozzáférése**: adatra vonatkozó kérdésnél őszintén jelzi, hogy nem fér hozzá az adatbázishoz.

- **Context7:** `@anthropic-ai/sdk` (`^0.107.0`) — `messages.create`, system prompt, `model`/`max_tokens`, `usage` — ellenőrizve, lásd fent.
- **Task B2.1** (`packages/core/src/lib/config.ts`): Zod-séma az env-re (`ANTHROPIC_API_KEY` kötelező, `ANTHROPIC_MODEL` alapértelmezéssel), fail-fast indításkor hibás/hiányzó env esetén.
- **Task B2.2** (`packages/core/src/lib/system-prompt.ts`, "no-tool" változat): XML-szerűen tagolt system prompt (`<role>`, `<task>`, `<constraint>`) a `system-prompt.md` `<role>` részéből kiindulva, de **kifejezett megkötéssel**: "nincs adatbázis-hozzáférésed; ha adatra (katalógusra) vonatkozó kérdés jön, közöld őszintén, hogy nem férsz hozzá, és ne találj ki adatot." (A B3-ban ezt lecseréljük a teljes, tool-os system promptra.)
- **Task B2.3** (`packages/core/src/lib/agent.ts`): `askAgent(question)` — egyetlen `messages.create` hívás, tool nélkül.
- **Task B2.4** (`packages/core/src/lib/logger.ts`): `logs/<timestamp>.jsonl` — system prompt, üzenetek, válasz, token-felhasználás. `--show-prompt` CLI-flag a teljes üzenet-tömb kiírására.
- **Task B2.5** (`apps/cli`): `ask`/interaktív mód átkötése `echo` helyett `askAgent`-re.
- **Dependencies:** B1.
- **Acceptance criteria / validation (te teszted):**
  - Általános kérdés (pl. "mitől függ egy növény fényigénye?") → értelmes válasz.
  - Adat-kérdés (pl. "hány pozsgás van raktáron?") → őszintén jelzi, hogy nincs DB-hozzáférése, nem talál ki számot.
  - `logs/` alatt JSONL keletkezik; `--show-prompt` kiírja a promptot.
- **Branch/Commit:** `feat/llm-no-db` → `feat: wire cli to llm (no db) with jsonl logging and --show-prompt` → merge.

## B3 — SQL-es interakció (runSql tool)

**Cél:** bekötjük a `runSql` toolt. Az agent a kérdésből SQL-t ír, READ-ONLY lefuttatja a katalóguson, és valós, természetes nyelvű választ ad.

- **Context7:** `@anthropic-ai/sdk` tool use (`tools`, `tool_use`/`tool_result` blokkok, `stop_reason: "tool_use"` — ellenőrizve, lásd fent); Zod (`^4.4.3`, tool-input validáció); `pg` (`^8.22.0`, RO kapcsolat kliense).
- **Task B3.1** (`packages/core/src/lib/db-readonly.ts`): `pg` kliens/pool **kizárólag** `DATABASE_URL_READONLY`-n.
- **Task B3.2** (`packages/core/src/lib/sql-guard.ts`): SELECT-only guard (regex/parszolás alapú tiltás INSERT/UPDATE/DELETE/DDL-re), kötelező/auto `LIMIT`. TDD: `sql-guard.spec.ts` előbb (piros → zöld: elfogad SELECT-et, elutasít mást).
- **Task B3.3** (`packages/core/src/lib/runsql-tool.ts`): `runSql(query)` tool-definíció Zod input-validációval, a fenti kettőt hívja.
- **Task B3.4** (`packages/core/src/lib/system-prompt.ts`, végleges): teljes `<role>`/`<task>`/`<schema>`/`<rules>`/`<behavior>`/`<tools>` a `system-prompt.md` szerint, szó szerint.
- **Task B3.5** (`packages/core/src/lib/agent.ts`, bővítve): kézzel írt tool-use ciklus — `messages.create` `tools`-szal; amíg `stop_reason === "tool_use"`, lefuttatja a `runSql`-t, `tool_result`-ot visszaad, újrahív; a végén természetes nyelvű válasz.
- **Task B3.6** (`logger.ts` bővítése): generált SQL + eredmény + tool-lépések a JSONL-be.
- **Dependencies:** B2, A5 (kell a betöltött seed a demóhoz).
- **Acceptance criteria / validation (te teszted) — demo-flow:**
  - "Mutass 3 pet-safe, alacsony fényigényű növényt raktáron, 5000 Ft alatt." → helyes szűrés, `COALESCE(sale_price, price)`, `stock > 0`, `LIMIT`.
  - Módosító kísérlet (pl. "töröld a...") → az agent nem módosít (SELECT-only guard **és** a DB read-only role is tiltja — kettős védelem, NFR1).
- **Branch/Commit:** `feat/runsql-tool` → `feat: add read-only runSql tool and hand-written tool-use loop` → merge.

**→ v1 kész:** természetes nyelvű kérdés → helyes SQL → helyes válasz, naplózva, read-only, `--show-prompt`-tal átlátható (BRS 5. sikerkritériumok).

---

## Fázis-összefoglaló (mérföldkövek, branch-ek és commitok)

| #   | Fázis                   | Eredmény                                     | Branch                    | Commit (típus) |
| --- | ------------------------ | --------------------------------------------- | -------------------------- | -------------- |
| A1  | Nx + tooling              | workspace, lint/teszt fut                     | `feat/nx-scaffold`         | `chore`        |
| A2  | core + cli váz            | buildelhető skeletonok                        | `feat/core-cli-skeleton`   | `chore`        |
| A3  | Postgres ellenőrzés+commit| RW/RO role-ok, `.env.example`, commitolva     | `feat/postgres-env`        | `chore`        |
| A4  | Prisma db lib             | `products` séma + migráció                    | `feat/db-prisma-schema`    | `feat`         |
| A5  | Seed betöltés             | ~30 növény az adatbázisban                    | `feat/seed-data`           | `feat`         |
| A6  | Üres CLI                  | `szobakertesz --help` fut                     | `feat/cli-bootstrap`       | `feat`         |
| B1  | CLI echo                  | visszhang single-shot + interaktív            | `feat/cli-echo`            | `feat`         |
| B2  | LLM, DB nélkül            | válaszol; adat-kérdésnél őszinte "nincs DB"   | `feat/llm-no-db`           | `feat`         |
| B3  | runSql tool               | NL → SQL → NL válasz, read-only               | `feat/runsql-tool`         | `feat`         |

Minden sor végén: **te tesztelsz → ha zöld, commitolunk és merge-elünk.**

## Testing Strategy

- **Unit (Vitest, TDD ahol értelmes):** `echo`, `sql-guard`, `config` (env-validáció), `system-prompt` (schema-context tartalom) — piros → zöld → refaktor.
- **Manuális/integrációs, fázisonként:** minden A/B lépés végén te futtatod a CLI-t/DB-lekérdezést a fenti Validation pontok szerint — ez explicit kérésed volt, nem automatizált e2e.
- **Nincs Playwright/e2e** ebben a körben — nincs web/API felület (v1 scope, `brs-szoba-kertesz.md` 3. pont).
- Cél: 80%+ lefedettség a tiszta egységeken (`konvenciók.md`).

## Potenciális buktatók (gotchas)

- **`ANTHROPIC_MODEL=claude-sonnet-4-6` érvényessége nem ellenőrizhető előre** (nincs rá közvetlen doksi-forrásom). Ha a B2 fázisban az API 404/400-at ad rá, egy aktuális stabil Claude modellre váltjuk `.env`-ben, és a task attól még zöld.
- **`packages/db/generated/client` gitignore:** a Prisma-generált kliens ne kerüljön a repóba (A1-ben bekerül a `.gitignore`-ba) — ha kimarad, a diffek feleslegesen nagyok lesznek.
- **`logs/*.jsonl` tartalmazhat kérdés-szöveget és API-válaszokat** → gitignore-oljuk (A1), nem termékadat, de nem való verziókezelésbe.
- **Kettős névkonvenció** (`szobakertesz` CLI vs. `szoba-kertesz` package/DB-scope) — szándékos (lásd Döntések #2), de minden érintett taskban külön kiírtam, melyik forma hova kerül, hogy ne keveredjen.
- **`packages/core` nem függ Prismától** — ha implementáció közben valaki `@prisma/client`-et importálna a core-ba, az architektúra-döntés (2. pont) sérül; a runSql kizárólag `pg`-t használjon.
- **Root-relatív Prisma parancsok:** a `packages/db/prisma/schema.prisma` nem a workspace gyökerén van, minden `prisma` parancsot a root `package.json`-ban konfigurált `schema`/`seed` kulccsal, a repo gyökeréből futtatunk, különben nem találja a `.env`-et.

## Rollback

- Minden lépés önálló branch + commit → egy sikertelen lépés `git checkout master` + a branch törlésével (`git branch -D feat/...`) nyomtalanul visszavonható, a korábbi mérföldkövek érintetlenek maradnak.
- A DB-oldalon `prisma migrate reset` (A4 után) biztonságosan visszaállítja a sémát, mielőtt újra migrálnánk.
