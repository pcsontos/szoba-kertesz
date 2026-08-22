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

### Értékkészletek (kategorikus mezők)

- **category:** szobanövény, kerti, pozsgás, kaktusz, fűszer, fa-cserje, lógó, virágzó
- **location:** beltéri, kültéri, mindkettő
- **light:** árnyék, alacsony, közepes, erős, direkt nap
- **watering:** ritka, közepes, gyakori, állandóan nedves
- **difficulty:** kezdő, haladó, profi
- **bool:** pet_safe, kid_safe, air_purifying