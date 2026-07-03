# szoba-kertesz

CLI AI agent szobanövény-tanácsadáshoz — magyar nyelvű kérdéseket válaszol meg egy szobanövény-katalógusról, természetes nyelven.

> Kurzus-projekt, korai fázisban. A teljes tervezett architektúrát és a domain-modellt lásd a [`docs/`](docs/) alatt — ez a README a jelenlegi, ténylegesen futó állapotot dokumentálja.

## Jelenlegi státusz

- ✅ Nx monorepo, `packages/core` + `packages/db` + `apps/cli` felépítve
- ✅ Postgres + Prisma séma + seed adat (~30 növény) betöltve
- ✅ CLI: `ask <kérdés>` és interaktív mód, valódi Anthropic LLM-hívással
- ✅ **Adatbázis-hozzáférés élesben bekötve (`runSql` tool)** — az agent valós SQL-t ír és futtat a `products` katalógustáblán, és a tényleges adatokra (készlet, ár, szűrés stb.) alapozva válaszol, nem talál ki adatot. Kétrétegű, egymástól független SELECT-only védelem: alkalmazás-szintű guard (csak SELECT engedélyezett, minden lekérdezés LIMIT-tel korlátozva) ÉS a `DATABASE_URL_READONLY` mögötti Postgres role is csak SELECT-jogosultsággal rendelkezik — bármelyik réteg önmagában is megállítana egy módosítási kísérletet.

A teljes fázisterv: [`docs/implementacios-terv.md`](docs/implementacios-terv.md).

## Előfeltételek

- Node LTS (fejlesztés alatt: v25.x), [pnpm](https://pnpm.io/) 10.x
- Docker (helyi Postgres-hez, pl. OrbStack)
- Anthropic API kulcs

## Telepítés

```bash
pnpm install
```

## Környezet beállítása

```bash
cp .env.example .env
```

Töltsd ki a `.env`-ben:

| Változó | Mire való |
|---|---|
| `ANTHROPIC_API_KEY` | az agens LLM-hívásaihoz |
| `ANTHROPIC_MODEL` | pl. `claude-sonnet-4-6` |
| `DATABASE_URL` | admin/RW kapcsolat (Prisma: séma, migráció, seed) |
| `DATABASE_URL_READONLY` | RO kapcsolat a `szoba-kertesz_ro` role-lal — ezt (és kizárólag ezt) használja az agent `runSql` toolja |
| `POSTGRES_*` | a docker-compose konténer admin hitelesítő adatai |

`.env`-et soha ne commitolj — gitignore-olva van.

## Adatbázis indítása

```bash
docker compose up -d
docker compose ps   # szoba-kertesz-postgres-1 legyen "healthy"
```

Az `init.sql` a konténer első indításakor létrehozza a `szoba-kertesz_ro` (SELECT-only) role-t.

Séma migrálása és a seed-katalógus (~30 növény) betöltése:

```bash
pnpm exec prisma migrate deploy
pnpm exec prisma db seed
```

## Build és futtatás

```bash
pnpm exec nx run cli:build
node apps/cli/dist/main.js --help
```

vagy egy lépésben:

```bash
pnpm szobakertesz --help
```

> A `pnpm szobakertesz` script argumentumokat továbbít a CLI-nek — de **ne tedd elé a `--`-t** (`pnpm szobakertesz -- --help`), mert a Commander `--`-kezelése miatt hibát dob; a redundáns `--` nélküli forma működik.

```
Usage: szobakertesz [options] [command]

Szobakertész CLI — szobanövény-katalógushoz kapcsolódó, magyar nyelvű kérdéseket
megválaszoló asszisztens.

Options:
  -V, --version             a CLI verziószámának kiírása
  -h, --help                display help for command

Commands:
  ask [options] <question>  Kérdés feltevése a szobakertész agensnek természetes
                            nyelven.
  help [command]            display help for command
```

### Egyszeri kérdés

```bash
node apps/cli/dist/main.js ask "mitől függ egy növény fényigénye?"
```

### Interaktív mód

Argumentum nélkül indítva a CLI egy folyamatos kérdés-válasz munkamenetet nyit; a `exit` beírásával lépsz ki:

```bash
node apps/cli/dist/main.js
```

### `--show-prompt`

A `ask` parancshoz és az interaktív módhoz is hozzáadható; a válasz kiírása előtt megjeleníti a modellnek ténylegesen elküldött teljes system promptot és üzenet-tömböt — hasznos, ha azt akarod látni, mi megy ki az LLM-nek:

```bash
node apps/cli/dist/main.js ask "szia" --show-prompt
node apps/cli/dist/main.js --show-prompt   # interaktív mód, minden kérdésnél kiírja
```

### Naplózás

Minden `ask`-hívás és interaktív munkamenet JSONL-be naplózódik a `logs/` alá (`logs/<timestamp>.jsonl`) — system prompt, üzenetek, válasz, token-felhasználás.

## Fejlesztés

```bash
pnpm nx test core          # packages/core unit tesztek (Vitest)
pnpm nx test cli           # apps/cli unit tesztek
pnpm nx run cli:typecheck  # tsc, csak típusellenőrzés
pnpm nx run cli:lint       # ESLint
```

## Debugolás VS Code-ban

A `.vscode/launch.json` négy indítási (launch) és egy csatlakozási (attach) konfigurációt tartalmaz. Mindegyik launch-config automatikusan lebuildeli a CLI-t (`development` konfigurációval, hogy a sourcemapek megmaradjanak) egy `preLaunchTask`-on keresztül, mielőtt elindítja.

Nyisd meg a Run and Debug panelt (⇧⌘D), válaszd ki az egyiket, majd F5:

| Konfiguráció | Mit csinál |
|---|---|
| **Debug @szoba-kertesz/cli (interactive)** | argumentum nélkül indít — interaktív kérdés-válasz mód |
| **Debug @szoba-kertesz/cli (interactive --show-prompt)** | interaktív mód, minden válasz előtt kiírja a teljes promptot |
| **Debug @szoba-kertesz/cli (ask)** | felugró mezőben bekéri a kérdést, egyszeri `ask` lefutás |
| **Debug @szoba-kertesz/cli (ask --show-prompt)** | mint fent, plusz kiírja a promptot |
| **Attach to @szoba-kertesz/cli (terminal)** | lásd alább |

Bármelyiket választod, tehetsz breakpointot közvetlenül a TypeScript forrásban (`apps/cli/src/`, `packages/core/src/`) — a sourcemapek miatt a debugger a valódi `.ts` sorokon áll meg, nem a lebuildelt `.js`-ben.

### Csatlakozás egy terminálból indított folyamathoz

Ha inkább te magad indítod a CLI-t a terminálban, és csak utólag akarsz debuggerrel rácsatlakozni:

```bash
pnpm szobakertesz:debug
```

Ez `development` configgal buildel (sourcemap megmarad), `--inspect`-tel és `--show-prompt`-tal indítja interaktív módban. Kézzel, más argumentumokkal:

```bash
pnpm exec nx run cli:build:development
node --inspect apps/cli/dist/main.js ask "kérdés"
```

majd VS Code-ban indítsd az **"Attach to @szoba-kertesz/cli (terminal)"** konfigurációt. Ha egy nagyon korai sorra (pl. a fájl elejére) teszel breakpointot, `--inspect-brk`-val indítsd a folyamatot, hogy megvárja a csatlakozást, mielőtt bármi lefutna.

## Dokumentáció

- [`docs/brs-szoba-kertesz.md`](docs/brs-szoba-kertesz.md) — üzleti/funkcionális követelmények
- [`docs/architektura.md`](docs/architektura.md) — a tervezett fájlstruktúra és kulcsdöntések
- [`docs/tech-stack.md`](docs/tech-stack.md) — technológiai stack és a `products` tábla sémája
- [`docs/system-prompt.md`](docs/system-prompt.md) — az agent tényleges system promptja
- [`docs/system-prompt-javitas.md`](docs/system-prompt-javitas.md) — a system prompt minőségi javításainak indoklása
- [`docs/pluginok-skillek.md`](docs/pluginok-skillek.md) — a használt Claude Code pluginek / skillek / MCP-szerverek és indoklásuk
- [`docs/konvenciók.md`](docs/konvenciók.md) — kódolási konvenciók
- [`docs/dev-workflow.md`](docs/dev-workflow.md) — git workflow, branch- és commit-konvenciók
- [`docs/implementacios-terv.md`](docs/implementacios-terv.md) — a teljes fázisterv (A1–A6, B1–B3)
- [`docs/roi.md`](docs/roi.md) — ROI-levezetés (5 fős lakberendező iroda megtakarítása számokkal)

## Git workflow

Feature branch-ek `feat/<rövid-leírás>` néven (`fix/`, `refactor/`, `docs/`, `chore/` prefixek is használatosak), Conventional Commits, egy `master`-be mergelt lépés = egy fókuszált commit. Részletek: [`docs/dev-workflow.md`](docs/dev-workflow.md).
