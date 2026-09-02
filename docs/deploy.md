# Kitelepítés Railway-re

> Ez a dokumentum a Task 6 (`docs/superpowers/plans/2026-09-01-go-live-railway.md`) **emberi**
> lépéséhez ad sorrendet: a Railway-fiók, a bankkártya és a titkok a felhasználóé, az agent nem
> hoz létre fiókot és nem visz be titkot idegen felületre. A háttér és az elvetett alternatívák a
> [`docs/superpowers/specs/2026-09-01-go-live-railway-design.md`](superpowers/specs/2026-09-01-go-live-railway-design.md)
> döntési táblájában vannak; itt csak a **mit és milyen sorrendben** áll.

A kitelepítés a Task 1–4 védelmi rétegére épül: Basic auth az egész szerveren, rate limit a
`/api/chat`-en, a buildelt web ugyanabból az Express service-ből (`apps/server`), és két
adatbázis-script (`pnpm db:roles`, `pnpm db:check-roles`) az éles szerep-jelszavakhoz. Ez a
dokumentum ezeket köti össze egyetlen, sorban lefuttatható lépéslistává.

## 1. Telepítési invariáns: az adatbázis neve `szoba-kertesz` KELL legyen

Mindhárom szerep-migráció a nevet **be van drótozva** hordozza:

```sql
GRANT CONNECT ON DATABASE "szoba-kertesz" TO "szoba-kertesz_ro";
```

Ez a `20260816191657_db_roles` migrációban (a `_ro` és `_rw` szerepre) és a
`20260822112826_chat_role` migrációban (a `_chat` szerepre) is így áll. Ha az éles Postgres
adatbázisa bármi más néven jön létre — Railway alapból pl. `railway`-nek nevezi —, a
`prisma migrate deploy` **elhasal** ezen a lépésen, és a kitelepítés el sem indul.

**A migráció átírását tudatosan elvetettük.** A Prisma checksumot tárol minden alkalmazott
migrációról; egy már alkalmazott migráció szövegének utólagos módosítása minden fejlesztői
adatbázison **checksum-driftet** okozna a következő `migrate deploy`-nál. Egy új migráció
dinamikus `GRANT`-tal sem segítene: a **régi** migráció hasalna el előbb, egy másképp nevezett
adatbázison — a végrehajtási sorrenden ez nem segít.

**Vállalt ár:** a név telepítési invariáns marad. Amikor a Railway Postgres-projekt létrejön,
gondoskodni kell róla, hogy az alkalmazás által használt adatbázis neve pontosan `szoba-kertesz`
legyen (a szolgáltatás admin kapcsolatán `CREATE DATABASE "szoba-kertesz";`, vagy a sablon saját
adatbázis-név mezőjében beállítva) — **mielőtt** bármelyik migráció lefut rajta.

## 2. Railway Postgres, pgvector-sablonnal

Ne az alap Postgres-pluginnal indulj: a `20260819075630_knowledge_chunks` migráció
`CREATE EXTENSION IF NOT EXISTS "vector"`-t futtat, és a tudásbázis pgvector nélkül nem épül fel.
A Railway marketplace-én keress a **Postgres pgvector** sablonra (nem az alap „PostgreSQL"
pluginra) — ez egy konténerben futó, saját Postgres, tehát nem osztott/managed szolgáltatás:
teljes admin-kontroll van felette. Ez azért számít, mert két dolgot kér a rendszer, amit egy
harmadik féltől bérelt managed Postgres (pl. Supabase, RDS) tipikusan nem enged meg:

- `CREATE EXTENSION "vector"` — a tudásbázishoz,
- `CREATE ROLE` — a négy szerep (`_ro`, `_rw`, `_chat`, és az admin) mindegyikéhez.

A Railway konténeres Postgresén mindkettő megy, kompromisszum nélkül.

## 3. A kitelepítés parancssori sorrendje

A sorrend **szándékosan** ez, és a sorrend maga hordoz egy biztonsági döntést:

```bash
pnpm db:roles         # erős jelszavak env-ből — MIELŐTT bármi migrálna
pnpm db:migrate       # prisma migrate deploy — séma + a négy szerep grantjai
pnpm db:seed          # 30 növény + 20 ügyfél
pnpm knowledge:ingest # ⚠️ FIZETŐS, ~2 Ft — 202 cikk → 1906 vektorizált chunk
pnpm db:check-roles   # ⚠️ el KELL utasítania mindhárom alapértelmezett jelszót — zöldet kell adnia
```

**Miért a `db:roles` fut a `db:migrate` ELŐTT, nem utána?** A `<ts>_db_roles` /
`<ts>_chat_role` migráció statikus SQL — a Prisma-migráció nem tud környezeti változót
olvasni, ezért a szerepek létrehozó SQL-je a migrációban egy fix, a szerep nevével azonos
jelszót ír (`CREATE ROLE "szoba-kertesz_ro" LOGIN PASSWORD 'szoba-kertesz_ro'`, és így a másik
kettő is). Ez a **repó publikus**, tehát ez a jelszó bárki számára ismert. A `bootstrap-roles.ts`
(`pnpm db:roles`) ezért **előbb** fut: env-ből (`DB_ROLE_PASSWORD_RO` / `_RW` / `_CHAT`, mind
legalább 16 karakter) erős jelszóval hozza létre (vagy módosítja) a három szerepet a
`DATABASE_URL` admin-kapcsolaton. Amikor utána a migráció lefut, annak saját
`IF NOT EXISTS`-őre látja, hogy a szerepek **már léteznek** — nem hozza létre újra (tehát a
gyenge, szerepnévvel azonos jelszó **sosem** kerül az éles adatbázisra), csak a `GRANT`-jait
alkalmazza rájuk. A három jelszó-változó (`DB_ROLE_PASSWORD_RO/_RW/_CHAT`) csak ehhez az egy
paranccsal kell — **nem** Railway service-változó, egyszeri bootstrap-titok az operátor
gépéről vagy egy Railway shell-munkamenetből futtatva, generáláshoz pl. `openssl rand -base64 24`.

A `db:migrate` után a `DATABASE_URL_READONLY` és `DATABASE_URL_CHAT` service-változókat a most
beállított erős jelszavakkal kell megadni (lásd a 4. pont táblázatát) — `_ro` és `_chat`
szerepnévvel, a `bootstrap-roles`-nak átadott jelszóval, az éles host/port/db-vel.

A `pnpm knowledge:ingest` és a füstteszt (5. pont) valódi, fizetős API-hívásokat indít — ez a
kitelepítés **egyetlen** két pontja, ahol tényleges pénz megy el; máshol a lépések ingyenesek.

## 4. A beállítandó titkok (Railway service-változók, `app` service)

| Változó | Kötelező | Megjegyzés |
|---|---|---|
| `ANTHROPIC_API_KEY` | igen | a válaszmodell (Sonnet 4.6) |
| `OPENAI_API_KEY` | igen | a RAG embeddingje enélkül elhasal — a `searchKnowledge` bukik, a katalógus-oldal enélkül is működne |
| `DATABASE_URL` | igen | admin — migráció, seed, tudásbázis-betöltés |
| `DATABASE_URL_READONLY` | igen | `szoba-kertesz_ro` — a `runSql` / `listCategories` / `queryCustomers` útja |
| `DATABASE_URL_CHAT` | igen | `szoba-kertesz_chat` — enélkül a szerver **el sem indul** (`main.ts` fail-fast) |
| `DATABASE_URL_READWRITE` | **NEM** | **szándékosan hiányzik** — a `role: 'customer'` pin miatt a `delegateToIngest` be sem kerül a query-agent toolkészletébe, és env nélkül az író pool **létre sem jön**: két független réteg, ingyen. Az ingest továbbra is a CLI-ből, lokálisan megy. |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | igen | enélkül a szerver élesben (`NODE_ENV=production`) **nem indul** — a `/api/chat` hitelesítés nélkül valódi pénzt költene, a `/api/threads` pedig minden beszélgetést kiadna |
| `NODE_ENV=production` | igen | ez kapcsolja ki a nyitott `cors()`-t **és** a `/debug/knowledge`-et |
| `CHAT_RATE_LIMIT` / `CHAT_RATE_WINDOW_MS` | nem | alap: 20 kérés / 60 000 ms (perc) |
| `WEB_DIST` | nem | alap: `apps/web/dist` — csak akkor kell felülírni, ha a Railway build-kimenete máshová kerül |

A `DATABASE_URL_READWRITE` sora nem hiányosság, hanem **döntés**: ha „hátha kell" alapon mégis
beállítanánk, az önmagában nem nyitna biztonsági rést (a szerep-pin a döntő), de fölöslegesen
tartana életben egy írási utat, aminek élesben semmi dolga — az `upsertProduct` a `pnpm cli
ingest` parancson keresztül, lokálisan fut, nem a webes felületről.

## 5. Füstteszt (⚠️ FIZETŐS, ~5 Ft) és a rate limit indoklása

Miután a service fut és a fenti szekvencia lezajlott:

1. Jelszó **nélkül** a gyökér (`/`), az `/api/threads` és — élesben — a `/debug/knowledge/sources`
   is **401**-et (az utóbbi 401-et *vagy* 404-et) kell adjon; egyik sem adhat tartalmat.
2. Jelszóval bejelentkezve a böngészőben tegyél fel **egy katalógus-kérdést** — a válaszban
   szereplő számnak egyeznie kell azzal, amit közvetlenül az éles adatbázisban látsz —, és
   **egy gondozási kérdést**, aminek forrásmegjelöléses választ kell adnia (a RAG-pipeline
   élesben is fut).
3. `pnpm db:check-roles` az éles `DATABASE_URL`-lel: **zöldet** kell adjon — mind a három szerep
   elutasítja a saját nevével azonos, alapértelmezett jelszót.

**A rate limit alapértékének (20 kérés/perc) indoklása.** A `docs/roi.md` 4.3 pontja szerint egy
gondozási kérdés **felső vége** **$0,0458** (≈ 17,4 Ft) — ez **nem** egyetlen mért szám, hanem a
`rag-care-source` esetben (`logs/autotest/…battery.json`) **mért** válasz-réteg költség
(**$0,0403**) plusz a RAG-pipeline (HyDE + rerank + embedding) karakterszámból **BECSÜLT**
kb. $0,0055-je (roi.md 4.1/4.3) — kerekítve **$0,046**. Ha valaki a megosztott
Basic auth-jelszóval a percenkénti keretet folyamatosan kitölti, a felső kockázat:

```
20 kérés/perc × $0,046 ≈ $0,92/perc
```

Ez az összeg indokolja, hogy a `CHAT_RATE_LIMIT` alapértéke ne legyen ennél nagyvonalúbb: egy
elszabadult script vagy egy megosztott jelszóval visszaélő fél így percenként legfeljebb kb.
egy dollárnyi API-költséget tud okozni, nem korlátlant. Ez **mérséklés, nem megoldás** — lásd a
README „Vállalt korlátok" táblájának új sorát: a jelszót ismerő bárki továbbra is tud pénzt
költeni, csak korlátozott ütemben.

## Ellenőrző lista (Task 6.4 mintája)

```bash
curl -s -o /dev/null -w 'gyökér jelszó nélkül: %{http_code}\n' https://<host>/
curl -s -o /dev/null -w 'API jelszó nélkül:    %{http_code}\n' https://<host>/api/threads
curl -s -o /dev/null -w 'debug élesben:        %{http_code}\n' https://<host>/debug/knowledge/sources
```

Elvárt: **401**, **401**, **401 vagy 404**.
