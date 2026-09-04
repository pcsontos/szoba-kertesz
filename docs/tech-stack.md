# Plantbase — tech stack

Elv: iparági best practice, legfrissebb STABIL verzió (se cutting-edge, se elavult).

- Nyelv / monorepo: TypeScript (strict), Nx, pnpm, Node LTS
- DB: PostgreSQL lokálisan docker-compose-ban (OrbStack futtatja), Prisma (ORM: séma, migráció, seed, typed query). Helyben dolgozunk, nincs felhő-DB.
- Agent: Vercel AI SDK 7 (`ai` + `@ai-sdk/anthropic`) `streamText` tool-use loop + Zod (validáció). A 2–3. órán ugyanez kézzel, a nyers Anthropic SDK fölé íródott — a váltás tudatos, lásd `architektura-monorepo.md` 4. pont
- CLI: commander + node:readline
- HTTP: Express 5 + cors; web: Vite + React 19 + Tailwind v4 + `@ai-sdk/react` (`useChat`) + react-markdown
- Tooling: Vitest, ESLint + Prettier, tsx
- Eszköz: Zed, gh CLI

## products séma

```sql
products (
  id            serial primary key,
  name          text,        -- köznapi név
  latin_name    text,
  category      text,        -- szobanövény / kerti / pozsgás / kaktusz / fűszer / fa-cserje / lógó / virágzó
  location      text,        -- beltéri / kültéri / mindkettő
  price             numeric,  -- ár (HUF)
  sale_price        numeric,  -- akciós ár (ha van akció), különben null
  stock             int,      -- raktárkészlet (db)
  light             text,     -- árnyék / alacsony / közepes / erős / direkt nap
  watering          text,     -- ritka / közepes / gyakori / állandóan nedves
  difficulty        text,     -- kezdő / haladó / profi
  current_height_cm int,      -- aktuális magasság
  max_height_cm     int,      -- kifejlett (max) magasság
  current_pot_cm    int,      -- aktuális cserépméret
  pet_safe          boolean,  -- háziállat-barát
  kid_safe          boolean,  -- gyerekbiztos (nem mérgező)
  air_purifying     boolean,  -- légtisztító
  rating            numeric,  -- 0-5
  reviews_count     int,
  description       text
)
```

## customers séma (07. alkalom)

```sql
customers (
  id                serial primary key,
  code              text unique,   -- rövid ügyfélkód (pl. ACME) — az agent ezzel hivatkozik
  name              text,          -- cégnév vagy magánszemély neve
  contact_name      text,          -- opcionális
  email             text,
  city              text,
  customer_type     text,          -- magánszemély / iroda / étterem / hotel / üzlet
  budget            numeric(12,2), -- keret (HUF)
  expertise_level   text,          -- kezdő / haladó / profi  (= products.difficulty skálája)
  pet_safe_required boolean,
  kid_safe_required boolean,
  notes             text,          -- döntést befolyásoló kontextus (fény, stílus, öntözés)
  created_at        timestamptz
)
```

A `queryCustomers` tool ezen a táblán dolgozik, a `szoba-kertesz_ro` szerepen. Ez váltotta a kódba drótozott `getClientPreferences` toolt: az ügyfél-adatnak az adatbázisban a helye, nem a forrásban. A `budget` és az `expertise_level` azért fontos, mert a katalógus-szűrés ezekből indul: az ár `COALESCE(sale_price, price)` alapján a kerethez mérve, a `difficulty` pedig ugyanazon a három fokozaton áll (kezdő / haladó / profi), mint az ügyfél szintje.

## threads + messages séma (07. alkalom)

```sql
threads (
  id          uuid primary key default gen_random_uuid(),
  title       text,          -- az első user-üzenet első ~60 karaktere
  customer_id int references customers(id) on delete set null,  -- hely a csomag-flow-nak;
                             -- ebben a fázisban mindig null
  created_at  timestamptz,
  updated_at  timestamptz    -- minden új üzenetnél lép; a lista e szerint rendez
)

messages (
  id         serial primary key,  -- időrend ÉS a UIMessage.id forrása
  thread_id  uuid references threads(id) on delete cascade,  -- indexelve
  role       text,   -- user | assistant
  parts      jsonb,  -- a TELJES UIMessage.parts (szöveg ÉS tool-részek)
  created_at timestamptz
)
```

A `parts` azért `jsonb` és nem `text`: a böngésző így a tool-kártyákat is visszakapja. A terminál ugyanebből olvassa ki a szöveget (`partsToText`) — **a tár egy, a nézet kettő**.

A `threads.updated_at`-nek a Prisma `@updatedAt` MELLETT `@default(now())` is kell, mert a tár nyers SQL-lel ír, a `@updatedAt`-et viszont a Prisma kliensoldalon tölti: alapérték nélkül a kézi INSERT elhasalna a NOT NULL oszlopon.

## packages + package_items séma (orchestrátor-agent kör)

```sql
packages (
  id           uuid primary key default gen_random_uuid(),
  customer_id  int references customers(id) not null,
  total_price  numeric(12,2),  -- a package_items unit_price × quantity összege
  created_at   timestamptz
)

package_items (
  id          serial primary key,
  package_id  uuid references packages(id) on delete cascade,
  product_id  int references products(id) not null,
  quantity    int,
  unit_price  numeric(12,2)   -- ÁRPILLANATKÉP mentéskor (COALESCE(sale_price, price))
)
```

A `packages.id` és a `threads.id` ugyanazon okból `uuid` (`gen_random_uuid()`, DB-oldalon generálva, nem a Prisma-kliensen): a `savePackage` nyers SQL INSERT-tel ír, tehát az azonosítót magának az adatbázisnak kell előállítania.

A `package_items.unit_price` szándékosan **árpillanatkép**: a mentés pillanatában érvényes `COALESCE(sale_price, price)` értéket rögzíti, nem egy élő hivatkozást a `products` táblára — így egy elmentett csomag ára nem sodródik a katalógus későbbi árváltozásaival.

A `packages`/`package_items` az egyetlen a projekt táblái közül, amelyiket **kizárólag** két tool (`validatePackage`, `savePackage`) írhat, egyetlen agent (`package-agent`) toolkészletén keresztül, a saját, ötödik DB-szerepen (`szoba-kertesz_package`) — lásd lentebb.

## DB-szerepek

| Szerep | Kapcsolat | Mit lát |
| --- | --- | --- |
| admin | `DATABASE_URL` | mindent — Prisma (séma, migráció, seed) és a tudásbázis betöltése |
| `szoba-kertesz_ro` | `DATABASE_URL_READONLY` | SELECT: `products`, `customers`, `knowledge_chunks` — a `threads`/`messages` **megtagadva** |
| `szoba-kertesz_rw` | `DATABASE_URL_READWRITE` | SELECT/INSERT/UPDATE a `products`-on; DELETE és DDL nincs |
| `szoba-kertesz_chat` | `DATABASE_URL_CHAT` | SELECT/INSERT a `threads`-en és a `messages`-en, UPDATE **csak a `threads`-en** (az `updated_at` léptetéséhez); minden más tábla megtagadva, DELETE sehol, és a `messages` nem írható át — **append-only** |
| `szoba-kertesz_package` | `DATABASE_URL_PACKAGE` | SELECT a `products`-on és a `customers`-en (determinisztikus ellenőrzés, nem modell-generált SQL); SELECT/INSERT a `packages`-en és a `package_items`-en, se UPDATE, se DELETE — **append-only**, a `threads`/`messages`/`knowledge_chunks` megtagadva |

A `messages` UPDATE-jét a `<ts>_messages_append_only` migráció vette vissza (a #8 PR review nyomán): a tár egyetlen művelete sem frissít üzenetet, tehát a grant tágabb volt, mint a kód — és az „append-only" állítást a DB nem támasztotta alá. Mérve: `UPDATE messages` → `permission denied`, `UPDATE threads` → `UPDATE 0`.

### Értékkészletek (kategorikus mezők)

- **category:** szobanövény, kerti, pozsgás, kaktusz, fűszer, fa-cserje, lógó, virágzó
- **location:** beltéri, kültéri, mindkettő
- **light:** árnyék, alacsony, közepes, erős, direkt nap
- **watering:** ritka, közepes, gyakori, állandóan nedves
- **difficulty:** kezdő, haladó, profi
- **bool:** pet_safe, kid_safe, air_purifying