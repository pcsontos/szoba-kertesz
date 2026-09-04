# Plantbase — architektúra (fájlstruktúra + főbb döntések)

> Kurzus-melléklet. A "mivel" (verziók, eszközlista, séma) a `tech-stack.md`-ben; itt a STRUKTÚRA és a kulcsdöntések.

## Fájlstruktúra (Nx monorepo)

```
szoba-kertesz/
├── packages/core   agent-logika — lásd a bontást lentebb
├── packages/db     Prisma lib (séma, migráció, kliens, seed + a tudásbázis korpusza) — NEM a gyökérben
├── apps/cli        CLI (ask + ingest parancs + PERZISZTENS interaktív mód)
├── apps/server     Express-réteg a core fölött (POST /api/chat + GET /api/threads)
├── apps/web        Vite + React chat (useChat, streamelve, thread-listával)
├── docs            dokumentáció (lásd dev-workflow.md)
└── konfig          nx, package.json, .env, docker-compose
```

Az `apps/server` és az `apps/web` az 05. alkalomban jött létre (a korábbi „később: apps/api, apps/web" jegyzet ezzel teljesült; `apps/api` helyett `apps/server` a neve).

A `packages/core` belső bontása (04. alkalom óta) — **egy fogalom = egy könyvtár, a közös eggyel kintebb**:

```
packages/core/src/lib/
├── agents/
│   ├── agent-loop.ts        A KÖZÖS loop (runAgentLoop + AgentDefinition)
│   ├── query-agent/         a kérdés-válasz agent + promptja  (READ-ONLY)
│   ├── ingest-agent/        a katalógus-kezelő agent + promptja (ÍR)
│   ├── orchestrator-agent/  a HARMADIK agent: irányít, sosem válaszol saját szóval
│   │                        (askOrchestrator, orchestrator-prompt.ts, flow-lock.ts)
│   └── package-agent/       a NEGYEDIK agent: a csomag-építő (askPackageAgent), sosem
│                            fut SQL-t közvetlenül — askInfoAgent-en keresztül olvas
├── tools/
│   ├── tool-outcome.ts      a KÖZÖS tool-eredmény alak (ToolOutcome, ToolReporter)
│   ├── run-sql/             tool + SQL-guard + read-only kapcsolat
│   ├── list-categories/     tool (csak a query-agenté)
│   ├── query-customers/     tool — a bolt ügyfelei a customers táblából
│   ├── upsert-product/      Zod-séma + read-write kapcsolat + AZ EGYETLEN írási út
│   ├── fetch-feed/          Shopify-feed motor + tool-héj
│   ├── search-knowledge/    RAG-keresés a gondozási tudásbázisban
│   ├── delegate-to-ingest/  az ingest-agent TOOL-ként (csak adminnál)
│   ├── ask-info-agent/      a package-agent kapuja a query-agent felé (mindig customer)
│   ├── route-to-package/    az orchestrátor toolja a package-agenthez
│   ├── route-to-info/       az orchestrátor toolja a query-agenthez
│   └── package/             validatePackage / savePackage / cancelPackage + a
│                            csomag-kapcsolat (db-package.ts, ÖTÖDIK pool)
├── rag/                     A TUDÁSBÁZIS, a pipeline sorrendjében:
│   ├── chunk.ts             markdown darabolása alcím-határon, átfedéssel
│   ├── embed.ts             szöveg → 1536 szám (az EGYETLEN nem-Anthropic hívás)
│   ├── knowledge-store.ts   a vektorkeresés EGY SQL-ben (pgvector, <=>)
│   ├── hyde.ts              hipotetikus válasz ANGOLUL — ezt keressük a kérdés helyett
│   ├── rerank.ts            a top-20 átrangsorolása kis modellel (Haiku)
│   └── retrieve.ts          a pipeline összekötve, lépésenként láthatóan
├── threads/                 A BESZÉLGETÉS-TÁR (07. alkalom):
│   ├── db-chat.ts           a NEGYEDIK pool — csak DATABASE_URL_CHAT
│   ├── thread-store.ts      négy paraméterezett SQL + a ThreadStore port
│   └── message-parts.ts     a tár EGY, a nézet KETTŐ (web: parts, CLI: szöveg)
├── user-role/               KI beszél az agenttel (customer | admin)
├── ansi.ts                  a KÖZÖS konzol-színek (Trace + CLI)
├── trace.ts / logger.ts     a két, egymást kiegészítő nyom
└── config.ts                a környezet validálása (fail-fast)
```

Ami mappa, az egy példány (agent vagy tool); ami fájl a szinten, az a közös alap. Új tool = új könyvtár + **egy sor** az agent toolsetjében; nincs központi dispatch/registry.

(Csak nagy vonalakban; a fájl-szintű bontást Claude generálja a konvenciók szerint.)

## Főbb technológiai döntések

1. **Framework-agnostic core.** A `packages/core` nem ismeri a belépési pontokat (CLI/API/web). Új felület = új app, nem újraírás. Az 05. alkalom óta **három** belépési pont hajtja ugyanazt az egy loopot (CLI, HTTP, böngésző), és ez az invariáns BIZONYÍTÉKA: a `core`-ba egyetlen szerver-specifikus sor sem került, a `apps/server` csak lefordítja a HTTP-kérést `askAgent`-hívássá.
2. **Öt DB-kapcsolat, öt jog** (az ötödik ebben, az orchestrátor-agent körben jött; a negyedik a 07. alkalomban, 04-ben három, előtte kettő). A query-agent `runSql`-je READ-ONLY kapcsolaton fut (`DATABASE_URL_READONLY`, `szoba-kertesz_ro`), csak SELECT. Az ingest-agent írása SAJÁT, szűkített szerepen megy (`DATABASE_URL_READWRITE`, `szoba-kertesz_rw`): SELECT/INSERT/UPDATE a `products`-on, **DELETE és DDL nélkül**. A Prisma az admin kapcsolaton (`DATABASE_URL`) viszi a sémát, migrációt, seedet. Egyik agent sem Prismán kérdez, és a query-agent az író toolokat nem is látja.

   **A 06. alkalomtól a tudásbázis is EBBE a rendbe illeszkedik** (`rag/knowledge-store.ts`, két pool egy fájlban): a **keresés** (`searchChunks` / `listSources` / `listChunks`) a `DATABASE_URL_READONLY`-n, a **betöltés** (`clearKnowledge` / `insertChunks`) a `DATABASE_URL`-en megy. Ez azért számít, mert a keresést a VÁSÁRLÓT kiszolgáló, `cors()`-szal nyitott szerver hívja minden gondozási kérdésnél — admin poolon minden kérés admin-jogú kapcsolatot nyitna, ráadásul ugyanabból a modulból, ahonnan a `clearKnowledge()` (TRUNCATE) is exportálva van. Admin kapcsolatot így már csak a betöltő szkript igényel. A `szoba-kertesz_ro` szerep minden táblát EXPLICIT GRANT-tal lát, nem default privilege-gel — a `<ts>_ro_explicit_grants` migráció (#8 PR review) óta, amely pontosan azért vonta vissza az addigi `ALTER DEFAULT PRIVILEGES`-t, hogy egy jövőbeli nem-katalógus tábla (mint épp a csomag-táblák) ne kapjon automatikusan SELECT-et — mérve: SELECT megy, DELETE `permission denied`. Két spec rögzíti, melyik út melyik változóhoz kötődik.

   **A 07. alkalom NEGYEDIK szerepe (`szoba-kertesz_chat`, `DATABASE_URL_CHAT`) a beszélgetés-táré**, és ez mutatja meg, hogy a szétválasztás nem dísz: a `threads` és a `messages` a `_ro` szereptől **el van véve**, tehát az az agent, amelyik az SQL-t írja, a beszélgetéseket nem olvashatja — mérve: `permission denied for table messages`. Fordítva ugyanez: a chat-szerep sem a `products`-ot, sem a `customers`-t, sem a `knowledge_chunks`-ot nem látja, és a saját sorait sem törölheti — sőt, egy már beírt üzenetet átírni sem tud (a `messages` UPDATE-jét a `<ts>_messages_append_only` migráció vette vissza, a #8 PR review nyomán): a beszélgetés-történet append-only. Egy prompt-injektált „SELECT * FROM messages" így a Postgresen bukik el, nem a prompton.

   **Az ÖTÖDIK szerep (`szoba-kertesz_package`, `DATABASE_URL_PACKAGE`) a csomag-építésé**, és ugyanazt a mintát ismétli, mint a `_chat`: SELECT + INSERT a `packages`-en és a `package_items`-en, **se UPDATE, se DELETE** — egy elmentett csomag append-only. Emellett egy szűk, célzott SELECT-et is kap a `products`-on és a `customers`-en, de ez NEM modell-generált SQL, hanem a `validatePackage`/`savePackage` saját, kódból fixált lekérdezése (`checkPackage`, `tools/package/package-validation.ts`), ami mentés előtt újra ellenőrzi az árat és a készletet.
3. **Egy agent = prompt + toolok + loop.** A loop KÖZÖS (`agents/agent-loop.ts`), az agentek csak abban különböznek, hogy mit adnak be neki (system prompt, toolkészlet, kör-limit, token-keret). Új agent = új könyvtár az `agents/` alatt, nem új loop. Az 05. alkalomtól ehhez két dolog jött: (a) **a szerep képességet kapcsol** — adminnál a `delegateToIngest` bekerül a query-agent toolkészletébe, vásárlónál nincs ott, tehát a modell nem is tud róla; ez erősebb, mint egy promptban kimondott tiltás. A `role` szándékosan a query-agent saját opció-típusán él, nem az `AskOptions`-ön: a közös loop nem tudja, melyik agentet futtatja, tehát szerepekről sem tudhat. (b) **Egy agent lehet egy másik agent TOOLJA** — a `delegateToIngest` a külső loop szemszögéből ugyanolyan tool, mint a `runSql`, belül viszont egy teljes második loop fut saját prompttal, toolkészlettel és DB-joggal. Soha nem dob (a belső hibából a modellnek olvasható szöveg lesz), és **saját** JSONL-sort ír: egy admin-delegálásból két naplóbejegyzés lesz, szándékosan, mert az a futás valóban elköltött tokeneket.
4. **A loop az AI SDK-n fut, de a mechanika látható marad** (04. alkalom, tudatos váltás). A 2–3. órán ugyanez KÉZZEL íródott a nyers Anthropic SDK fölé — ez adja a megértés alapját, és ettől olvasható a framework: a `for`-ciklus → `stopWhen: isStepCount(n)`, az `executeTool` switch → a toolok saját `execute`-ja, a kézi üzenet-fűzés → az SDK. A transzparencia a `prepareStep` / `onStepEnd` hookokon marad (ugyanaz a Trace, ugyanaz a JSONL). Az 05. alkalomtól `generateText` helyett **`streamText`**, EGY úton: ha nincs `onTextDelta`, akkor is elfogyasztjuk a streamet — két ág néma elcsúszást okozna. A tesztek mockjai ezért `doStream`-et szolgálnak ki, provider-szintű darabokkal.
5. **Egyetlen írási út, és a kulcsot a DB őrzi.** A katalógust kizárólag az `upsertProduct` tool módosíthatja (szigorú Zod a határon, paraméterezett SQL, kódban rögzített oszlop-lista, latin névre kulcsolt upsert). Nyers write-SQL nincs a kódbázisban — a védelem **háromszintű**: tool-réteg, Postgres-szerepkör, és a `lower(latin_name)` unique index. Az upsert EGYETLEN atomi utasítás (`INSERT … ON CONFLICT … DO UPDATE`): amíg SELECT → INSERT/UPDATE volt, két egyidejű upsert ugyanarra a névre két sort hozott létre, mert mindkét SELECT üresen tért vissza. A „latin név a kulcs" invariáns azóta ott él, ahol a többi határ is: az adatbázisban, nem a promptban és nem a kódban.
6. **Átláthatóság beépítve.** Minden interakció JSONL-be naplózva (token usage-dzsel — ez a költségbecslés bizonyítékbázisa) + élő, színes Trace; `--show-prompt` a teljes prompt megjelenítéséhez, `--quiet` csak a konzol-felét némítja. A **megszakadt** futás is naplózódik (`[MEGSZAKADT]`, az addig elköltött tokenekkel), mielőtt a hiba továbbmegy — egy rate-limitbe futó hívás tokenjei elmentek, tehát nem maradhat nyom nélkül. `streamText` alatt ez a garancia az **`onError`-on áll** (mérve `ai@7.0.66`-on): a `streamText` nem dobja tovább a hibát, és MÁSODIK köri hibánál az `await result.text` nem is rejectel — kezeletlenül a futás sikeresnek látszana üres válasszal, a `[MEGSZAKADT]` sor pedig némán eltűnne. Ezért a loop az `onError`-ban kapja el a hibát, és a stream lefutása után maga dönt. A két nyom független: egyik bukása sem viheti magával a másikat.
7. **A beszélgetés a TÁRBAN él, nem a kliensben** (07. alkalom). A `/api/chat` csak az ÚJ üzenetet kapja (`{ message, threadId }`), az előzményt a szerver tölti be a `threads`/`messages` táblákból. Amíg a böngésző küldte fel a teljes tömböt, bárki POST-olhatott hamis előzményt, és a modell abból válaszolt volna. Ugyanez a tár szolgálja ki a CLI interaktív módját is — ezért nem az `apps/server`-ben van, hanem a `packages/core`-ban: **egy tár nem framework**, és két belépési pont használja.
8. **Lokális DB.** docker-compose Postgres, OrbStack futtatja. Helyben dolgozunk, nincs felhő-DB.
9. **Prisma külön Nx lib.** A Prisma (séma, migráció, kliens, seed) a `packages/db` libben él, NEM a repo gyökerében: a séma az Nx graph része, a core és a seed onnan importál.
10. **Library-doksi munka előtt.** Új vagy ritkán használt API-nál (pl. Prisma) ELŐBB beolvassuk a doksit Context7-tel, csak utána kódolunk, mert így kevesebb a hiba a tesztek alatt.

Konvenciók: `konvenciók.md`
