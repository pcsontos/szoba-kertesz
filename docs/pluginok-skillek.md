# Telepített pluginek / skillek / MCP-szerverek — és miért ezek

> HF1 kötelező tétel: „Min. 3 releváns plugin/skill: telepíts a piacról a projekthez illőt, rövid indoklással." Ez a doksi a Claude Code-dal vezérelt build során ténylegesen használt, projekt-releváns kiegészítőket sorolja fel, indoklással. A tényleges bekapcsolás a `.claude/settings.local.json` és a `.mcp.json` fájlokban van — ezek **szándékosan gitignore-oltak** (a `settings.local.json` egy GitHub PAT-ot is tartalmaz, ami soha nem kerülhet a repóba), ezért gyűjti egy helyre ez a dokumentum, mit és miért kapcsoltunk be.

## Pluginek / skillek

| Plugin / skill | Forrás | Mit ad | Miért releváns ehhez a projekthez |
|---|---|---|---|
| **superpowers** | `claude-plugins-official` | Munkafolyamat-skillek: `brainstorming`, `test-driven-development`, `systematic-debugging`, `writing-plans`, `verification-before-completion`, stb. | HF1 által kötelezően kért. Ténylegesen használva: a `runSql` és a `listCategories` tool **TDD-vel** (piros→zöld) készült, a build `plan mode`-ban indult (kód előtti terv), és a „kész" állításokat mindig futó teszttel/élő CLI-teszttel igazoltuk (`verification-before-completion`). |
| **commit-commands** | `claude-plugins-official` | `/commit`, `/commit-push-pr`, `clean_gone` — Conventional Commits generálás staged diffből. | HF1 által kötelezően kért, és az értékelt „követhető, fókuszált commit-history" közvetlenül ezen múlik. A repó összes commitja kicsi, fókuszált, Conventional Commits formátumú. |
| **skill-creator** | `claude-plugins-official` | Új skillek létrehozása/szerkesztése/mérése a piactérre illően. | HF1 által kötelezően kért. A projekt testreszabott munkafolyamataihoz (pl. saját audit/doc-skillek) ez az eszköz. |
| **pnpm** | `nuxt-skills` | pnpm-specifikus tudás: workspace/monorepo, catalog, `overrides`, patch, CI. | A projekt **pnpm + Nx monorepo** (`packages/core`, `packages/db`, `apps/cli`, `pnpm-workspace.yaml`). A workspace-ek helyes kezelése (pl. `onlyBuiltDependencies` a Prisma-hoz) pont ide illik. |

## MCP-szerverek

| MCP-szerver | Hol van bekötve | Miért releváns |
|---|---|---|
| **github** | user-szintű plugin (`claude-plugins-official`) | HF1 által **kötelezően** kért („mindenképp a github MCP"). A repo-, PR- és issue-műveletekhez (pl. push, PR-nyitás, branch-kezelés) a GitHub platformmal való programozott interakció. |
| **Context7** | user-szintű plugin (`context7@claude-plugins-official`) | HF1 által javasolt „választott" MCP a dokumentációkhoz. A projekt `CLAUDE.md`-je kifejezetten előírja: „Before coding against a new or rarely-used library API (e.g. Prisma), look up current docs via Context7 first." Használva az Anthropic SDK, Prisma, commander, pg API-k aktuális doksijához. |
| **prisma** | repo-szintű `.mcp.json` (`npx prisma mcp`) | Projekt-specifikus: a `packages/db` Prisma-alapú (séma, migráció, seed, kliens). A séma- és migrációs munkát ez a szerver segíti — pontosan az adatbázis-rétegre szabva. |

## Megfelelés a HF1 elvárásnak

- **Min. 3 releváns plugin/skill**: teljesül (superpowers, commit-commands, skill-creator + pnpm) — mind a projekt tényleges technológiai stackjéhez (pnpm/Nx monorepo, TDD, Conventional Commits) illeszkedik.
- **MCP: 2–3 szerver, mindenképp github + 1 választott**: teljesül (github + Context7 + a projekt-specifikus prisma).
- Mindegyikhez rövid, **projekt-releváns** indoklás tartozik (nem általános „hasznos eszköz"), a fenti táblázatokban.

## Megjegyzés a reprodukálhatóságról

A `github`, `Context7`, `superpowers`, `skill-creator`, `pnpm` a user-szintű Claude Code konfigból aktívak (nem a repóból), a `prisma` MCP és a projekt-szintű plugin-engedélyek pedig a gitignore-olt `.mcp.json` / `.claude/settings.local.json` fájlokban. Egy tiszta klón tehát nem örökli automatikusan ezeket — ezt szándékosan így hagyjuk (a `settings.local.json` tokent tartalmaz), és ez a doksi rögzíti a választásokat és indoklásukat.
