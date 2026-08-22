# szoba-kertesz

Magyar nyelvű AI-ágens szobanövény-katalógushoz: természetes nyelvű kérdésekre a valódi katalógusadatból válaszol — böngészőből és parancssorból egyaránt. A katalógust egy külön, írási jogú ágens tartja karban.

## HF3 — hol találod a leadandókat

> A kurzus 3. házi feladata (RAG) ebben a repóban készült el. A hat leadandó és a helyük — a részletes
> végigvezetés: [`docs/hf3-leadas.md`](docs/hf3-leadas.md).

| # | leadandó | hol | mi bizonyítja |
|---|---|---|---|
| 1 | működő repo + futtatási instrukciók | [„Build és futtatás"](#build-és-futtatás) | a CI zöld: `lint` + `typecheck` + `build` |
| 2 | chunking-stratégia indoklással | [`docs/chunking-strategia.md`](docs/chunking-strategia.md) | minden száma a 202 cikken mérve; 17 unit teszt a `chunk.ts`-en |
| 3 | golden set + nyers vs. teljes + negatív teszt | [`docs/golden-set.md`](docs/golden-set.md) · [`docs/golden/`](docs/golden/) | 9 kérdés, két tudásbázis-állapoton, két generált mérésben |
| 4 | multi-provider szereposztás | [„Multi-provider szereposztás"](#multi-provider-szereposztás) | három modell, három indok, aktuális árakkal |
| 5 | `docs/ARCHITEKTURA.md` + ábra | [`docs/ARCHITEKTURA.md`](docs/ARCHITEKTURA.md) · [`docs/img/`](docs/img/) | 7 szakasz + az adatfolyam-ábra a törlés útjával |
| 6 | költségbecslés | [„Költségbecslés"](#költségbecslés) | mért és becsült számok szétválasztva |

## Jelenlegi státusz

### Felület — streamelő chat (`apps/web`)

React 19 + a Vercel AI SDK `useChat` hookja (`DefaultChatTransport`). A válasz **tokenenként** érkezik, markdownként renderelve; „Állj" gombbal megszakítható a futó válasz, és az auto-scroll nem rántja vissza a felhasználót, ha közben felfelé olvas. Tailwind 4, shadcn-stílusú komponensréteg (Radix Slot + `cva` + `tailwind-merge`).

A 06. alkalom óta a chat **azt is megmutatja, MIT csinált** az ágens: a tool-hívások kártyaként jelennek meg a válasz fölött — a tudásbázis-találatok címmel, kattintható forrás-linkkel és színkódolt vektortávolsággal, a katalógus-lekérdezés a ténylegesen lefuttatott SQL-lel. Ezt a korábbi szöveg-stream nem tudta, és nem sebesség kérdése volt: **egy karakterfolyamba nem fér bele egy tool-hívás**. A szerver ezért AI SDK **üzenet-streamet** küld (`text/event-stream`), típusos részekkel.

### Egy mag, több belépési pont

A `packages/core` **framework-független** — nem tud sem a CLI-ről, sem a HTTP-ről. Az `apps/server` (Express 5, Zod-validálás a kérés határán) vékony réteg fölötte: a böngészőből érkező kérdés pontosan ugyanazt az `askAgent`-et hívja, mint az `apps/cli`. A beszélgetés-előzményt a szerver alakítja át a közös loop `history` opciójává.

### Két tudásforrás — katalógus és tudásbázis (RAG)

Az ágens **kétféle kérdésre** felel, és tudja, melyikre melyikkel:

- **„Mit árultok?"** → SQL a `products` táblán (`runSql`, `listCategories`).
- **„Hogyan gondozzam?"** → **tudásbázis-keresés** (`searchKnowledge`): 202 letöltött növénygondozási cikk a repo gyökerében (`seed/knowledge/`), alcím-határon darabolva, `pgvector`-ral vektorizálva — 1906 chunk × 1536 dimenzió a `knowledge_chunks` táblában. A keresés a **read-only** szerepen megy, a betöltés adminon.

A keresés nem kulcsszó-egyezés, hanem **jelentés-távolság**, és négy lépésből áll: **HyDE** (a modell kitalál egy hipotetikus választ, és azt keressük a kérdés helyett — így a kérdés és a dokumentumok ugyanazon a nyelven „beszélnek"), **embedding** (OpenAI `text-embedding-3-small`), **pgvector top-20** (`<=>` koszinusz-távolság, egyetlen SQL-ben), majd **átrangsorolás** egy kisebb modellel (`claude-haiku-4-5`) — kézzelfogható modell-routing: a drága modell válaszol, az olcsó válogat.

A system prompt `<grounding>` blokkja kimondja, hogy gondozási kérdésre a modell **nem a saját tudásából** válaszol, hanem a találatokból, forrás-hivatkozással. Ha nincs találat, azt mondja meg — nem talál ki gondozási tanácsot.

### Multi-agent, szétválasztott adatbázis-jogosultsággal

- **`query-agent`** — olvas. Csak a `szoba-kertesz_ro` (SELECT-only) role-t látja.
- **`ingest-agent`** — ír. Saját system prompt, saját toolkészlet, `szoba-kertesz_rw` role.
- **`delegateToIngest`** — a query-agent **tool-hívásként** adja át a katalógus-módosítást. Belül teljes második loop fut, saját trace-szel és saját költségméréssel: egy ágens is lehet egy másik ágens toolja. Az olvasó ágens maga sosem ír.

### Kétrétegű, egymástól független írásvédelem

Az olvasó úton két, egymástól független réteg véd: **alkalmazásszintű guard** (csak `SELECT`, `SELECT INTO` tiltva, minden lekérdezés subquery-be csomagolt `LIMIT`-tel korlátozva) **és** a `DATABASE_URL_READONLY` mögötti Postgres role, amely maga is csak SELECT-jogosultsággal rendelkezik. Bármelyik réteg önmagában is megállítana egy módosítási kísérletet.

### Toolok

`runSql` · `searchKnowledge` (RAG a gondozási tudásbázisban) · `upsertProduct` (Zod-sémával, az egyetlen írási út) · `fetchFeed` (élő Shopify-termékfeed) · `listCategories` · `getClientPreferences` · `delegateToIngest` (csak adminnál)

### Minőségi kapuk

262 teszteset 45 spec fájlban (Vitest): `core` 195, `cli` 35, `server` 19, `web` 13. CI minden pushra és PR-ra: `lint` + `typecheck` + `build`. A teszt-lépés **szándékosan** nincs a CI-ban: több spec valódi, seedelt Postgresre támaszkodik, a runneren pedig nincs adatbázis — a zölden hazudó CI rosszabb, mint a hiányzó teszt-lépés. Az indoklás a [`ci.yml`](.github/workflows/ci.yml) tetején áll.

---

Architektúra és domain-modell: [`docs/architektura-monorepo.md`](docs/architektura-monorepo.md) · teljes fázisterv: [`docs/implementacios-terv.md`](docs/implementacios-terv.md) · konvenciók: [`docs/konvenciók.md`](docs/konvenciók.md)

A projekt egy AI-ágensfejlesztés kurzus keretében készül: a mérföldköveket a tananyag adja, a tervezési és megvalósítási döntések a `docs/` alatt dokumentáltak.

## Előfeltételek

- Node LTS (fejlesztés alatt: v25.x), [pnpm](https://pnpm.io/) 11.x
- Docker (helyi Postgres-hez, pl. OrbStack)
- Anthropic API kulcs
- OpenAI API kulcs — **opcionális**, csak a tudásbázishoz (embedding); nélküle a katalógus-oldal teljesen működik

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
| `DATABASE_URL` | admin/RW kapcsolat (Prisma: séma, migráció, seed) **és a tudásbázis BETÖLTÉSE** (`pnpm knowledge:ingest` — TRUNCATE + INSERT). Futásidőben az ágensek egyike sem használja |
| `DATABASE_URL_READONLY` | RO kapcsolat a `szoba-kertesz_ro` role-lal — ezt használja a query-agent `runSql` / `listCategories` toolja **és a tudásbázis KERESÉSE** (`searchKnowledge`). A vásárlót kiszolgáló szerver így sosem nyit admin kapcsolatot |
| `DATABASE_URL_READWRITE` | RW kapcsolat a `szoba-kertesz_rw` role-lal — kizárólag az ingest-agent `upsertProduct` útja. **Opcionális:** nélküle a kérdés-válasz oldal teljesen működik, csak az `ingest` bukik el, érthető magyar üzenettel |
| `OPENAI_API_KEY` | a tudásbázis embedding-modelljéhez (`text-embedding-3-small`) — **a projekt egyetlen nem-Anthropic hívása**, mert embedding-modellt az Anthropic nem ad. **Opcionális:** nélküle a katalógus-oldal (CLI, web, `runSql`, `listCategories`) teljesen működik, csak a `searchKnowledge` és a `knowledge:ingest` bukik el, érthető magyar üzenettel. A HyDE-t és az átrangsorolást NEM érinti: azok Claude Haikun futnak |
| `POSTGRES_DB`, `POSTGRES_ADMIN_USER`, `POSTGRES_ADMIN_PASSWORD` | a docker-compose konténer admin hitelesítő adatai |

A webes felület a `VITE_API_URL` változóból veszi a szerver címét (alapértelmezés: `http://localhost:3000`); helyi fejlesztéshez nem kell beállítani.

`.env`-et soha ne commitolj — gitignore-olva van.

## Adatbázis indítása

```bash
docker compose up -d
docker compose ps   # szoba-kertesz-adatbazis legyen "healthy"
```

Az `init.sql` a konténer **első** indításakor létrehozza a két agent-role-t (`szoba-kertesz_ro`, `szoba-kertesz_rw`). A jogosultságok **elsődleges forrása** azonban a `<ts>_db_roles` migráció, nem az `init.sql`: az utóbbi csak új konténernél fut le, így egy `prisma migrate reset` után a role-ok megmaradnának, a grantjeik viszont nem. Ezért friss adatbázishoz is elég a `migrate deploy`.

Séma migrálása és a seed-katalógus (30 növény) betöltése:

```bash
pnpm db:migrate   # prisma migrate deploy
pnpm db:seed      # prisma db seed
```

Van egy harmadik script is, `pnpm db:reset` (`prisma migrate reset`), ami az egész adatbázist eldobja és a migrációkból újraépíti.

> ⚠️ A `db:reset` **a tudásbázist is eldobja** (`knowledge_chunks`, 1906 sor). Utána `pnpm knowledge:ingest` kell, ami valódi, fizetős OpenAI-hívásokat indít (~0,55 cent). Ezért a script szándékosan **nem** kap `--force`-ot: a Prisma visszakérdez, mielőtt bármit törölne.

A **tudásbázis** (202 gondozási cikk → 1906 vektorizált chunk) külön lépés, mert valódi OpenAI-hívásokat indít:

```bash
pnpm knowledge:ingest
```

Teljes újraépítés (TRUNCATE + újratöltés), nem inkrementális — kis korpusznál ez a helyes stratégia. `OPENAI_API_KEY` kell hozzá; enélkül a katalógus-oldal ettől függetlenül működik.

## Build és futtatás

### Webes felület

Két folyamat kell, két terminálban:

```bash
pnpm serve:api    # Express — http://localhost:3000/api/chat
pnpm serve:web    # Vite    — http://localhost:4200
```

Nyisd meg a `http://localhost:4200` címet. A szerver konzolján közben ugyanaz a színes, körről körre növekvő ágens-trace fut, mint a CLI-ben; a böngésző a válasz mellé a **tool-lépéseket** is megkapja (üzenet-stream), és kártyaként jeleníti meg őket.

A RAG-hoz **debug-végpontok** is tartoznak (élesben nincsenek mountolva):

```bash
curl -s localhost:3000/debug/knowledge/sources           # milyen dokumentumok, hány darabban — CSAK DB, ingyenes
curl -s localhost:3000/debug/knowledge/sources/<id>      # egy dokumentum a chunkjaival és a teljes szöveggel
curl -s "localhost:3000/debug/knowledge/chunks?search=sárgul"                 # nyers vektorkeresés (1 embedding-hívás)
curl -s "localhost:3000/debug/knowledge/chunks?search=sárgul&pipeline=full"   # HyDE + rerank is (fizetős)
```

Ezek azért vannak, hogy a RAG két fele **külön legyen hibáztatható**: a RETRIEVAL (mit talált) és a GENERÁLÁS (mit mond). Ha rossz a válasz, előbb ide nézz — a RAG-hibák többsége retrieval-hiba.

### CLI

A `pnpm cli` script **build nélkül**, `tsx`-szel futtat közvetlenül a forrásból — ez a leggyorsabb kör:

```bash
pnpm cli --help
```

A buildelt út is működik:

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
  -V, --version                   a CLI verziószámának kiírása
  -h, --help                      display help for command

Commands:
  ask [options] <question>        Kérdés feltevése a szobakertész agensnek
                                  természetes nyelven.
  ingest [options] <instruction>  Katalógus-kezelő agent: természetes nyelvű
                                  utasításból vesz fel vagy frissít terméket.
                                  FIGYELEM: ez a parancs ÍR az adatbázisba.
  help [command]                  display help for command
```

### Egyszeri kérdés

```bash
pnpm cli ask "mitől függ egy növény fényigénye?"
```

### Interaktív mód

Argumentum nélkül indítva a CLI egy folyamatos kérdés-válasz munkamenetet nyit (a query-agenttel, előzménnyel); az `exit` beírásával lépsz ki:

```bash
pnpm cli
```

### Szerep — `--role`

```bash
pnpm cli ask --role admin "Vedd fel a katalógusba a Kentia pálmát: ár 15900 Ft, készlet 5 …"
```

Két érték van: `customer` (alapértelmezés) és `admin`. A szerep **képességet kapcsol, nem prompt-tiltást**: adminként a toolkészletbe bekerül a `delegateToIngest`, vásárlóként a modell **nem is tudja, hogy létezik**. A különbség a trace `tools:` sorában azonnal látszik. Az alapértelmezést a `user-role.ts` `CURRENT_ROLE` konstansa adja — a flag egyszeri futtatásokhoz való. Érvénytelen érték rövid magyar hibaüzenettel bukik el, még az API-hívás előtt.

### Katalógus-kezelés — `ingest` (ÍR az adatbázisba)

```bash
pnpm cli ingest "Frissítsd a Kentia pálma készletét 9-re"
```

Az ingest-agent saját prompttal, saját toolkészlettel (`runSql` + `fetchFeed` + `upsertProduct`) és saját DB-jogosultsággal fut. Szándékosan **egylövetű**, nincs interaktív módja. A `DATABASE_URL_READWRITE` beállítása kell hozzá.

### `--show-prompt` és `--quiet`

Az `ask` parancshoz és az interaktív módhoz is hozzáadható. A `--show-prompt` a válasz kiírása előtt megjeleníti a modellnek ténylegesen elküldött teljes system promptot és üzenet-tömböt; a `--quiet` elnémítja az élő, színes Trace-t — a naplózás ettől függetlenül fut:

```bash
pnpm cli ask "szia" --show-prompt
pnpm cli --show-prompt          # interaktív mód, minden kérdésnél kiírja
pnpm cli ask "szia" --quiet     # csak a végső válasz
```

### Naplózás

Minden futás **két, egymástól független nyomot** hagy — egyik sem helyettesíti a másikat:

- `logs/<timestamp>.jsonl` — a gépi bizonyítékbázis: system prompt, üzenetek, a ténylegesen lefuttatott SQL, eredmény, válasz, token-felhasználás. A **megszakadt** futás is naplózódik (`[MEGSZAKADT] …`), az addig elköltött tokenekkel — enélkül egy elhasalt futás nyom nélkül égetne el tokent, és a költségbecslés alulmérne.
- `logs/<timestamp>.json` + `logs/agent.log` — az élő, színes Trace körökre bontott nyoma, illetve a folyamatos watch-log (`tail -f`-hez).

Egy **admin-delegálás két bejegyzést** ír ugyanabba a `.jsonl` fájlba, két soron: egyet a külső query-futásról, egyet a beágyazott ingest-futásról. Ez szándékos — az a futás valóban elköltött tokeneket.

### Embedding-szemléltető

```bash
pnpm embed:demo
```

14 mondat valódi embeddingje és a koszinusz-távolság-mátrixuk az `embed-demo.json`-be (gitignore-olt; semmilyen kód nem függ tőle). Ez teszi kézzelfoghatóvá, mit jelent a „jelentés-távolság": az angol szinonimapárok **0,21–0,23**-on állnak, a magyar–angol jelentéspárok **0,57–0,58**-on, a témában idegen bolti szöveg **0,88–0,91**-en. Vagyis a nyelv maga is erős jel a vektortérben — és pontosan ezt a szakadékot hidalja át a HyDE angol nyelvű hipotetikus válasza.

## Fejlesztés

```bash
pnpm nx test core          # packages/core (több spec valódi, seedelt DB-t hív)
pnpm nx test cli           # apps/cli
pnpm nx test server        # apps/server — se DB, se API-kulcs nem kell
pnpm nx test web           # apps/web — jsdom
pnpm nx run-many -t typecheck lint build   # amit a CI is futtat
```

> **Ismert flake, nem regresszió:** a `db-readonly.spec.ts` „row count is unchanged" állítása versenyzik az `upsert-product-db.spec.ts` valós beszúrásaival egy párhuzamos workerben. Ha egyedül ez a teszt bukik sorszám-eltérésen, futtasd újra, mielőtt nyomozni kezdesz.

## Debugolás VS Code-ban

A `.vscode/launch.json` hat indítási (launch) és egy csatlakozási (attach) konfigurációt tartalmaz. A négy `dist`-alapú CLI launch-config automatikusan lebuildeli a CLI-t (`development` konfigurációval, hogy a sourcemapek megmaradjanak) egy `preLaunchTask`-on keresztül, mielőtt elindítja; az ötödik (`tsx`) build nélkül, közvetlenül a TypeScript forrásból fut.

Nyisd meg a Run and Debug panelt (⇧⌘D), válaszd ki az egyiket, majd F5:

| Konfiguráció | Mit csinál |
|---|---|
| **Debug @szoba-kertesz/cli (interactive)** | argumentum nélkül indít — interaktív kérdés-válasz mód |
| **Debug @szoba-kertesz/cli (interactive --show-prompt)** | interaktív mód, minden válasz előtt kiírja a teljes promptot |
| **Debug @szoba-kertesz/cli (ask)** | felugró mezőben bekéri a kérdést, egyszeri `ask` lefutás |
| **Debug @szoba-kertesz/cli (ask --show-prompt)** | mint fent, plusz kiírja a promptot |
| **Debug from source (tsx, ask)** | build nélkül, `tsx`-szel futtatja az `apps/cli/src/main.ts`-t — a leggyorsabb kör |
| **Debug server with Nx** | az Express szervert indítja debuggerrel (`apps/server`) |
| **Attach to @szoba-kertesz/cli (terminal)** | lásd alább |

Bármelyiket választod, tehetsz breakpointot közvetlenül a TypeScript forrásban (`apps/cli/src/`, `packages/core/src/`) — a debugger a valódi `.ts` sorokon áll meg, nem a lebuildelt `.js`-ben.

A két út máshogy jut el ugyanoda, és ezt érdemes tudni, ha egy breakpoint mégsem kötne be:

- A **`dist`-alapú** configok a lebuildelt kódot futtatják. A `@szoba-kertesz/core` futásidőben a `packages/core/dist/index.js`-re oldódik fel (nem az `apps/cli/dist/` alá másolt példányra!), ezért az `outFiles`-nak tartalmaznia kell a `packages/*/dist/**` mintát is — enélkül a VS Code be sem olvassa a `core` sourcemapjeit, és a `packages/core/src/` breakpointjai szürkék maradnak.
- A **`tsx`** config a `--conditions=@szoba-kertesz/source` flaggel indul, ami a `packages/core/package.json` `@szoba-kertesz/source` export-conditionjét aktiválja, így a `core` is a `src/index.ts`-ből töltődik. A flag nélkül a `tsx` is a `dist`-et használná a `core`-hoz. Ugyanez a flag van a `pnpm cli` scriptben is.

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

## Multi-provider szereposztás

A rendszerben **három modell** dolgozik, és mindegyik azért az, amiért:

| modell | feladat | miért pont az |
|---|---|---|
| OpenAI `text-embedding-3-small` | szöveg → 1536 szám (a tudásbázis felépítése + **minden** keresés) | **Kényszer, nem választás:** az Anthropic nem ad embedding-modellt. Ez a projekt egyetlen nem-Anthropic hívása, és ezért opcionális az `OPENAI_API_KEY` — nélküle a katalógus-oldal teljesen működik, csak a `searchKnowledge` bukik el érthető magyar üzenettel. |
| Claude Haiku 4.5 | **HyDE** (hipotetikus válasz a kereséshez) + **rerank** (a top-20 átrangsorolása) | Sok hívás, sablonos feladat, alacsony minőségi plafon: egy 2-3 mondatos angol bekezdés kitalálása és 20 részlet 0-10-es pontozása nem igényel nagy modellt. A rerank `generateObject`-tel megy, tehát a kimenet szerkezete garantált — nem kell parse-olni, amit a modell írt. |
| Claude Sonnet 4.6 (`ANTHROPIC_MODEL`) | a **végső válasz** | Itt a megfogalmazás, a magyar nyelv, a tool-használat sorrendje és a grounding-fegyelem számít — hogy a modell kimondja, ha nincs információja, ahelyett hogy forrást találna ki. |

A tanulság egy mondatban: **a drága modell válaszol, az olcsó válogat.**

## Költségbecslés

> **Amit mértünk, és amit becsülünk.** A válasz-oldal tokenszámai **valódi naplósorok** (`logs/*.jsonl`, `usage` mező). A HyDE, a rerank és az embedding hívásai viszont a `retrieve.ts`-en belül futnak, **nem az agent-loopban** — az `onStepEnd` nem látja őket, tehát a JSONL sem tartalmazza. Ezekre a **mért karakterszámokból** adunk becslést (4 karakter ≈ 1 token). Árak: [Anthropic](https://www.anthropic.com/pricing) $1/$5 (Haiku 4.5) és $3/$15 (Sonnet 4.6) / 1M token, [OpenAI](https://developers.openai.com/api/docs/pricing) $0,02 / 1M token.

### A tudásbázis felépítése (`pnpm knowledge:ingest`)

| tétel | mért érték |
|---|---|
| dokumentum | 202 |
| chunk | 1906, átlag 576 karakter |
| embeddelt szöveg | ~1,10 millió karakter ≈ **274 000 token** |
| API-hívás | 20 (100-as kötegek) |
| **költség** | **~0,55 cent** (274 000 / 1M × $0,02) |

Egy teljes újraépítés tehát **nagyjából fél cent** — ezért helyes döntés ma a `TRUNCATE` + újratöltés az inkrementális frissítés helyett ([`docs/ARCHITEKTURA.md`](docs/ARCHITEKTURA.md)).

### Egy kérdés ára

Egy **gondozási** kérdés (a tudásbázist is használja) négy hívásból áll:

| lépés | modell | input | output | költség |
|---|---|---|---|---|
| HyDE | Haiku 4.5 | ~75 token (prompt + kérdés) | ≤200 token (`HYDE_MAX_TOKENS`) | ~0,11 cent |
| embedding | `text-embedding-3-small` | ~200 token | — | ~0,0004 cent |
| rerank | Haiku 4.5 | ~3100 token (20 × 600 karakter előnézet) | ~250 token | ~0,44 cent |
| **válasz** | **Sonnet 4.6** | **8702 token** (mért) | **287 token** (mért) | **~3,0 cent** |
| | | | **összesen** | **~3,6 cent** |

Egy **katalógus**-kérdés (csak SQL, tudásbázis nélkül) ennél olcsóbb: mérve 3849 / 235 token, azaz **~1,5 cent**.

Három dolog látszik ebből:

1. **A válaszmodell viszi a költség ~85%-át.** A RAG-pipeline három hívása együtt sem éri el a fele árát.
2. **A RAG ára maga a kontextus:** a kereséssel dolgozó kérdés inputja 3849 → 8702 token, mert az öt darab bekerül a promptba. A modellváltás olcsóbb modellre itt sokkal többet spórolna, mint a pipeline bármelyik lépésének elhagyása.
3. **Az embedding gyakorlatilag ingyen van** — a teljes tudásbázis felépítése annyiba kerül, mint egy hatod válasz.

## Dokumentáció

- [`docs/brs-szoba-kertesz.md`](docs/brs-szoba-kertesz.md) — üzleti/funkcionális követelmények
- [`docs/architektura-monorepo.md`](docs/architektura-monorepo.md) — a tervezett fájlstruktúra és kulcsdöntések
- [`docs/tech-stack.md`](docs/tech-stack.md) — technológiai stack és a `products` tábla sémája
- [`docs/system-prompt.md`](docs/system-prompt.md) — az agent tényleges system promptja
- [`docs/system-prompt-javitas.md`](docs/system-prompt-javitas.md) — a system prompt minőségi javításainak indoklása
- [`docs/pluginok-skillek.md`](docs/pluginok-skillek.md) — a használt Claude Code pluginek / skillek / MCP-szerverek és indoklásuk
- [`docs/konvenciók.md`](docs/konvenciók.md) — kódolási konvenciók
- [`docs/dev-workflow.md`](docs/dev-workflow.md) — git workflow, branch- és commit-konvenciók
- [`docs/implementacios-terv.md`](docs/implementacios-terv.md) — a teljes fázisterv (A1–A6, B1–B3)
- [`docs/roi.md`](docs/roi.md) — ROI-levezetés (5 fős lakberendező iroda megtakarítása számokkal)
- [`docs/hf3-leadas.md`](docs/hf3-leadas.md) — a HF3 hat leadandójának végigvezetése: mit kért a kiírás, hol teljesül
- [`docs/ARCHITEKTURA.md`](docs/ARCHITEKTURA.md) — a tudásbázis karbantartásának terve + adatfolyam-ábra
- [`docs/chunking-strategia.md`](docs/chunking-strategia.md) — mit mértünk a korpuszon, és mi következett belőle
- [`docs/golden-set.md`](docs/golden-set.md) — a golden set elemzése: nyers vektorkeresés vs. teljes pipeline, negatív teszt

## Git workflow

Feature branch-ek `feat/<rövid-leírás>` néven (`fix/`, `refactor/`, `docs/`, `chore/` prefixek is használatosak), Conventional Commits, egy `master`-be mergelt lépés = egy fókuszált commit. Részletek: [`docs/dev-workflow.md`](docs/dev-workflow.md).
