# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

Early-stage course project (course brief: `docs/brs-szoba-kertesz.md`). Only documentation and local DB infrastructure exist so far — **there is no application code yet** (no `package.json`, no Nx workspace, no `packages/` or `apps/` directories). There are currently no build/lint/test commands to run. Treat the files in `docs/` as the authoritative spec for what to build; don't invent commands or structure that aren't backed by those docs or the actual repo state.

## What this project is

`szoba-kertesz`: a CLI AI agent for an interior-designer persona. It translates Hungarian natural-language questions into read-only SQL over a plant catalog (`products` table) and returns natural-language answers, so assembling a plant package for a room doesn't require SQL knowledge. Full business requirements: `docs/brs-szoba-kertesz.md`.

## Local database

- `docker-compose.yml` runs Postgres 16-alpine via OrbStack, host port `5433` → container `5432`. Start with `docker compose up -d`.
- `init.sql` (mounted into `docker-entrypoint-initdb.d`) creates a read-only role `szoba-kertesz_ro` with SELECT-only grants (including default privileges for future tables) on the `public` schema.
- `.env` defines two connection strings — always keep this split when writing code that touches the DB:
  - `DATABASE_URL` — admin/read-write, for Prisma (schema, migrations, seed).
  - `DATABASE_URL_READONLY` — the `szoba-kertesz_ro` role; this is the **only** connection the agent's `runSql` tool may ever use.
- `.env`, `.env.bak`, and `.mcp.json` are gitignored — never commit them. A Prisma MCP server is configured in `.mcp.json` (`npx prisma mcp`) for schema/migration work.

## Planned architecture (Nx monorepo — not yet scaffolded)

`docs/architektura.md` specifies the target structure:

```
packages/core   agent logic (LLM call, runSql tool, schema context, logging)
packages/db     Prisma lib (schema, migration, client, seed) — NOT at repo root
apps/cli        CLI (`ask` command + interactive mode)
```

Key decisions to preserve when scaffolding/building this out:

- **Framework-agnostic core**: `packages/core` must not know about its entry point (CLI/API/web). A new surface is a new app, not a rewrite.
- **Two DB connections, two privilege levels**: the agent's `runSql` tool only ever uses `DATABASE_URL_READONLY` (SELECT-only). Prisma uses `DATABASE_URL`. The agent must never query through Prisma.
- **Hand-rolled agent loop**: `askAgent` is built directly on the Anthropic SDK (official client, not raw HTTP) with a manual tool-use loop — no agent framework — so the mechanics stay visible.
- **Transparency by default**: every interaction is logged as JSONL (`logs/<timestamp>.jsonl`): system prompt, messages, generated SQL, result, response, token usage. A `--show-prompt` flag dumps the full message array.
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

## Tech stack (`docs/tech-stack.md`) — target, once scaffolded

TypeScript (strict) / Nx / pnpm / Node LTS · PostgreSQL + Prisma · Anthropic SDK + hand-rolled tool-use loop + Zod · CLI via commander + `node:readline` · Vitest · ESLint + Prettier · tsx.
