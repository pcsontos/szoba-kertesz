# 07. alkalom — higiéniai kör és perzisztencia — design

> Forrás: a kurzus 07. alkalmának kódvezetése (*Beszélő agent*), **A és B fázis**.
> A C (orchestráció) és a D (voice, flow-test) fázis **nincs** ebben a specben.

## Mit rögzít ez a doksi

Mit építünk a 07. alkalomból, **mit nem**, és minden döntésnél azt is, mit vetettünk el
és miért. A végrehajtási terv ebből készül; a döntéseket ott már nem kell újra kitalálni.

Egy mondatban: **a beszélgetés kikerül a memóriából az adatbázisba**, a három beégetett
ügyfél valódi táblává válik, és közben kitakarítjuk azt, ami a hat alkalom alatt halott lett.

## Kiindulási állapot — mérve, nem feltételezve

Minden alábbi állítás a repóból vagy a Postgresből származik, 2026-08-22-én.

- A `master` a `8e73a8e` merge-commiton áll, `hf3-leadas` taggel; a munkafa tiszta.
- `packages/core/src/lib/echo.ts` + `echo.spec.ts` **él**, és egyetlen hivatkozója van:
  a `packages/core/src/index.ts:45` re-exportja. Valóban halott kód.
- **`packages/core` egyetlen sort sem importál Prismából** — kizárólag `pg`-t használ.
  A CLAUDE.md ezzel ellentétes állítása („both `core` and the seed script import from there")
  **téves**, és ebben a körben javítandó.
- A `_ro` szerep grantja: `GRANT SELECT ON ALL TABLES` **és**
  `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES`. Vagyis **minden
  ezután létrehozott tábla automatikusan olvashatóvá válik neki.**
- A `_rw` szerep grantja: `SELECT, INSERT, UPDATE` **kizárólag a `products` táblán**,
  plusz `USAGE, SELECT ON ALL SEQUENCES` (a migráció pillanatában létezőkön).
- `list-categories-tool.ts` a `../run-sql/db-readonly.js` `queryReadonly`-ját használja —
  ez a precedens a `queryCustomers` számára, nem kell új infrastruktúra.
- A `ToolOutcome.sql` doksija kimondja: „Csak az SQL-t generáló tool (`runSql`) tölti ki;
  minden más tool `null`-t ad." Az `upsertProduct` és a `listCategories` is `null`-t ad,
  pedig mindkettő futtat valódi SQL-t.
- `get-client-preferences-tool.ts` 149 sor, három beégetett ügyféllel:
  ACME (1 000 Ft / ALACSONY), GLOBEX (5 000 / KÖZEPES), INITECH (250 000 / MAGAS).
- A prompt `<tools>` blokkja két helyen él **bájtra azonosan**: `query-prompt.ts:83` és
  `docs/system-prompt.md:70`. A `<schema>` blokkot ezen felül az **ingest-agent** promptja
  is megosztja.
- Fájlméretek: `App.tsx` 161, `app.ts` 210, `main.ts` 39, `agent-loop.ts` 373, `trace.ts` 412.
- A `main.ts` no-arg interaktív ága explicit `roleIndex === -1` guardot tart, mert a
  `--role <value>` **két** argv-slotot foglal.
- A `rag/retrieve.ts:128` nyers ANSI escape-eket ír (`\x1b[36m`, `\x1b[2m`), miközben a
  `trace.ts` egy rendes `c.*` szín-helpert tart. Két stílus egy projektben.
- A kurzus `queryCustomers`-e (`045d86e`) **Prismán, az admin `DATABASE_URL`-en** fut.
- A kurzus `cc67548` grant-javítása („read-only grantok migrációba") **minket nem érint**:
  nálunk a grantok a 04. alkalom óta migrációban vannak.
- A HF4 házi feladat (a 9–10. alkalomé) **dokumentum-alapú, kód nem kell hozzá** — tehát a
  kihagyott C fázis semmilyen leadást nem blokkol.

## Döntések

| # | Döntés | Elvetett alternatíva | Miért |
|---|---|---|---|
| 1 | Scope: **A + B fázis** | A+B+C; mind a négy fázis | A C önmagában nagyobb, mint az A+B együtt (a kurzusnál 13 task); a kódvezetés maga jelöli kiszállási pontnak az A+B végét, a 08–09. nem épít az orchestrátorra, és a HF4 dokumentum-alapú |
| 2 | A **DB az igazságforrás**, web **és** CLI | csak web; „minimál" (mentés+visszatöltés, de a kliens küldi az előzményt) | a minimál változat nyitva hagyja a hamis-előzmény lyukat; a CLI bevonása bizonyítja, hogy a perzisztencia a tárban van, nem a felületben |
| 3 | **Negyedik szerep** (`szoba-kertesz_chat`) + `pg` + a tár a `core`-ban | Prisma a felületi rétegben (`packages/db` exportál); kurzus 1:1 (közös lazy Prisma a core tool-rétegében) | a projekt kimondott invariánsa, hogy a jogosultság Postgresben él és egyik agent sem kérdez Prismán; a CLI-megosztás miatt a tár amúgy sem élhet a szerverben |
| 4 | A `threads` és a `messages` **revokálása** a `_ro` szerepről | hagyni, ahogy az `ALTER DEFAULT PRIVILEGES` adja | enélkül a `runSql` lefuttathatná, hogy `SELECT * FROM messages LIMIT 50` — a guard átengedné (SELECT ✓, LIMIT ✓), és a böngészőben ülő bárki kiolvashatná az összes beszélgetést |
| 5 | **UUID** thread-azonosító (`gen_random_uuid()`) | `serial` | a `?thread=7` egy hitelesítés nélküli, nyitott `cors()` mögötti végponton végigszámolhatóvá tenné mások beszélgetéseit |
| 6 | A `customers` **kimarad** a prompt `<schema>` blokkjából | betenni, hogy a `runSql` join-olhasson rá | azt a blokkot az **ingest-agent** promptja bájtra megosztja, és az író agentnek semmi köze az ügyfelekhez |
| 7 | `expertise_level` = a **`products.difficulty`** skálája (kezdő \| haladó \| profi) | a régi `careLevel` (ALACSONY \| KÖZEPES \| MAGAS) megtartása | a régi egyetlen katalógus-oszlopra sem képződött le, a modellnek fejben kellett fordítania |
| 8 | `--thread` **csak interaktív módban** | az egylövetű `ask` is perzisztáljon | egy kérdés nem beszélgetés; eggyel kevesebb kódút |
| 9 | `DATABASE_URL_CHAT` **opcionális a sémában**, kötelező a két perzisztáló felületen | kötelezővé tenni a `loadConfig`-ban | az egylövetű `ask` maradjon független, ahogy a `DATABASE_URL_READWRITE` és az `OPENAI_API_KEY` esetében is |
| 10 | `GET /api/threads` hitelesítés nélkül listáz | `NODE_ENV` guard mögé tenni; localStorage kliens-azonosítóra szűrni | a webes thread-lista enélkül nem működik, és a felület amúgy is hitelesítés nélküli; localhoston fut |

## Adatmodell

Három új Prisma-modell (`packages/db/prisma/schema.prisma`) és két migráció: egy a
tábláknak (Prisma generálja), egy **nyers SQL** a szerepnek és a grantoknak.

**`customers`** — a `CLIENT_PREFERENCES` három beégetett sorának utódja, bővebb profillal:
`code` (unique), `name`, `contact_name?`, `email`, `city`,
`customer_type` (magánszemély \| iroda \| étterem \| hotel \| üzlet),
`budget` `Decimal(12,2)`, `expertise_level`, `pet_safe_required`, `kid_safe_required`,
`notes`, `created_at`. Seed: `packages/db/prisma/customers.ts`, ~20 életszerű ügyfél —
**a régi három kóddal együtt**, hogy a meglévő doksik példái (`"Mit ajánlasz az ACME-nek?"`)
ne haljanak meg.

**`threads`** — `id UUID` `gen_random_uuid()` alapértelmezéssel, `title` (az első
user-szöveg első ~60 karaktere), `customer_id Int?` (hely a C fázisnak, most mindig null),
`created_at`, `updated_at`.

**`messages`** — `id serial`, `thread_id UUID` FK `ON DELETE CASCADE`, `role`,
`parts JSONB`, `created_at`, index a `thread_id`-ra. A `parts` a **teljes `UIMessage.parts`**,
ezért újratöltéskor a tool-kártyák is visszarajzolódnak, nem csak a szöveg.

## Jogosultságok

A grant-migráció három dolgot tesz, ebben a sorrendben:

1. `REVOKE SELECT ON threads, messages FROM "szoba-kertesz_ro"` — a beszélgetés tartalma
   **nem agent-lekérdezhető adat**. (A revoke azért kell, mert az `ALTER DEFAULT PRIVILEGES`
   már megadta volna.)
2. `CREATE ROLE "szoba-kertesz_chat"` (idempotensen) — `SELECT, INSERT, UPDATE` a
   `threads`+`messages`-en, `USAGE, SELECT` a `messages` szekvenciáján, és **semmi más**:
   se `products`, se `knowledge_chunks`, se DELETE, se DDL.
3. A `customers` **marad** `_ro`-n olvashatóan: ez üzleti adat, amit az agent dolga használni.

Az `init.sql` ugyanezt kapja, a migrációval szinkronban — **a migrációt írjuk először**.

Mivel az olvasás és az írás itt ugyanahhoz a bizalmi szinthez tartozik, a `thread-store.ts`-nek
**egyetlen** poolja van, nem kettő, mint a `knowledge-store.ts`-nek.

**Így a jogosultsági táblázat négy sorosra nő:** `DATABASE_URL` (Prisma, admin) ·
`DATABASE_URL_READONLY` (katalógus + tudásbázis olvasása) ·
`DATABASE_URL_READWRITE` (kizárólag `upsertProduct`) ·
`DATABASE_URL_CHAT` (kizárólag a beszélgetés-tár).

## A `core` rétege

### `lib/threads/thread-store.ts`

Lusta pool a `_chat` szerepen, a `run-sql/db-readonly.ts` mintájára (`queryChat` helper,
`DbChatDeps` teszt-varrat). Négy paraméterezett művelet:

| Művelet | SQL |
|---|---|
| `createThread(title)` | `INSERT INTO threads (title) VALUES ($1) RETURNING id` |
| `appendMessage(threadId, role, parts)` | **egyetlen atomi utasítás** CTE-vel: beszúrja az üzenetet, és ugyanabban lépteti a `threads.updated_at`-et |
| `loadThread(threadId)` | `SELECT role, parts FROM messages WHERE thread_id = $1 ORDER BY id ASC` |
| `listThreads(limit)` | `SELECT id, title, updated_at FROM threads ORDER BY updated_at DESC LIMIT $1` |

Az `appendMessage` egy-utasításos volta ugyanaz az elv, ami az `upsertProduct`-ot egyetlen
`INSERT … ON CONFLICT`-té tette: két külön statement félúton megszakadhat.

A `threadId`-t **Zod `z.uuid()` validálja a határon**, mielőtt a DB-hez érne — enélkül egy
`?thread=xyz` a Postgres `invalid input syntax for type uuid` hibáját dobná, és a szerver
500-zal HTML stack trace-t adna. Pontosan az a hibaosztály, amit a #4 PR-review már egyszer
megtalált a `/api/chat`-en.

A `parts` a tárban **`unknown[]`**, nem `UIMessage['parts']`: a tár buta JSON-konténer,
a jelentést a felület adja neki.

A `loadThread` a `messages.id` soronkénti sorszámát adja vissza `UIMessage.id`-ként — a
`convertToModelMessages` megköveteli az azonosítót, és így nem kell külön oszlopot tárolni rá.

### `lib/threads/message-parts.ts`

Két tiszta függvény: `textToParts(text)` és `partsToText(parts)`. A CLI szöveg-partokat ír,
a web teljes `UIMessage.parts`-ot. Következmény, ami demózható: **egy CLI-ben indított
beszélgetés megnyitható a böngészőben, és egy webes beszélgetés folytatható a CLI-ben** —
ott a tool-kártyák szöveggé laposodnak.

### `lib/tools/query-customers/`

`customer-schema.ts` (Zod input, `CUSTOMER_TYPES`, fix `CUSTOMER_COLUMNS` oszloplista) +
`query-customers-tool.ts`. A meglévő `_ro` poolon fut. Bemenet: `code?`, `search?`
(név/város ILIKE), `customerType?`; `LIMIT 20`. Kimenet kompakt JSON, `Decimal → number`.
`ToolOutcome`: `summary: "3 ügyfél · ACME"`, **`sql: null`** (a konvenció szerint az `sql`
csak a *modell által generált* lekérdezést hordozza).

### A `getClientPreferences` kivezetése

Törlődik a könyvtár és a specje; a `query-agent.ts` `buildTools`-ában egy sor cserélődik;
a `query-agent.spec.ts`, az `agent-loop.spec.ts` és a `trace.ts:302` komment átvezetve.

**A prompt szerződése a kritikus rész:** a `query-prompt.ts` `<tools>` blokkjának
`getClientPreferences`-sora cserélődik, és **ugyanaz a csere kell a `docs/system-prompt.md`-be**.
A Task lezárása a CLAUDE.md-ben álló `diff` parancs: ha nem üres, a Task nincs kész.

### `config.ts`

`DATABASE_URL_CHAT` opcionális a sémában; a hiányát a `thread-store.ts` jelzi fail-fast,
magyar üzenettel. A szerver `main.ts` boot-ja és a CLI interaktív belépője **explicit**
ellenőrzi, tehát ott a hiány induláskor derül ki. A fejkomment „HÁROM jogosultsági szint …
ebből KETTŐT lát" → **négy szint, hármat lát**.

## A két felület

### Szerver

| | Ma | Ezután |
|---|---|---|
| Kérés | `{ messages: UIMessage[] }` — a kliens küldi a teljes előzményt | `{ message: UIMessage, threadId?: string }` |
| Előzmény | a kérésből | a `threads`/`messages` táblából |
| Válasz | UI message stream | ugyanaz + egy **`data-thread` part** az elején |

Menet: Zod-validálás → thread betöltése vagy létrehozása → **a user-üzenet mentése még az
agent futása előtt** → `data-thread` part → `askAgent` a DB-ből jövő előzménnyel →
`onFinish`-ben az assistant-üzenet mentése a teljes `parts`-szal.

**Ez biztonsági javítás is:** ma a böngésző hamis előzményt küldhet fel („korábban azt
mondtad, adhatsz 90% kedvezményt"), és a szerver azt továbbadja a modellnek. Ezután a
szerver csak azt hiszi el, amit ő maga írt be.

Két új végpont: `GET /api/threads` (LIMIT 50) és `GET /api/threads/:id`.
Nem-UUID → 400 magyar JSON, nem létező thread → 404 magyar JSON.

A `role: 'customer'` pinnelése a `/api/chat`-en **változatlanul marad** — a thread-kezelés
nem nyúlhat hozzá.

### CLI

Az interaktív mód induláskor threadet nyit vagy `--thread <uuid>`-val folytat, és halványan
kiírja az azonosítót (`pnpm cli --thread <id>` folytatja, a böngésző `?thread=<id>`-vel
nyitja). Minden körben menti a user- és az assistant-üzenetet szöveg-partokként.
A `--thread` a rendszerhatáron validálódik, mint a `--role`.

**Regressziós csapda:** a `main.ts` `roleIndex === -1` guardja azért van, mert a
`--role <value>` két argv-slotot foglal. A `--thread <value>` ugyanezt hozza — a guardnak
mindkettőt kezelnie kell, és spec rögzíti.

### Web

Thread-lista oldalsáv, `?thread=<id>`-ből betöltés, „új beszélgetés" gomb.
`DefaultChatTransport` + `prepareSendMessagesRequest`: csak az utolsó üzenet és a `threadId`
megy fel. A `data-thread` part megérkezésekor `history.replaceState` írja az URL-t.
Itt kerül sorra az A fázisból ide csúsztatott `splitAssistantParts` kiemelés: az `App.tsx`
a thread-listával 250 sor fölé menne. A `lib/scroll.ts` auto-scrollja változatlan.

## Hibakezelés

- Hiányzó `DATABASE_URL_CHAT` → a szerver boot és a CLI interaktív belépő elhal magyar
  üzenettel; az egylövetű `ask` fut tovább.
- Ismeretlen thread → **404 a streamelés előtt**, ahogy a 400-as validáció is.
- **A mentés hibája nem viheti el a választ:** az `onFinish`-beli mentés hibája naplózódik,
  de a stream már kiment — ugyanaz az elv, mint a Trace és a JSONL függetlenségénél.
- A `data-thread` part **az agent futása előtt** megy ki, tehát egy elhasalt futás után is
  tudja a kliens, melyik threadről volt szó.

## Tesztelés

| Spec | Mit bizonyít | DB? |
|---|---|---|
| `thread-store.spec.ts` | create → append → load → list körút | ✔ |
| `db-chat.spec.ts` | a `_chat` szerep **nem** olvashat `products`-ot és **nem** törölhet `messages`-t | ✔ |
| `db-readonly.spec.ts` (bővítés) | a `_ro` szerep `permission denied`-et kap a `messages`-re | ✔ |
| `query-customers-tool.spec.ts` | validáció, valódi lekérdezés, 0-találatos ág | ✔ |
| `message-parts.spec.ts` | `textToParts`/`partsToText` körút, tool-part laposítás | ✖ |
| `query-agent.spec.ts` (mód.) | a toolset `queryCustomers`-t tartalmaz, `getClientPreferences`-t nem | ✖ |
| `app.spec.ts` (bővítés) | az előzmény a **tárból** jön, nem a kérésből; ismeretlen thread → 404; rossz UUID → 400 | ✖ |
| `threads.spec.ts` | a két thread-végpont valódi HTTP-n, injektált tárral | ✖ |
| `parse-thread.spec.ts` | érvénytelen UUID → magyar hiba **API-hívás előtt** | ✖ |
| `main.spec.ts` (bővítés) | a `szobakertesz foo` `--thread` jelenlétében sem indít interaktív módot | ✖ |
| web `App.spec.tsx` (bővítés) | thread-lista renderelése, `?thread=` init | ✖ |

A `thread-store.spec.ts` **eldobható saját threadeken** dolgozik és **admin kapcsolaton**
takarít — mint az `upsert-product-db.spec.ts`, mert a `_chat` szerep szándékosan nem tud
DELETE-elni.

## Doksi-szinkron

CLAUDE.md (a téves Prisma-import állítás, a négy kapcsolat, az új tool és tár), README
(env-változók, scriptek, a `getClientPreferences` eltűnése), `docs/architektura-monorepo.md`,
`docs/tech-stack.md` (a három új tábla), `docs/system-prompt.md` (**bájtra**),
`docs/implementacios-terv.md`, `.env.example`, `init.sql`.

Új npm-scriptek: `db:migrate` (`prisma migrate deploy`), `db:seed`, `db:reset` — a kódvezetés
minden ellenőrző lépése ezekre hivatkozik.

## Amit szándékosan NEM csinálunk

- **C fázis:** `ORCHESTRATION_MODE`, orchestrator-agent, package-agent, jelző-toolok,
  flow-lock, `validate-package`/`save-package`, két handover-mód, UI-chipek. Ha kell, saját spec.
- **D fázis:** voice miniapp, flow-test skill, demó-útmutató, topológia-ábra.
- **`pnpm demo` script** — nálunk nincsenek demó-branchek.
- **Prisma futásidőben** (a kurzus `bcd18c6` közös lazy kliense) — a `core` marad `pg`-n.
- **A `customers` a `<schema>` blokkban** — lásd a 6. döntést.
- **Ötödik kapcsolat** a `queryCustomers`-nek: a `customers` marad `_ro`-n.
- **Hitelesítés / thread-tulajdonos.** Vállalt korlát, dokumentálva.
- **Az egylövetű `ask` perzisztálása.**

## Sikerkritériumok — megfigyelhető viselkedés

1. `pnpm cli` interaktív módban feltett kérdés után a kiírt azonosítóval
   `http://localhost:4200/?thread=<id>` **ugyanazt a beszélgetést** mutatja a böngészőben.
2. A böngészőben folytatott beszélgetés F5 után teljes egészében visszatöltődik,
   **a tool-kártyákkal együtt**.
3. A `runSql` a `messages` táblára `permission denied for table messages` hibát kap —
   a modell nem tudja kiolvasni a beszélgetéseket.
4. A `_chat` szerepen `SELECT * FROM products LIMIT 1` → `permission denied for table products`;
   `DELETE FROM messages` → szintén megtagadva.
5. `pnpm cli ask "Mit ajánlasz az ACME-nek?"` → a Trace-ben **`queryCustomers`** fut
   (nem `getClientPreferences`), és a válasz a `customers` táblából jövő kerettel szűr.
6. `pnpm db:reset && pnpm db:seed` után a `pnpm cli ask "Hány kaktusz van?"` lefut,
   **nem** `permission denied`.
7. Kézzel felküldött hamis előzmény **nem befolyásolja** a választ: a szerver a DB-ből tölt.
8. `GET /api/threads/<nem-uuid>` → 400 magyar JSON; `GET /api/threads/<nem létező uuid>` →
   404 magyar JSON. Egyik sem HTML stack trace.
9. `DATABASE_URL_CHAT` nélkül a `pnpm serve:api` **induláskor** áll meg magyar üzenettel,
   a `pnpm cli ask "…"` viszont változatlanul lefut.
10. A CLAUDE.md-beli `diff` a `query-prompt.ts` és a `docs/system-prompt.md` között **üres**.
11. `pnpm nx run-many -t lint typecheck build` zöld, és a teljes teszt-készlet fut.
