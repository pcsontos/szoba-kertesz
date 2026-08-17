# Plantbase — architektúra (fájlstruktúra + főbb döntések)

> Kurzus-melléklet. A "mivel" (verziók, eszközlista, séma) a `tech-stack.md`-ben; itt a STRUKTÚRA és a kulcsdöntések.

## Fájlstruktúra (Nx monorepo)

```
szoba-kertesz/
├── packages/core   agent-logika — lásd a bontást lentebb
├── packages/db     Prisma lib (séma, migráció, kliens, seed) — NEM a gyökérben
├── apps/cli        CLI (ask + ingest parancs + interaktív mód)
├── docs            dokumentáció (lásd dev-workflow.md)
└── konfig          nx, package.json, .env, docker-compose

Később (NEM most): apps/api (4. óra), apps/web (5. óra)
```

A `packages/core` belső bontása (04. alkalom óta) — **egy fogalom = egy könyvtár, a közös eggyel kintebb**:

```
packages/core/src/lib/
├── agents/
│   ├── agent-loop.ts        A KÖZÖS loop (runAgentLoop + AgentDefinition)
│   ├── query-agent/         a kérdés-válasz agent + promptja  (READ-ONLY)
│   └── ingest-agent/        a katalógus-kezelő agent + promptja (ÍR)
├── tools/
│   ├── tool-outcome.ts      a KÖZÖS tool-eredmény alak (ToolOutcome, ToolReporter)
│   ├── run-sql/             tool + SQL-guard + read-only kapcsolat
│   ├── list-categories/     tool (csak a query-agenté)
│   ├── get-client-preferences/  tool (nem SQL-alapú)
│   ├── upsert-product/      Zod-séma + read-write kapcsolat + AZ EGYETLEN írási út
│   └── fetch-feed/          Shopify-feed motor + tool-héj
├── trace.ts / logger.ts     a két, egymást kiegészítő nyom
└── config.ts                a környezet validálása (fail-fast)
```

Ami mappa, az egy példány (agent vagy tool); ami fájl a szinten, az a közös alap. Új tool = új könyvtár + **egy sor** az agent toolsetjében; nincs központi dispatch/registry.

(Csak nagy vonalakban; a fájl-szintű bontást Claude generálja a konvenciók szerint.)

## Főbb technológiai döntések

1. **Framework-agnostic core.** A `packages/core` nem ismeri a belépési pontokat (CLI/API/web). Új felület = új app, nem újraírás. (Mastra majd az 5. órán a core köré.)
2. **Három DB-kapcsolat, három jog** (04. alkalom óta; korábban kettő volt). A query-agent `runSql`-je READ-ONLY kapcsolaton fut (`DATABASE_URL_READONLY`, `szoba-kertesz_ro`), csak SELECT. Az ingest-agent írása SAJÁT, szűkített szerepen megy (`DATABASE_URL_READWRITE`, `szoba-kertesz_rw`): SELECT/INSERT/UPDATE a `products`-on, **DELETE és DDL nélkül**. A Prisma az admin kapcsolaton (`DATABASE_URL`) viszi a sémát, migrációt, seedet. Egyik agent sem Prismán kérdez, és a query-agent az író toolokat nem is látja.
3. **Egy agent = prompt + toolok + loop.** A loop KÖZÖS (`agents/agent-loop.ts`), az agentek csak abban különböznek, hogy mit adnak be neki (system prompt, toolkészlet, kör-limit, token-keret). Új agent = új könyvtár az `agents/` alatt, nem új loop.
4. **A loop az AI SDK-n fut, de a mechanika látható marad** (04. alkalom, tudatos váltás). A 2–3. órán ugyanez KÉZZEL íródott a nyers Anthropic SDK fölé — ez adja a megértés alapját, és ettől olvasható a framework: a `for`-ciklus → `stopWhen: isStepCount(n)`, az `executeTool` switch → a toolok saját `execute`-ja, a kézi üzenet-fűzés → az SDK. A transzparencia a `prepareStep` / `onStepEnd` hookokon marad (ugyanaz a Trace, ugyanaz a JSONL). A váltás indoka az 05. alkalom streamelése, amit nem éri meg kézzel újraépíteni.
5. **Egyetlen írási út, és a kulcsot a DB őrzi.** A katalógust kizárólag az `upsertProduct` tool módosíthatja (szigorú Zod a határon, paraméterezett SQL, kódban rögzített oszlop-lista, latin névre kulcsolt upsert). Nyers write-SQL nincs a kódbázisban — a védelem **háromszintű**: tool-réteg, Postgres-szerepkör, és a `lower(latin_name)` unique index. Az upsert EGYETLEN atomi utasítás (`INSERT … ON CONFLICT … DO UPDATE`): amíg SELECT → INSERT/UPDATE volt, két egyidejű upsert ugyanarra a névre két sort hozott létre, mert mindkét SELECT üresen tért vissza. A „latin név a kulcs" invariáns azóta ott él, ahol a többi határ is: az adatbázisban, nem a promptban és nem a kódban.
6. **Átláthatóság beépítve.** Minden interakció JSONL-be naplózva (token usage-dzsel — ez a költségbecslés bizonyítékbázisa) + élő, színes Trace; `--show-prompt` a teljes prompt megjelenítéséhez, `--quiet` csak a konzol-felét némítja. A **megszakadt** futás is naplózódik (`[MEGSZAKADT]`, az addig elköltött tokenekkel), mielőtt a hiba továbbmegy — egy rate-limitbe futó hívás tokenjei elmentek, tehát nem maradhat nyom nélkül. A két nyom független: egyik bukása sem viheti magával a másikat.
7. **Lokális DB.** docker-compose Postgres, OrbStack futtatja. Helyben dolgozunk, nincs felhő-DB.
8. **Prisma külön Nx lib.** A Prisma (séma, migráció, kliens, seed) a `packages/db` libben él, NEM a repo gyökerében: a séma az Nx graph része, a core és a seed onnan importál.
9. **Library-doksi munka előtt.** Új vagy ritkán használt API-nál (pl. Prisma) ELŐBB beolvassuk a doksit Context7-tel, csak utána kódolunk, mert így kevesebb a hiba a tesztek alatt.

Konvenciók: `konvenciók.md`
