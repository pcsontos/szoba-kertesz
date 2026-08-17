# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Working CLI agent, built as an Nx monorepo. `packages/core` (agent logic), `packages/db` (Prisma), and `apps/cli` (CLI) are scaffolded and functional: the full chain — CLI `ask` → `askAgent` tool-use loop → `runSql` / `listCategories` tools → read-only Postgres — runs and answers real catalog questions in Hungarian. Since the 04. alkalom there is a **second agent**: `ingest` (`pnpm cli ingest "<utasítás>"`) maintains the catalog through a single validated write path (`upsertProduct`) on its own read-write DB role, and can read a live Shopify feed (`fetchFeed`). Both agents run the *same* loop (`agents/agent-loop.ts`). The `docs/` files remain the authoritative spec; `docs/implementacios-terv.md` tracks the phase plan, `docs/HF1-hazifeladat.pdf` is the course assignment and `docs/hf1-hianyossagok.md` (gitignored) the running gap analysis.

### Commands

- **Local DB:** `docker compose up -d` (Postgres on host `5433`), then `pnpm exec prisma migrate deploy` + `pnpm exec prisma db seed` (schema + ~30 plants). Since the 04. alkalom the two agent roles (`szoba-kertesz_ro`, `szoba-kertesz_rw`) and their grants live in a **migration** (`<ts>_db_roles`), not only in `init.sql`: `init.sql` runs only on the container's first start, so after a `prisma migrate reset` the roles would survive but their grants would not. `migrate deploy` is therefore enough for a fresh DB too.
- **Build & run:** `pnpm cli ask "<kérdés>"` runs straight from source via `tsx` (no build). The `--conditions=@szoba-kertesz/source` flag in that script is load-bearing: it activates the `@szoba-kertesz/source` export condition in `packages/core/package.json`, so `@szoba-kertesz/core` resolves to `src/index.ts`. **Without the flag `tsx` falls back to `packages/core/dist/index.js`** — i.e. it would silently run a possibly stale build of `core` while only `apps/cli/src` came from source. `pnpm nx run cli:build` + `node apps/cli/dist/main.js ask "<kérdés>"` (or `pnpm szobakertesz ...`) still works for the built path. No-arg run starts interactive mode; `--show-prompt` dumps the full system prompt + message array, `--quiet` silences the live Trace.
- **Katalógus-kezelés (ÍR az adatbázisba):** `pnpm cli ingest "<utasítás>"` — the ingest agent (`runSql` + `fetchFeed` + `upsertProduct`). Same `tsx`/`--conditions` mechanics as `ask`; `--quiet` works here too. It writes on the `szoba-kertesz_rw` role, so `DATABASE_URL_READWRITE` must be set; without it the ask/query side still works fully and only `ingest` fails, with an explicit Hungarian message.
- **Tests:** `pnpm nx test core` / `pnpm nx test cli` (Vitest). Some `core` specs hit the real local DB via `DATABASE_URL_READONLY` and `DATABASE_URL_READWRITE`, so the DB must be up + seeded for them to pass. Two of them prove DB-level guarantees that no mock could: `db-readwrite.spec.ts` (the write role can UPDATE but cannot DELETE or ALTER) and `upsert-product-db.spec.ts` (two **concurrent** upserts on one latin name leave a single row, and a duplicate INSERT is rejected by the index). The latter works on its own throwaway latin names and cleans up over an **admin** connection — the `szoba-kertesz_rw` role deliberately cannot DELETE, so the test could not remove its own rows.
- **Typecheck / lint:** `pnpm nx run <core|cli>:typecheck` / `:lint`.
- **CI:** `.github/workflows/ci.yml` — `lint` + `typecheck` + `build` minden PR-en és `master` pushon. A `test` **szándékosan kimarad**: több `core` spec valódi, seedelt Postgresre támaszkodik, ami a runneren nincs (a `services: postgres` blokk a 06. alkalom scope-ja). A CI-t lokálisan a `pnpm nx run-many -t lint typecheck build` reprodukálja.
- **Claude PR-review kérése:** `pnpm pr:review` (leszedni: `pnpm pr:review:off`). A `claude-review.yml` **igény szerint** fut, nem minden pushra — egy review ~11 perc valódi API-költség. A script a `claude-review` címkét teszi a branchhez tartozó PR-re, és a címke felrakása indítja a workflow-t; ugyanez a címke újbóli felrakása újraindítja. Előfeltétele az `ANTHROPIC_API_KEY` repo-secret. A Claude Code GitHub App **nem** kell: a workflow a beépített `GITHUB_TOKEN`-nel hitelesít (ezért a kommentet a `github-actions[bot]` írja).

### Key files

The layout is the teaching map: **one concept = one directory**, the shared piece lives one level up. Directory = an instance, file = the common base.

- `packages/core/src/lib/agents/agent-loop.ts` — **the** loop, in one place. `runAgentLoop` + `AgentDefinition`; built on the Vercel AI SDK 7 `generateText` with `stopWhen: isStepCount(n)`. Every agent runs this one; the loop does not know which agent it runs or which tools exist. The Trace hangs on the `prepareStep` (what we send) / `onStepEnd` (what happened) hooks, and the JSONL logger is called at the end.
- `packages/core/src/lib/agents/query-agent/` — `query-agent.ts` (`askAgent`: `runSql` + `listCategories` + `getClientPreferences`) and `query-prompt.ts` (the product system prompt). Read-only.
- `packages/core/src/lib/agents/ingest-agent/` — `ingest-agent.ts` (`askIngestAgent`: `runSql` + `fetchFeed` + `upsertProduct` — **no** `listCategories`) and `ingest-prompt.ts`. This is the writing agent.
- `packages/core/src/lib/tools/<tool>/` — every tool with **all** its ingredients: `run-sql/` (`run-sql-tool.ts`, `sql-guard.ts` — SELECT-only guard that wraps queries in a subquery to force `LIMIT`, `db-readonly.ts` — the single readonly `pg` pool), `list-categories/`, `get-client-preferences/` (a non-SQL tool), `upsert-product/` (`product-schema.ts` strict Zod + `PRODUCT_COLUMNS`, `db-readwrite.ts`, `upsert-product-tool.ts` — the **only** write path), `fetch-feed/` (`shopify-feed.ts` engine + `fetch-feed-tool.ts`).
- `packages/core/src/lib/tools/tool-outcome.ts` — the shared `ToolOutcome` / `ToolReporter` shape every tool reports in. The old central `tools/index.ts` dispatch is **gone**: adding a tool = a new directory + **one line** in an agent's toolset. No registry to keep in sync. `summary` and `sql` are **two different fields on purpose**: `summary` is a human one-liner for the Trace (`"8 kategória"`, `"UPSERT products (created) · …"`), `sql` is machine evidence for the JSONL and holds **only** an actually executed query — so only `runSql` fills it, everything else reports `null`. While they were one field, non-SQL tools leaked their summaries into the log's `sql` column and the Trace had to sniff `input.query` to guess whether a tool was SQL-backed.
- `packages/core/src/lib/trace.ts` — the live, colored console trace (`Trace` class + `setWatchLog`/`traceLog`); shows the context growing turn by turn and writes `logs/<timestamp>.json`.
- The product system prompt lives in `packages/core/src/lib/agents/query-agent/query-prompt.ts`. The `SYSTEM_PROMPT` constant **must stay byte-identical to the ` ```xml ` block inside `docs/system-prompt.md`** (the doc wraps it in a heading + fence; only the fenced body is the contract). Verify with:

  ```bash
  diff <(sed -n '/^export const SYSTEM_PROMPT = `/,/^`;$/p' packages/core/src/lib/agents/query-agent/query-prompt.ts | sed '1s/^export const SYSTEM_PROMPT = `//' | sed '$d') \
       <(awk '/^```xml$/{f=1;next} /^```$/{f=0} f' docs/system-prompt.md)
  ```

  Improvements are documented in `docs/system-prompt-javitas.md`; `buildQueryPrompt()` is a thin wrapper returning the constant (`buildSystemPrompt()` is a deprecated alias). The ingest agent has its **own** prompt (`ingest-prompt.ts`); its `<schema>` block is kept identical to the one in `docs/system-prompt.md`, so both agents see the same table and the same enums.
- `packages/db/prisma/` — `schema.prisma`, migrations, `seed.ts`, `plants.ts` (catalog seed data). Two migrations carry rules the Prisma schema language cannot express, so they live in raw SQL and are the **authoritative source** for them: `<ts>_db_roles` (the two agent roles' grants) and `<ts>_products_latin_name_unique` (the `lower(latin_name)` unique index behind the upsert).
- `apps/cli/src/{main,interactive}.ts` — commander `ask` + `ingest` commands and `node:readline` interactive mode. Interactive mode is the **query agent's** (a conversation with history); `ingest` is deliberately one-shot.

## What this project is

`szoba-kertesz`: a CLI AI agent for an interior-designer persona. It translates Hungarian natural-language questions into read-only SQL over a plant catalog (`products` table) and returns natural-language answers, so assembling a plant package for a room doesn't require SQL knowledge. Full business requirements: `docs/brs-szoba-kertesz.md`.

## Local database

- `docker-compose.yml` runs Postgres 16-alpine via OrbStack, host port `5433` → container `5432`. Start with `docker compose up -d`.
- `init.sql` (mounted into `docker-entrypoint-initdb.d`) creates both agent roles on a fresh container. The authoritative source of the grants is the `<ts>_db_roles` **migration** — keep the two files' content in sync, and change the migration first.
- `.env` defines three connection strings — always keep this split when writing code that touches the DB:
  - `DATABASE_URL` — admin/read-write, for Prisma (schema, migrations, seed).
  - `DATABASE_URL_READONLY` — the `szoba-kertesz_ro` role; this is the **only** connection the agent's read-only tools (`runSql`, `listCategories`) may ever use.
  - `DATABASE_URL_READWRITE` — the `szoba-kertesz_rw` role; the ingest agent's `upsertProduct` path only. SELECT + INSERT + UPDATE on `products`, **no DELETE, no DDL**. Optional in `config.ts`: without it the query side works fully and only `ingest` fails.
- `.env`, `.env.bak`, and `.mcp.json` are gitignored — never commit them. A Prisma MCP server is configured in `.mcp.json` (`npx prisma mcp`) for schema/migration work.

## Architecture (Nx monorepo — scaffolded)

`docs/architektura.md` specifies the structure, now in place:

```
packages/core   agent logic — agents/ (agent-loop + one dir per agent),
                tools/ (one dir per tool), trace, logger, config
packages/db     Prisma lib (schema, migration, client, seed) — NOT at repo root
apps/cli        CLI (`ask` + `ingest` commands + interactive mode)
```

Key design invariants to preserve:

- **Framework-agnostic core**: `packages/core` must not know about its entry point (CLI/API/web). A new surface is a new app, not a rewrite. Unchanged by the SDK migration.
- **An agent = prompt + tools + loop**: the loop is shared (`agents/agent-loop.ts`); what distinguishes agents is only their `AgentDefinition` (system prompt, toolset, step limit, token budget). A new agent is a new directory under `agents/`, not a new loop.
- **Three DB connections, three privilege levels**: `DATABASE_URL` (Prisma, admin) · `DATABASE_URL_READONLY` (`szoba-kertesz_ro`, the query agent's `runSql`/`listCategories`, SELECT-only) · `DATABASE_URL_READWRITE` (`szoba-kertesz_rw`, the ingest agent's `upsertProduct`, no DELETE/DDL). No agent ever queries through Prisma, and the query agent **does not even see** the writing tools — the split is enforced in the tool layer *and* at the Postgres role level.
- **One write path only, and the key is enforced by the DB**: the catalog can be changed exclusively through `upsertProduct` (strict Zod at the boundary, parameterized SQL, column names from a code-fixed list, upsert keyed on latin name). Raw write SQL does not exist in the codebase. The upsert is a **single atomic statement** — `INSERT … ON CONFLICT (lower(latin_name)) DO UPDATE … RETURNING id, (xmax = 0) AS created` — backed by the `products_latin_name_lower_key` unique index (`<ts>_products_latin_name_unique` migration). It used to be SELECT-then-INSERT/UPDATE, and two concurrent upserts on the same name produced **two rows**: both SELECTs came back empty before either INSERT ran. Same principle as the role split: the invariant lives in Postgres, not in the prompt and not in the code. Change the index expression and the `ON CONFLICT` target together — they must match.
- **Loop on the AI SDK, mechanics still visible** *(changed in the 04. alkalom — a deliberate decision, not drift)*: `askAgent`/`askIngestAgent` run on the Vercel AI SDK 7 `generateText` with `stopWhen: isStepCount(n)` instead of the hand-rolled loop of the 2–3. alkalom. The hand-rolled version is what makes the framework legible: the `for` loop → `stopWhen`, the `executeTool` switch → the tools' own `execute`, the manual message-appending → the SDK. Transparency is preserved on the `prepareStep`/`onStepEnd` hooks (same Trace, same JSONL). The reason for switching is the 05. alkalom (streaming), which is not worth rebuilding by hand.
- **Transparency by default — two complementary traces, neither replaces the other**: (1) JSONL (`logs/<timestamp>.jsonl`) via `logger.ts`: system prompt, messages, generated SQL, result, response, token usage — this is the evidence base for cost estimates. **A run that dies mid-flight is logged too** (`answer: "[MEGSZAKADT] …"`, with the tokens spent up to that point, summed per step in `onStepEnd` because `result.usage` only exists on success) and the original error is then rethrown unchanged — otherwise a rate-limited or failed run would burn tokens and leave no trace, and the cost estimate would silently undercount. The two traces are independent: neither a failing `log()` nor a failing `trace.finish()` may take the other down; (2) the live `Trace` (`trace.ts`): colored console output plus a turn-structured `logs/<timestamp>.json`, and a continuous `logs/agent.log` watch log for `tail -f`. `--show-prompt` dumps the full message array; `--quiet` silences only the console half. In tests, `print: false` and `persistTrace: false` keep both quiet so no artifacts are written.
- **Prisma lives in `packages/db`**, not the repo root, so the schema is part of the Nx dependency graph and both `core` and the seed script import from there.
- Before coding against a new or rarely-used library API (e.g. Prisma), look up current docs via Context7 first — reduces errors under test.

## Domain model: `products`

Full schema in `docs/tech-stack.md`. Column semantics (Hungarian) — the agent's whole job is answering correctly against these:

- `category`: szobanövény / kerti / pozsgás / kaktusz / fűszer / fa-cserje / lógó / virágzó
- `location`: beltéri / kültéri / mindkettő
- `light`: árnyék / alacsony / közepes / erős / direkt nap
- `watering`: ritka / közepes / gyakori / állandóan nedves
- `difficulty`: kezdő / haladó / profi
- Effective price is always `COALESCE(sale_price, price)` — `sale_price` is null when there's no active discount.
- `current_height_cm`/`max_height_cm`/`current_pot_cm`: current vs. mature size and pot size, used for room-fit reasoning.
- `pet_safe` / `kid_safe` / `air_purifying`: boolean flags.

## Agent behavior contract

`docs/system-prompt.md` is the actual product-agent system prompt (not a Claude Code prompt) — the **query agent's** schema-context must match it exactly. Rules baked into it:

- SELECT only, ever — no INSERT/UPDATE/DELETE/DDL. Enforced at the DB role level (`szoba-kertesz_ro`), not just by prompt instruction. (The ingest agent is the deliberate exception: it has its own prompt and its own role, and even there writing is possible only through `upsertProduct` — DELETE and DDL are denied by Postgres for `szoba-kertesz_rw` too.)
- Always include a LIMIT.
- Text search via ILIKE.
- Ask a clarifying question instead of guessing when budget, room constraints, or quantity are missing from the request.
- Never invent columns or tables.

## Conventions (`docs/konvenciók.md`)

Project-agnostic TypeScript conventions (full detail in the doc). Highlights that aren't obvious defaults:

- `unknown` for untrusted/external input, never `any`.
- No mutation — spread into a new object instead of mutating in place.
- Zod validation at system boundaries, fail fast.
- No `console.log` in product code — structured logger only.
- Files ~200-400 lines (max 800), organized by feature/domain, not by type.
- **Prompts the product sends to the LLM** (system prompt, `askAgent` messages) are structured with XML-like tags (`<role>`, `<schema>`, `<rules>`, `<examples>`, ...) to reduce hallucination. This does **not** apply to prompts written for Claude Code itself, which stay natural language.

## Git workflow (`docs/dev-workflow.md`)

- `main` is always green/deployable — never commit directly to it.
- Feature branches: `feat/<short-desc>`; other prefixes: `fix/`, `refactor/`, `docs/`, `chore/`.
- Conventional Commits: `<type>: <description>`.
- One coherent step = one small, focused commit.
- Course checkpoint branches are named `stage-N` (fallback points).

## Tech stack (`docs/tech-stack.md`)

TypeScript (strict) / Nx / pnpm / Node LTS · PostgreSQL + Prisma · Vercel AI SDK 7 (`ai` + `@ai-sdk/anthropic`) tool-use loop + Zod · CLI via commander + `node:readline` · Vitest · ESLint + Prettier · tsx.
