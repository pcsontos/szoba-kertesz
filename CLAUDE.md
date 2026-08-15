# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Working CLI agent, built as an Nx monorepo. `packages/core` (agent logic), `packages/db` (Prisma), and `apps/cli` (CLI) are scaffolded and functional: the full chain — CLI `ask` → `askAgent` tool-use loop → `runSql` / `listCategories` tools → read-only Postgres — runs and answers real catalog questions in Hungarian. The `docs/` files remain the authoritative spec; `docs/implementacios-terv.md` tracks the phase plan, `docs/HF1-hazifeladat.pdf` is the course assignment and `docs/hf1-hianyossagok.md` (gitignored) the running gap analysis.

### Commands

- **Local DB:** `docker compose up -d` (Postgres on host `5433`), then `pnpm exec prisma migrate deploy` + `pnpm exec prisma db seed` (schema + ~30 plants).
- **Build & run:** `pnpm cli ask "<kérdés>"` runs straight from source via `tsx` (no build). The `--conditions=@szoba-kertesz/source` flag in that script is load-bearing: it activates the `@szoba-kertesz/source` export condition in `packages/core/package.json`, so `@szoba-kertesz/core` resolves to `src/index.ts`. **Without the flag `tsx` falls back to `packages/core/dist/index.js`** — i.e. it would silently run a possibly stale build of `core` while only `apps/cli/src` came from source. `pnpm nx run cli:build` + `node apps/cli/dist/main.js ask "<kérdés>"` (or `pnpm szobakertesz ...`) still works for the built path. No-arg run starts interactive mode; `--show-prompt` dumps the full system prompt + message array, `--quiet` silences the live Trace.
- **Tests:** `pnpm nx test core` / `pnpm nx test cli` (Vitest). Some `core` specs hit the real local DB via `DATABASE_URL_READONLY`, so the DB must be up + seeded for them to pass.
- **Typecheck / lint:** `pnpm nx run <core|cli>:typecheck` / `:lint`.

### Key files

- `packages/core/src/lib/agent.ts` — `askAgent`, the hand-rolled multi-step tool-use loop over the Anthropic SDK.
- `packages/core/src/lib/tools/` — the tool layer: `index.ts` (the `tools` array + `executeTool` dispatch — the single place that knows which tools exist), `run-sql.ts`, `list-categories.ts`, `client-preferences.ts` (a non-SQL tool), plus `sql-guard.ts` (SELECT-only guard, wraps queries in a subquery to force `LIMIT`) and `db-readonly.ts` (the single readonly `pg` pool). Adding a tool = one new file here + two lines in `index.ts`; the agent loop does not change.
- `packages/core/src/lib/trace.ts` — the live, colored console trace (`Trace` class + `setWatchLog`/`traceLog`); shows the context growing turn by turn and writes `logs/<timestamp>.json`.
- `packages/core/src/lib/prompts.ts` — the product system prompt. The `SYSTEM_PROMPT` constant **must stay byte-identical to the ` ```xml ` block inside `docs/system-prompt.md`** (the doc wraps it in a heading + fence; only the fenced body is the contract). Verify with:

  ```bash
  diff <(sed -n '/^export const SYSTEM_PROMPT = `/,/^`;$/p' packages/core/src/lib/prompts.ts | sed '1s/^export const SYSTEM_PROMPT = `//' | sed '$d') \
       <(awk '/^```xml$/{f=1;next} /^```$/{f=0} f' docs/system-prompt.md)
  ```

  Improvements are documented in `docs/system-prompt-javitas.md`; `buildSystemPrompt()` is a thin wrapper returning the constant.
- `packages/db/prisma/` — `schema.prisma`, migrations, `seed.ts`, `plants.ts` (catalog seed data).
- `apps/cli/src/{main,interactive}.ts` — commander `ask` command + `node:readline` interactive mode.

## What this project is

`szoba-kertesz`: a CLI AI agent for an interior-designer persona. It translates Hungarian natural-language questions into read-only SQL over a plant catalog (`products` table) and returns natural-language answers, so assembling a plant package for a room doesn't require SQL knowledge. Full business requirements: `docs/brs-szoba-kertesz.md`.

## Local database

- `docker-compose.yml` runs Postgres 16-alpine via OrbStack, host port `5433` → container `5432`. Start with `docker compose up -d`.
- `init.sql` (mounted into `docker-entrypoint-initdb.d`) creates a read-only role `szoba-kertesz_ro` with SELECT-only grants (including default privileges for future tables) on the `public` schema.
- `.env` defines two connection strings — always keep this split when writing code that touches the DB:
  - `DATABASE_URL` — admin/read-write, for Prisma (schema, migrations, seed).
  - `DATABASE_URL_READONLY` — the `szoba-kertesz_ro` role; this is the **only** connection the agent's read-only tools (`runSql`, `listCategories`) may ever use.
- `.env`, `.env.bak`, and `.mcp.json` are gitignored — never commit them. A Prisma MCP server is configured in `.mcp.json` (`npx prisma mcp`) for schema/migration work.

## Architecture (Nx monorepo — scaffolded)

`docs/architektura.md` specifies the structure, now in place:

```
packages/core   agent logic (LLM call, runSql tool, schema context, logging)
packages/db     Prisma lib (schema, migration, client, seed) — NOT at repo root
apps/cli        CLI (`ask` command + interactive mode)
```

Key design invariants to preserve:

- **Framework-agnostic core**: `packages/core` must not know about its entry point (CLI/API/web). A new surface is a new app, not a rewrite.
- **Two DB connections, two privilege levels**: the agent's read-only tools (`runSql` and `listCategories`) only ever use `DATABASE_URL_READONLY` (SELECT-only). Prisma uses `DATABASE_URL`. The agent must never query through Prisma.
- **Hand-rolled agent loop**: `askAgent` is built directly on the Anthropic SDK (official client, not raw HTTP) with a manual tool-use loop — no agent framework — so the mechanics stay visible.
- **Transparency by default — two complementary traces, neither replaces the other**: (1) JSONL (`logs/<timestamp>.jsonl`) via `logger.ts`: system prompt, messages, generated SQL, result, response, token usage — this is the evidence base for cost estimates; (2) the live `Trace` (`trace.ts`): colored console output plus a turn-structured `logs/<timestamp>.json`, and a continuous `logs/agent.log` watch log for `tail -f`. `--show-prompt` dumps the full message array; `--quiet` silences only the console half. In tests, `print: false` and `persistTrace: false` keep both quiet so no artifacts are written.
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

`docs/system-prompt.md` is the actual product-agent system prompt (not a Claude Code prompt) — `askAgent`'s schema-context must match it exactly. Rules baked into it:

- SELECT only, ever — no INSERT/UPDATE/DELETE/DDL. Enforced at the DB role level (`szoba-kertesz_ro`), not just by prompt instruction.
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

TypeScript (strict) / Nx / pnpm / Node LTS · PostgreSQL + Prisma · Anthropic SDK + hand-rolled tool-use loop + Zod · CLI via commander + `node:readline` · Vitest · ESLint + Prettier · tsx.
