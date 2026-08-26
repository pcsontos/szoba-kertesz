# 09. alkalom — ki felel, ha az agent hibázik: MCP-szerver (stdio) — design

> Forrás: a kurzus 09. alkalmának kódvezetése (*Ki felel, ha az agent hibázik?*).
> A referencia-repó ehhez tartozó kódja a **`feat/mcp-server`** branchen él, nincs mergelve;
> a végállapot commitja `sajtosistvan/ai-agent-kurzus@0420d96`.
> A lecke három szállítási formájából **egyet** viszünk át: a stdio transportot.

## Mit rögzít ez a doksi

Mit építünk a 09. alkalomból, **mit nem**, és minden döntésnél azt is, mit vetettünk el és
miért. A végrehajtási terv ebből készül; a döntéseket ott már nem kell újra kitalálni.

Egy mondatban: **a negyedik belépési pontot** építjük a `packages/core` fölé — olyat, ahol
nem mi hívjuk a modellt, hanem egy **idegen host** (Claude Code / Claude Desktop) modellje
hívja a mi tooljainkat.

És egy mondatban a lecke címére adott válasz, mert ez a kör tétje: **a felelősségi határ a
felületnél húzódik, nem a promptnál.** Az MCP-felület fixen `customer` szerepen fut, tehát
egy idegen host modellje nem tud a katalógusunkba írni — nem azért, mert megtiltottuk neki,
hanem mert nincs rá tool.

## Kiindulási állapot — mérve, nem feltételezve

Minden alábbi állítás a repóból, a futó Postgresből, az npm registry-ből vagy a
referencia-repóból származik, 2026-08-26-án.

### A repó

- A `master` a `66d5835` merge-commiton áll (a #10 PR), a munkafa **tiszta**. A munka a
  `feat/ora-09-mcp` branchen megy, a masterről ágaztatva.
- **`apps/mcp` nem létezik**; az `apps/` alatt `cli`, `server`, `web` van.
- **`docs/mcp.md` nem létezik.**
- `@modelcontextprotocol/sdk` **sehol nincs** a repóban.
- A `.mcp.json` **gitignore-olt** (`.gitignore:3`), és jelenleg a Prisma MCP-szervert
  tartalmazza. A `CLAUDE.md` kimondja: „`.env`, `.env.bak`, and `.mcp.json` are gitignored —
  never commit them."
- Az Nx-projektek a `pnpm-workspace.yaml`-ból jönnek: `packages/*`, `apps/*`, `tools/*` —
  az `apps/mcp` tehát automatikusan projekt lesz.
- A `vitest.workspace.ts` a `**/vite.config.*` és `**/vitest.config.*` globokra épül; az
  `apps/server` mintája `vitest.config.mts`.
- A gyökér `tsconfig.json` `references` tömbjét **kézzel kell bővíteni** (`./apps/mcp`) —
  a 08. körben ez pont kimaradt a tervből, és a csomag kimaradt a solution-buildből.
- A `tsconfig.base.json`-ban **nincs `paths`**: a csomagok közti feloldás a pnpm-workspace-en
  és a `package.json` `exports`-on át megy. Ezért **kötelező** a `--conditions=@szoba-kertesz/source`
  minden `tsx`-futtatásnál, különben a `@szoba-kertesz/core` a `dist`-ből oldódna fel.
- A CI (`.github/workflows/ci.yml`) `lint typecheck build` + **célzottan** `pnpm nx test autotest`.
  A teljes `test` szándékosan kimarad (DB-s `core`-specek).
- Node **v25.2.1**, pnpm **11.12.0**.

### A core felülete, amit használni fogunk — mérve

| Amit hívunk | Honnan | Állapot |
|---|---|---|
| `queryReadonly(sql, values, deps)` | `tools/run-sql/db-readonly.ts` | **paraméterezhető**, valódi overloadokkal |
| `guardSql(sql)` → `SqlGuardResult` | `tools/run-sql/sql-guard.ts` | tiltólista + kötelező külső `LIMIT 50` |
| `executeSearchKnowledge(input, opts)` | `tools/search-knowledge/search-knowledge-tool.ts` | **soha nem dob**, `ToolOutcome`-ot ad |
| `askAgent(q, { role, print })` | `agents/query-agent/query-agent.ts` | `AskResult`-ot ad |
| `CATEGORY` / `LOCATION` / `LIGHT` / `WATERING` / `DIFFICULTY` | `tools/upsert-product/product-schema.ts` | exportált `as const` tömbök |
| `loadConfig()` | `config.ts` | sima `Error`, magyar üzenettel |
| `setQuiet(v)` / `setWatchLog(p)` / `traceLog(t)` | `trace.ts` | modul-szintű |
| `closeReadonlyPool()` | `tools/run-sql/db-readonly.ts` | — |

Mind exportált a `packages/core/src/index.ts`-ből.

### A kurzus kódja NEM illeszkedik egy az egyben — a névtábla

A kódvezetés azt írja, hogy a `packages/core`-ból „mindössze 13 sor" változik
(`runReadOnlyQuery` opcionális `params`). **Nálunk ez a változtatás már megtörtént**: a
`queryReadonly` a 07. körben kapott paraméterezett hívási alakot a `queryCustomers` miatt,
a #8 PR-review 8. tétele nyomán valódi TypeScript-overloadokkal. **Ez a kör tehát nulla soros
core-diffel megvalósítható.**

A másolható kód viszont hat ponton nem illeszkedik, és ezt a tervnek át kell hidalnia:

| Kurzus | Nálunk | Következmény |
|---|---|---|
| `ensureReadOnlySelect(sql)` — dob | `guardSql(sql)` → `{allowed:true,sql}` \| `{allowed:false,reason}` | unió-kezelés kell, nem `try/catch` |
| `runReadOnlyQuery` → `{columns, rows, rowCount}` | `queryReadonly` → pg `QueryResult` | a `rows`/`rowCount` közvetlenül jön, `columns` nincs |
| `ConfigError` osztály | sima `Error` | a boot `instanceof ConfigError` ága elmarad |
| `closePrisma()` | **nincs** (a core sosem importál Prismát) | csak `closeReadonlyPool()` a leállításban |
| `AskResult.tracePath` | **nincs** | az `ask` tool nem hivatkozhat nyom-útvonalra |
| `@plantbase/*`, `plantbase` szerver-név | `@szoba-kertesz/*`, `szoba-kertesz` | átnevezés mindenütt |

### Két stdout-író a core-ban — ez a stdio-transport élet-halál kérdése

stdio-n a **stdout a protokoll csatornája**. Mérve, hogy nálunk két helyről ír oda a core:

1. `Trace.line()` (`trace.ts:148`) — a példány `print` flagje kapcsolja. Az
   `askAgent(…, { print: false })` ezt elnémítja.
2. `traceLog()` (`trace.ts:70`) — a **modul-szintű** `quiet` kapcsolja, ami alapból `false`,
   és **csak** a `runAgentLoop` állítja (`setQuiet(!print)`). A `retrieve.ts:109` ezt hívja.

**A második a veszélyes:** a `search_knowledge` tool közvetlenül az `executeSearchKnowledge`-et
hívja, agent-loop nélkül — tehát a `setQuiet` soha nem futna le, és a RAG nyoma a **protokollba**
ömlene. A kurzus ezt a `captureStdout()`-tal oldja meg; nálunk **mindkét** védelem kell
(lásd 8. döntés).

### Az MCP SDK

- `@modelcontextprotocol/sdk` legfrissebb: **1.30.0** — pontosan az, amit a kurzus használ
  (`^1.30.0`), tehát **nincs verzió-elsodródás**, szemben a 06. körrel, ahol a kurzus AI SDK 6-ra
  írt kódot a mi `ai@7.0.66`-unkhoz kellett igazítani.
- A `zod` peer-tartománya `^3.25 || ^4.0` — a repó `zod@^4.4.3`-ja **támogatott**.
- `engines: node >=18` — a mi Node 25-ünk bőven megfelel.
- `@modelcontextprotocol/inspector` legfrissebb: 2.4.0 (a kurzus 2.0.0-t pinnel).

### Az adatbázis — a `search_plants` élő ellenőrzésének ground truth-jai

A `szoba-kertesz-adatbazis` konténer **fut** (healthy). A `products` táblán közvetlenül mérve:

| Mit | Érték |
|---|---|
| termék összesen | **30** |
| `pet_safe = true` | **15** |
| `air_purifying = true` | **14** |
| `max_height_cm <= 100` | **16** |
| `location = 'beltéri'` | **20** |
| `location = 'mindkettő'` | **6** |
| `location = 'kültéri'` | **4** |
| legolcsóbb effektív ár | **Bazsalikom, 990 Ft** |

Ezek a **sikerkritériumok** számai — nem másolt értékek, hanem mérésből. A termék-id-kre
**sosem** építünk (a 08. körben eltolódtak: 720–749 → 936–965).

### Költség

| Mi | Költség |
|---|---|
| minden unit-teszt (`nx test mcp`) | **0 Ft** — se DB, se kulcs, se böngésző |
| `pnpm mcp:smoke` | **0 Ft** — modellt nem hív, csak a DB-t |
| `search_plants` hívás (bárhány) | **0 Ft** — nincs benne modell |
| `search_knowledge` hívás | embedding + HyDE + rerank ≈ pár cent |
| `ask_szobakertesz` hívás | teljes agent-loop ≈ 3–8 cent |
| **a teljes kör élő ellenőrzése** | **becslés: < $0,25** |

## Döntések

| # | Döntés | Elvetett alternatíva | Miért |
|---|---|---|---|
| 1 | Scope: **csak a stdio transport** | MCPB-csomag; streamable HTTP + Railway; mind a három | a lecke minden ELVE benne van a stdio-ban (agent-as-tool vs. adat-tool, a fix szerep, a stdout-védelem), és lokálisan végig ellenőrizhető. A HTTP/Railway **első deployt** jelentene a projektben (a D fázis eddig szándékosan kimaradt), külön Postgres-hosztolással és egy valódi, publikus, tokenes támadási felülettel; az MCPB pedig nem ad új elvet, csak egy második telepítési utat, és a launchere úgyis a repót feltételezi a gépen |
| 2 | A kód **`apps/mcp`-ben** él | `tools/mcp`; `apps/cli` alá; `.claude/` alá | ez **szállított termék-felület** (a negyedik belépési pont), nem mérőeszköz — a `tools/autotest` pont azért van külön, mert az mérőeszköz. Az `apps/` alatt kapja meg a lintet, a typechecket és a solution-buildet |
| 3 | A szerver-összeállítás **külön fájlban** (`szoba-kertesz-server.ts`), a transporttól elválasztva | minden a `main.ts`-ben, mivel csak egy transport van | így a szerver **kulcs és DB nélkül tesztelhető**: fel lehet építeni és megszámolni, hogy pontosan három tool regisztrálódik. A HTTP-ajtó nyitva marad, de az indok a tesztelhetőség, nem egy transport, amit nem építünk |
| 4 | Az enumok **importálva** a core `product-schema.ts`-éből | a kurzus mintája: `as const` másolat az `plant-search-sql.ts`-ben | a másolat elsodródik. A `product-schema.ts` fejlécében külön figyelmeztetés áll, hogy az enumok forrása a `docs/system-prompt.md` `<schema>` blokkja — egy harmadik másolat pont ezt a láncot törné el. Ha egy kötött szótár bővül, az MCP-felület **automatikusan** követi |
| 5 | `search_plants`: **teljes szűrő-felület** (16 mező) | a kurzus 11 szűrője; csak a 11 + a három enum | a `location`, `watering`, `air_purifying` egyszerű enum/bool — a katalógus MINDEN besoroló oszlopa elérhető lesz a hívó modellnek. A `maxMagassagCm` / `maxCserepCm` pedig pont a BRS fő használati esete (szoba-illesztés): a determinisztikus tool tudja azt is, amit a promptunk fő feladatnak nevez |
| 6 | A saját, generált SQL is **átmegy a `guardSql`-en** | közvetlenül `queryReadonly`-ra adni, hiszen mi írtuk | ugyanaz a szabály minden úton, ami a DB-hez ér („öv és nadrágtartó", a kurzus is így teszi). **DE**: a mi guardunk tiltólistás (`into`, `do`, `lock`, `comment`, …), tehát **fals pozitívot tud adni** a saját SQL-ünkre — ezért az összes szűrő-kombináció guardon való átmenetét **teszt pinneli**, nem feltételezés |
| 7 | `ask_szobakertesz`: fixen `role: 'customer'` **és** `print: false`, **injektálható** `ask`-kal | a kurzus mintája: `askAgent` közvetlen hívása, teszt nélkül | ez a kör legfontosabb biztonsági állítása — adminként a query-agent megkapná a `delegateToIngest`-et, és egy idegen host modellje **írhatna a katalógusba**. Amit nem mérünk, az nem garancia: az injektált `ask` teszt-szeam kulcs és DB nélkül pinneli mindkét értéket (ugyanaz a minta, mint a `delegateToIngest` `run` opciója) |
| 8 | **Kettős** stdout-védelem: `captureStdout()` **és** `setQuiet(true)` a bootban | csak a kurzus `captureStdout()`-ja; csak `setQuiet(true)` | a `setQuiet` önmagában kevés: bármelyik függőség `console.log`-ja a protokollba menne. A `captureStdout` önmagában elég lenne, de a stderr így megtelne a RAG-nyommal minden hívásnál — a `setQuiet` ezt a zajt is elveszi, és a nyom a watch-logban **így is megmarad** |
| 9 | **`.mcp.example.json`** commitolva; a valódi `.mcp.json` gitignore-olt marad | a kurzus mintája: `.mcp.json` commitolása (a `.gitignore` és a `CLAUDE.md` szabályának átírásával); csak doksiban leírni a blokkot | a projekt kimondott szabálya, hogy a `.mcp.json` nem kerül a gitbe, és ez a fájl valóban tud titkot hordozni (`env` blokk). A `.env.example` mintája már létező idióma a repóban: a bekötés másolható, a szabály érintetlen |
| 10 | `pnpm nx test mcp` **bekerül a CI-be**, külön lépésként | semmit nem tenni a CI-be; a teljes `test` target felnyitása | a 08. kör precedense: a tiszta specek (se DB, se kulcs, se böngésző) mennek CI-be. Itt ez különösen olcsó és különösen fontos: a guard-fals-pozitív teszt **némán törő** toolt fog meg, a szerep-pinnelő teszt pedig egy biztonsági garanciát véd. A `run-many -t test` továbbra sem jó: az behúzná a `core` DB-s specjeit |
| 11 | A `packages/core` **egy sort sem** változik | a kurzus 13 soros `db-readonly.ts` módosítása; `tracePath` felvétele az `AskResult`-ba | a paraméterezés már megvan (07. kör). A `tracePath` hiánya nem érdemel core-változtatást egy kényelmi mezőért: a nyom a `logs/agent.log`-ban és a `logs/<ts>.json`-ban ott van. Ez ugyanaz az invariáns, amit a 08. kör üres core-diffel igazolt |
| 12 | Az MCP-n **nem** ajánljuk ki: `queryCustomers`, `upsertProduct`, `delegateToIngest`, `threads`/`messages` | a `queryCustomers` kiajánlása (a query-agentnek úgyis megvan) | a `queryCustomers` valódi ügyféladat (20 seedelt ügyfél nevekkel, preferenciákkal) — azt idegen hostnak kiadni nem tanulság, hanem hiba. Az írási toolok kiajánlása pedig pont a 7. döntést mondaná fölül |
| 13 | Az MCP-hívások **nem perzisztálnak**: nincs thread, nincs `messages`-sor | minden `ask_szobakertesz`-hívás nyisson threadet, mint a `/api/chat` | az MCP-hívás egylövetű, mint a `pnpm cli ask` — a hívó host tartja a beszélgetést, nem mi. Perzisztálva a thread-lista pár nap alatt használhatatlanná válna (ezt a 08. körben már megmértük a battery-nél), és egy ötödik DB-szerep-kérdést nyitna |
| 14 | A kurzus **`smoke.ts`-e átvéve** | csak az inspector; semmilyen ellenőrzés | ingyenes (modellt nem hív), és két dolgot ad: bemelegíti a `tsx`-fordítást a demó előtt, és kiderül tőle, ha a DB áll vagy egy tool-séma elcsúszott — nem a közönség előtt |
| 15 | **Nem** írunk ADR-t ehhez a körhöz; a döntések ez a táblázat | ADR minden döntésről | a `CLAUDE.md` konvenciója: „egy ADR = egy döntési **alkalom**", a köröken ÁTÍVELŐ, ismétlődő döntéseké — a fejlesztési kör szintű döntések a specek „Döntések" táblájában maradnak. Az `autotest` skill 5. lépése ettől függetlenül továbbra is ír egyet minden mérési kör után |
| 16 | A `hely` szűrő **befogadó**: `beltéri` → `location IN ('beltéri','mindkettő')`, `kültéri` → `location IN ('kültéri','mindkettő')`, `mindkettő` → pontos egyezés | pontos oszlop-egyezés minden értékre (amit a `runSql` és a system prompt tesz) | mérve: `beltéri` 20 · `mindkettő` 6 · `kültéri` 4. Pontos egyezéssel egy „milyen kültéri növényt tartotok?" kérdésre a hívó modell **10 alkalmas növényből 4-et** kapna, és nem tudhatná, hogy hiányzik hat — a `mindkettő` a doménben azt jelenti, hogy MINDKÉT helyre jó. A `runSql`-nél ez nem probléma, mert ott a system prompt tanítja a modellt a szótárra; itt a hívó modell **nem ismeri a sémánkat**, tehát a toolnak kell helyesen viselkednie. A viselkedés a tool leírásában ki van mondva, és teszt pinneli |

## Szerkezet

```
apps/mcp/                             ÚJ Nx-projekt (a pnpm-workspace 'apps/*' globja fedi)
  package.json                        @szoba-kertesz/mcp, private, type: module
                                      + "nx": { "name": "mcp" }
  tsconfig.json / tsconfig.app.json / tsconfig.spec.json
  eslint.config.mjs
  vitest.config.mts                   hogy a vitest-workspace glob megtalálja
  src/
    main.ts                           STDIO belépési pont — csak a transport-specifikus dolgok:
                                        .env betöltés · fail-fast loadConfig · captureStdout()
                                        · setQuiet(true) · setWatchLog · connect · shutdown
    szoba-kertesz-server.ts           A SZERVER, TRANSPORT NÉLKÜL:
                                        buildSzobaKerteszServer() + TOOL_NAMES + instructions
    szoba-kertesz-server.spec.ts      pontosan 3 tool, nevek pinnelve (kulcs és DB nélkül)
    smoke.ts                          DEV-eszköz: valódi MCP-kliens, listTools + 1 ingyenes hívás
    tools/
      search-plants/
        plant-search-sql.ts           TISZTA fv.: szűrők → { sql, params }. Se modell, se DB.
        plant-search-sql.spec.ts      determinisztikus SQL + guard-átmenet + whitelist
        search-plants-tool.ts         MCP-regisztráció: guardSql → queryReadonly(sql, params)
      search-knowledge/
        search-knowledge-tool.ts      adapter az executeSearchKnowledge-re (~50 sor)
      ask-szobakertesz/
        ask-szobakertesz-tool.ts      askAgent, fixen role:'customer' + print:false
        ask-szobakertesz-tool.spec.ts a szerepet és a print-et PINNELI, injektált ask-kal

.mcp.example.json                     ÚJ, commitolva — a bekötés másolható mintája
docs/mcp.md                           ÚJ — mit ad, hogyan kötöd be, melyik tool fizetős
tsconfig.json                         + { "path": "./apps/mcp" } a references tömbbe
package.json                          + mcp / mcp:smoke / mcp:inspect scriptek
.github/workflows/ci.yml              + `pnpm nx test mcp` lépés
```

## A három tool — három stílus

| Tool | Stílus | Ki gondolkodik | Modellt hív? |
|---|---|---|---|
| `search_plants` | **adat-tool**: strukturált szűrő → paraméterezett SELECT → nyers sorok | a **hívó** modell | nem |
| `search_knowledge` | **átkötött core-tool**: a meglévő RAG-tool új felületen, logika-változtatás nélkül | — | igen (embedding + HyDE + rerank) |
| `ask_szobakertesz` | **agent-as-tool**: a mi query-agentünk teljes loopja | a **mi** agentünk | igen (teljes loop) |

Ez a három sor a kör tananyaga: ugyanaz a tudásbázis háromféle absztrakciós szinten ajánlható ki,
és a választás nem stílus kérdése, hanem azé, hogy **hol legyen a domén-tudás**.

### `search_plants` — a determinisztikus adat-tool

Bemenet (Zod, mind opcionális): `keres` · `kategoria` · `hely` · `feny` · `ontozes` ·
`nehezseg` · `minAr` · `maxAr` · `petSafe` · `kidSafe` · `legtisztito` · `csakRaktaron` ·
`maxMagassagCm` · `maxCserepCm` · `rendezes` · `limit`.

- Az **értékek soha nem kerülnek az SQL szövegébe** — minden szűrő `$n` placeholder, az értékek
  külön tömbben mennek a `pg`-nek.
- Az **oszlop- és iránynevek nem jöhetnek a hívótól**: a `rendezes` egy KULCS
  (`ár` · `-ár` · `értékelés` · `készlet` · `név`), az oszlopnevet fix `SORT_COLUMNS`
  whitelist adja. Placeholder itt nem használható, ezért kell whitelist.
- Az enumok (`kategoria`, `hely`, `feny`, `ontozes`, `nehezseg`) a core
  `product-schema.ts`-éből jönnek — ami nincs a listán, azt a Zod eldobja.
- `limit`: 1–50, alapértelmezés 10. A core `guardSql` külső `LIMIT 50`-je ezt felülről
  amúgy is lezárja.
- A hatékony ár mindenhol `COALESCE(sale_price, price)` — a `minAr`/`maxAr` és az ár szerinti
  rendezés is ezzel számol.
- A **`hely` befogadó** (16. döntés): `beltéri`/`kültéri` a `mindkettő`-t is behozza.
- **Oszlop-leképezés, hogy ne legyen kétértelmű:** `maxMagassagCm` → `max_height_cm` (a
  KIFEJLETT méret — a szoba-illesztés erre kérdez, nem a mostanira), `maxCserepCm` →
  `current_pot_cm`. A `keres` a `name`, `latin_name` és `description` oszlopokon megy ILIKE-kal.

A `buildPlantSearchSql(filters) → { sql, params }` **tiszta függvény**: ugyanaz a bemenet mindig
ugyanazt az SQL-t adja. Ez a lecke egyik fő tanulsága a `runSql`-hez képest — a `runSql` a
**modell által generált** SQL-t futtatja guarddal védve; itt a modell nem ír SQL-t, csak
strukturált szűrőt ad. Két különböző kockázati profil, két különböző eszköz.

### `search_knowledge` — az átkötött core-tool

Az `executeSearchKnowledge(input)` `ToolOutcome`-ot ad és **soha nem dob**; az adapter dolga
csak az alak fordítása MCP-re (`content` tömb + `isError`). Ugyanaz a validáció, ugyanaz a
magyar hibaszöveg, ugyanaz a RAG-pipeline (HyDE → embedding → pgvector top-20 → rerank → top-5),
akár az agent hívja, akár egy idegen host. **A tanulság:** ha a tool logikája nem tapad az
SDK-hoz, egy új felület pár sor.

### `ask_szobakertesz` — az agent-as-tool

```
Claude (a hívó)  →  MCP tool: ask_szobakertesz  →  a mi query-agentünk
                                                     ├── runSql          (katalógus)
                                                     ├── searchKnowledge (RAG tudásbázis)
                                                     ├── listCategories
                                                     └── queryCustomers
```

A hívónak ez egy sima tool-hívás; mögötte a **teljes** loopunk fut, saját system prompttal,
saját toolkészlettel, több körben. Cserébe lassabb, és a hívó nem lát bele a lépésekbe —
**a nyom nálunk marad** (`logs/agent.log`, `logs/<ts>.json`).

**Fixen `role: 'customer'`** — lásd 7. döntés. **Fixen `print: false`** — enélkül a színes Trace
a stdout-ra menne és szétverné a JSON-RPC folyamot. Mindkettőt teszt pinneli.

A válasz két `text` részből áll: a válasz maga, plusz egy rövid összegző sor a token-fogyással
(`tracePath`-unk nincs — lásd a névtáblát).

## A stdout-védelem

```
main.ts indul
  ├─ protocolOut = captureStdout()      az EREDETI stdout-ot félretesszük a protokollnak,
  │                                     a process.stdout.write-ot a stderr-re irányítjuk
  ├─ setQuiet(true)                     a modul-szintű traceLog elnémítása (RAG-nyom)
  ├─ setWatchLog(logs/agent.log)        a nyom NEM vész el: a watch-logba megy
  └─ server.connect(new StdioServerTransport(process.stdin, protocolOut))
```

A `setQuiet(true)` a zajt veszi el, a `captureStdout()` a **garanciát** adja: bármelyik
függőség `console.log`-ja is a stderr-re megy, ahol a host naplózza. A kettő nem redundáns —
más hibaosztályt fog meg.

## Bekötés és futtatás

Új gyökér-scriptek:

| Script | Mit csinál | Költség |
|---|---|---|
| `pnpm mcp` | a szerver stdio-n, `tsx --conditions=@szoba-kertesz/source` | — |
| `pnpm mcp:smoke` | valódi MCP-klienssel felhozza, listázza a toolokat, egy `search_plants` hívás | 0 Ft |
| `pnpm mcp:inspect` | `@modelcontextprotocol/inspector`, portok **6280/6281** (ütközés-elkerülés) | 0 Ft |

A `.mcp.example.json` a bekötés mintája; a valódi `.mcp.json`-be a `szoba-kertesz` bejegyzés
a Prisma mellé kerül, **lokálisan** (a fájl gitignore-olt marad).

A `docs/mcp.md` tartalma: mit ad a szerver, a három tool és mikor melyiket hívja a host,
**melyik fizetős**, a Claude Code bekötés (projekt-scope, `pnpm mcp`), a Claude Desktop bekötés
(**abszolút utakkal**, mert MCPB-csomag nincs a scope-ban), és a buktatók — köztük a kurzus
`d3bcc10` tanulsága: a Desktop-config a `tsx`-et / `dist/cli.mjs`-t hívja közvetlenül, **nem a
`.bin` shimet**, mert az más környezetben indul, és a szerver némán nem jön fel.

## Hibakezelés

- **Boot**: `loadConfig()` fail-fast → a magyar üzenet a **stderr**-re, `exit(1)`. A hiányzó
  kulcs így a host hibaüzenetében is látszik, nem az első hívásnál derül ki.
- **Tool-hiba SOHA nem dob**: minden tool `{ isError: true, content: [...] }`-t ad vissza
  magyar üzenettel — ugyanaz az elv, mint a core `ToolOutcome`-jában. A hívó modell így tud
  vele mit kezdeni; egy dobott hiba a JSON-RPC szinten értelmezhetetlen lenne neki.
- **Hiányzó `OPENAI_API_KEY`**: a `search_knowledge` a meglévő magyar üzenettel hibázik el
  (`embed.ts`), a `search_plants` és az `ask_szobakertesz` katalógus-ága **változatlanul megy**.
- **Leállás**: `SIGTERM`/`SIGINT` → `closeReadonlyPool()`, majd `exit(0)`.
- **A `guardSql` elutasítása** (elvben lehetetlen, mert mi írjuk az SQL-t) a `reason`-nel
  `isError`-ként megy vissza — nem némán üres eredményként.

## Tesztelés és CI

Mind a három spec **tiszta**: se DB, se API-kulcs, se böngésző.

**`plant-search-sql.spec.ts`**
- ugyanaz a bemenet → ugyanaz az SQL és ugyanaz a `params` (determinizmus)
- minden szűrő értéke a `params` tömbben van, és **egyetlen** szűrő-érték sem jelenik meg
  az SQL szövegében
- a `rendezes` kulcsból a whitelist oszlopa lesz; ismeretlen kulcsot a Zod dob el
- a `limit` felső korlátja 50; hiányzó `limit` → 10
- enum-elutasítás (pl. `kategoria: 'bonszaj'`)
- a `hely` **befogadó**: `kültéri` → a feltétel a `mindkettő`-t is engedi, `mindkettő` → nem
  (16. döntés)
- **minden szűrő egyszerre bekapcsolva átmegy a `guardSql`-en** (`allowed: true`) — ez a
  6. döntés fals-pozitív kockázatát pinneli, és egy **némán** törő toolt fog meg

**`szoba-kertesz-server.spec.ts`**
- a felépített szerver pontosan **három** toolt regisztrál, a nevek pinnelve
- a `TOOL_NAMES` és a ténylegesen regisztrált nevek megegyeznek

**`ask-szobakertesz-tool.spec.ts`** (injektált `ask` teszt-szeammel)
- a hívás `role: 'customer'`-rel megy — **soha** `admin`-nal
- a hívás `print: false`-szal megy
- a dobott hiba `isError: true`-vá alakul, nem repül ki

**CI**: új lépés a `pnpm nx test autotest` mellé: `pnpm nx test mcp`.

## Amit szándékosan NEM csinálunk

- **MCPB-csomag** (`manifest.json` + `launcher.js`) — a Desktop GUI-jából telepíthető
  Extension. Nem ad új elvet, és a launcher úgyis a repót feltételezi a gépen.
- **Streamable HTTP transport + Railway deploy** — első deploy a projektben, külön
  Postgres-hosztolással, valódi publikus támadási felülettel (a capability-URL nem OAuth:
  aki látja a linket, hívhatja, és minden hívás a mi API-kulcsunkat költi).
- **MCP `resources` és `prompts`** — a lecke sem használja őket; a három tool a tananyag.
- **Bármilyen írási tool az MCP-n** — ez a kör tétele, lásd 7. és 12. döntés.
- **Perzisztencia** az MCP-hívásokra (13. döntés).
- **A `packages/core` bármilyen módosítása** (11. döntés).
- **Fizetős futás a CI-ben** — ugyanaz az érv, mint a 08. körben.

## Sikerkritériumok — megfigyelhető viselkedés

Egyik sem „a fájl tartalmazza X-et": mind azt írja le, mi **történik**.

1. `pnpm nx run-many -t lint typecheck build` **és** `pnpm nx test mcp` zöld.
2. `pnpm mcp:smoke` futó DB mellett kiírja a **három** tool nevét, és **0** kilépési kóddal áll le.
   Leállított DB mellett **nem-nulla** kóddal bukik, érthető magyar üzenettel — a nem futott
   ellenőrzés ne látsszon sikeresnek.
3. Claude Code-ban a `/mcp` listázza a `szoba-kertesz` szervert, és alatta a három toolt.
4. `search_plants` a mért ground truth-t adja vissza (2026-08-26), mindenütt `limit: 50`-nel:
   `{ petSafe: true }` → **15 sor** · `{ legtisztito: true }` → **14 sor** ·
   `{ maxMagassagCm: 100 }` → **16 sor** · `{ hely: 'kültéri' }` → **10 sor** (4 kültéri + 6
   mindkettő, a 16. döntés szerint) · `{ hely: 'mindkettő' }` → **6 sor**.
5. `search_plants` `{ rendezes: 'ár', limit: 5 }` → az öt sor **növekvő** effektív ár szerint jön,
   és a legolcsóbb a **Bazsalikom** (990 Ft).
6. `ask_szobakertesz` egy gondozási kérdésre **magyar** választ ad forrás-hivatkozással, és
   közben a `logs/agent.log`-ba lefut a Trace — a hívás mégis **sikeres**, azaz a protokoll
   nem sérült.
7. `search_knowledge` egy gondozási kérdésre forrás-URL-es találatokat ad, és **utána a szerver
   további hívásokat is kiszolgál** — ez az, ami a `setQuiet`/`captureStdout` nélkül eltörne.
8. Katalógus-módosítást kérve a hoston: **nincs rá tool**. A `TOOL_NAMES` három elemű, és az
   `ask` szerepe teszttel pinnelve `customer`.
9. `git diff master -- packages/core` **üres**.
10. A `.mcp.json` **nem** jelenik meg a `git status`-ban (gitignore-olt marad), a
    `.mcp.example.json` viszont commitolva van.
