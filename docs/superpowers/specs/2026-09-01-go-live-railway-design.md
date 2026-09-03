# Go-live Railwayen — design

> **Kör B** a 2026-08-31-i állapotfelmérésből: a négy tételből a negyedik. A Kör A (doksi-szinkron,
> MI-felirat, ROI) lezárva — `d0e0b1b`, PR #13. Nem kurzus-alkalom: a 11–13. alkalomhoz nem
> tartozik kurzus-kód, ezek a meglévő munka **kitelepítéséről** szólnak.

## Mit rögzít ez a doksi

Mit telepítünk ki, milyen védelemmel, és minden döntésnél azt is, mit vetettünk el és miért.

Egy mondatban a kör tétje: **a kitelepítés nem „ugyanaz, csak máshol" — minőségileg más rendszert
csinál abból, ami eddig `localhost`-on futott.** Két dolog, ami ma vállalt korlát, holnap valódi
kár: a hitelesítés nélküli beszélgetés-tár, és — ezt eddig **egyetlen dokumentum sem nevezte
meg** — a hitelesítés nélküli, valódi pénzt költő `/api/chat`.

## Kiindulási állapot — mérve, nem feltételezve

Minden alábbi állítás a repóból származik, **2026-09-01-én** mérve.

### A repó

`master` = `d0e0b1b`, 555 teszt zöld, master CI zöld. Munkaág: `feat/go-live-railway`, a masterről.

**Deploy-konfiguráció: nulla.** Nincs `railpack*`, `railway.json`, `Dockerfile`, `fly.toml`,
`vercel.json`, és nincs `pnpm demo` script sem. A `.github/workflows/` két fájlt tart (`ci.yml`,
`claude-review.yml`), egyik sem telepít.

### Amit ma egy publikus kitelepítés jelentene

| Mérés | Eredmény |
|---|---|
| `app.use(cors())` (`app.ts:142`) | **teljesen nyitott**, nincs origin-korlát |
| auth / rate limit / helmet a szerveren | **egyik sincs** — nulla találat |
| `/debug/knowledge` | ✅ helyesen `NODE_ENV === 'production'` mögött (`app.ts:148`) |

A `/debug` tehát rendben van. A másik két útvonal nincs:

1. **`GET /api/threads` és `/:id`** — bárki kilistázhat és elolvashat **minden** beszélgetést, a
   bennük tárolt `runSql`-kimenetekkel. A HF4 és a README is néven nevezi; eddig `localhost` volt.
2. **`POST /api/chat`** — hitelesítés és rate limit nélkül **valódi pénzt költ**. Aki megtalálja
   az URL-t, a projekt Anthropic- és OpenAI-keretét égeti. **Ezt eddig egyetlen dokumentum sem
   nevezte meg**: sem a HF4 három gyengesége, sem a README négy tételes korlát-táblája.

### A két migrációs blokkoló

**A repó PUBLIKUS** (`gh repo view`: `visibility: PUBLIC`). Ebben a repóban:

```sql
CREATE ROLE "szoba-kertesz_ro" LOGIN PASSWORD 'szoba-kertesz_ro';
```

Mind a **három** szerep jelszava azonos a nevével, és ez így áll a
`20260816191657_db_roles` és a `20260822112826_chat_role` migrációban (valamint az
`init.sql`-ben). Lokálisan ártalmatlan — a Postgres a `localhost:5433`-on ül. Egy internetről
elérhető éles adatbázisnál viszont ez **közvetlen írási út a katalógusba** a `_rw` szerepen.

A második, ami **kemény akadály**: mindhárom migráció `GRANT CONNECT ON DATABASE "szoba-kertesz"`-t
ír, be van drótozva a név. Egy `railway` vagy `postgres` nevű adatbázison a `migrate deploy`
**elhasal**, tehát a kitelepítés el sem indul.

### Amivel viszont nincs baj

- `CREATE EXTENSION IF NOT EXISTS "vector"` **migrációban** van
  (`20260819075630_knowledge_chunks`), és mind a négy szerep grantja is migrációban — egy üres
  éles adatbázis `migrate deploy`-jal felépül.
- A `main.ts` már **fail-fast**: `loadConfig()` és egy külön `DATABASE_URL_CHAT`-ellenőrzés,
  magyar üzenettel és `process.exit(1)`-gyel. Az új titok-ellenőrzés ebbe a mintába illik.
- A `PORT` már env-ből jön (`main.ts`) — a Railway ezt állítja be.
- A **Railway ad pgvectort**: egykattintásos sablon, és mivel a Postgres konténerben fut, teljes
  a kontroll a kiterjesztések felett — tehát `CREATE EXTENSION` **és** `CREATE ROLE` is megy.

### A build-valóság

| | |
|---|---|
| `apps/server` | **CJS**, `bundle: false`, kimenet `apps/server/dist/main.js` (mellette `apps/`, `packages/`) |
| `apps/web` | Vite, kimenet `apps/web/dist` (`index.html` + `assets/`) |
| extra | van `prune` target (`@nx/js:prune-lockfile` + `copy-workspace-modules`), ami Node-deployhoz `dist/package.json`-t és lockfile-t generál |

A CJS azért számít, mert `__dirname` rendelkezésre áll — a webes `dist` útja futásidőben
feloldható.

## Döntések

| # | Döntés | Amit elvetettünk, és miért |
|---|---|---|
| 1 | **Deploy + megosztott titok az egész appra + rate limit** | Teljes auth tulajdonos-fogalommal: ez a helyes végállapot, de önmagában nagyobb, mint a deploy (DB-migráció, session, UI) · Csak deploy, védelem nélkül: a `/api/chat` bárkinek elérhető marad, és **valódi pénzt** költ · Csak védelem, deploy nélkül: nem lenne élő URL, a 11. alkalom végállapot-ellenőrzése nem teljesülne |
| 2 | **API + web + DB; az MCP marad stdio-n** | MCP streamable HTTP-n: a 09. kör 1. döntése hagyta ki, és **újabb nyitott pénztárca** lenne — az `ask_szobakertesz` hívásonként 3–8 cent, tehát saját kapuzást igényelne · Csak API, web nélkül: a demó értékének nagy része a böngészős chat |
| 3 | **Railway** | Hetzner/VPS + Docker Compose: a meglévő `docker-compose.yml` újrahasznosítható (már `pgvector/pgvector:pg16`), de TLS, reverse proxy, frissítés, backup — valódi üzemeltetés, ami ezt a kört megnyújtaná · Vercel + Fly + Neon szétosztva: három szolgáltató, és a `CREATE ROLE` a managed Postgresek környékén külön utat igényel, ami pont a négy-szerepes architektúránkat nehezíti · Spike előbb: a Railway pgvector-támogatását webkereséssel igazoltuk, nincs mit próbálni |
| 4 | **EGY service: az Express szolgálja ki a buildelt webet is** | Két service + token fejlécben: megtartaná a független telepíthetőséget, de UI-munka (token-bekérő), és a **webes felület maga továbbra is bárki által böngészhető** maradna · Két service + Basic auth mindkettőn: a cross-origin `fetch` és a Basic auth együtt körülményes (credentials + preflight), több hibalehetőség, mint amennyit spórol. **A választott út mellékhatása a legfontosabb: a nyitott `cors()` problémája megszűnik, nem megkerüljük** |
| 5 | **Az éles adatbázis neve `szoba-kertesz`** | A régi migráció átírása: a Prisma checksumot tárol az alkalmazott migrációkról, az átírás a fejlesztői adatbázison **drift-hibát** okozna · Új migráció dinamikus `GRANT`-tal: nem segít, mert a **régi** migráció hasal el előbb egy másképp nevezett adatbázison. **Vállalt ár:** a név telepítési invariáns lesz — ezt a deploy-ellenőrzőlista 1. pontja mondja ki |
| 6 | **A szerep-jelszavak bootstrap scriptből, env-ből, a `migrate deploy` ELŐTT** | Jelszó a migrációban: a Prisma-migráció statikus SQL, **nem tud env-et olvasni** · `ALTER ROLE` egy későbbi migrációban: ugyanaz a gond. A megoldás a migráció saját `IF NOT EXISTS` őrén áll: ha a szerep már létezik erős jelszóval, a migráció **nem hozza létre újra**, csak a grantokat teszi rá |
| 7 | **A default-jelszó tiltását MEGFIGYELHETŐEN ellenőrizzük** | „A script lefutott" mint bizonyíték: a projekt szabálya szerint a „fájl tartalmazza X-et" sosem érvényes igazolás. Helyette: egy ellenőrző **megpróbál csatlakozni a default jelszóval**, és ha élesben ez **sikerül**, a lépés megbukik |
| 8 | **Basic auth kézzel, rate limit függőséggel** | Basic auth csomagból: ~15 sor `node:crypto` `timingSafeEqual`-lal, egy függőség nem éri meg · Rate limit kézzel: a proxy mögötti kliens-IP és a szabványos fejlécek kezelése hibaérzékeny — az `express-rate-limit` bevált és apró. **Railway proxy mögött `app.set('trust proxy', 1)` kell**, különben minden kérés egy IP-ről látszik |
| 9 | **Élesben a szerver el sem indul a titok nélkül** | Ha-van-env-akkor-véd: a hiányzó változó **némán** kapcsolná ki a védelmet. A `main.ts` már két ilyen fail-fast ellenőrzést tart (`loadConfig`, `DATABASE_URL_CHAT`) — ez a harmadik, ugyanazzal a mintával. Lokálisan (nem `production`) nincs jelszó, a fejlesztés változatlan |
| 10 | **Élesben a `DATABASE_URL_READWRITE` NINCS beállítva** | Beállítani „hátha kell": a szerver `role: 'customer'`-t pinnel, tehát a `delegateToIngest` be sem kerül a toolkészletbe. Env nélkül az **író pool létre sem jön** — két független réteg, ingyen. Az ingest továbbra is a CLI-ből, lokálisan megy |

## A leadandók

### 1. Védelem (`apps/server`)

- **Basic auth middleware** az egész appra, `node:crypto` `timingSafeEqual`-lal. Élesben
  kötelező (9. döntés), lokálisan kikapcsolt.
- **Rate limit** a `/api/chat`-en (`express-rate-limit`), `trust proxy`-val.
- **A `cors()` élesben NEM kerül mountolásra** (nem szűkítve — egyáltalán nem). Azonos origin
  mellett nincs rá szükség, és ami nincs ott, azt nem lehet elrontani. Lokálisan (nem
  `production`) marad, mert ott a web a 4200-on, az API a 3000-en fut. Ugyanaz a `NODE_ENV`-őr,
  ami a `/debug/knowledge`-et is kapuzza.

### 2. Statikus kiszolgálás (`apps/server`)

Az `apps/web/dist` kiszolgálása `express.static`-kal, SPA-fallbackkel az `index.html`-re, **az
`/api` route-ok UTÁN mountolva**. Az út env-ből jön (`WEB_DIST`), `__dirname`-relatív
alapértelmezéssel; élesben a hiányzó könyvtár **fail-fast**, mert a kör lényege pont az egy
service.

### 3. Éles adatbázis-bootstrap

- Script, ami a három szerepet **env-ből vett jelszóval** hozza létre, a `migrate deploy` **előtt**.
- Ellenőrző, ami a default jelszóval **próbál** csatlakozni, és élesben elvárja a **kudarcot**.

### 4. Railway-konfiguráció és deploy-ellenőrzőlista

Build- és start-konfiguráció a `app` service-hez, valamint egy dokumentum (`docs/deploy.md`), ami
sorrendben leírja: adatbázis `szoba-kertesz` néven → szerep-bootstrap → `migrate deploy` →
`db:seed` → `knowledge:ingest` (**~2 Ft**) → titkok → füstteszt.

### 5. Dokumentáció

A `README.md` „Vállalt korlátok" táblája bővül a **`/api/chat` költség-kitettségével** (ma
hiányzik onnan), és a megoldott tételek státusza frissül.

## Ami tudatosan KIMARAD

- **MCP streamable HTTP-n és MCPB** — 2. döntés.
- **Valódi felhasználó-kezelés, tulajdonos-fogalom, megőrzési idő** — a Basic auth ezeket
  **nem** oldja meg, csak elzárja. A README-ben kimondva maradnak.
- **Saját domain, monitoring, riasztás, backup-stratégia** a Railway alapértelmezésein túl.
- **A `packages/core` nem változik.** A védelem és a statikus kiszolgálás felület-dolga; a
  bootstrap script `packages/db` vagy `apps/cli` oldalon él.
- **Nem futtatunk fizetős MÉRÉST** (battery, RAG-eval, golden set). **Két fizetős lépés viszont
  a kitelepítés része, és ezt ki kell mondani, mert a 2–3. sikerkritérium enélkül
  teljesíthetetlen:** a `knowledge:ingest` az éles adatbázisra (**~2 Ft**), és a füstteszt két
  valódi kérdése az éles végponton (egy katalógus- és egy gondozási kérdés, együtt **~5 Ft**).
  Ez nem mérés, hanem annak igazolása, hogy a kitelepített rendszer **működik** — és egy
  go-live, amit nem próbáltunk ki élesben, nem go-live.

## Sikerkritériumok — megfigyelhető viselkedés

1. **Az éles URL jelszó nélkül nem ad tartalmat.** Böngészőből 401, `curl` jelszó nélkül 401 —
   a **webes felületre is**, nem csak az API-ra.
2. **Jelszóval a chat végigmegy**, és a válasz **valódi éles adatból** jön: egy katalógus-kérdés
   száma egyezik azzal, amit az éles adatbázisban látunk.
3. **A RAG él élesben**: egy gondozási kérdés forrásmegjelöléses választ ad.
4. **A default jelszavas kapcsolat elutasítva.** Az ellenőrző a három szerep default jelszavával
   próbál csatlakozni az éles adatbázishoz, és **mindhárom kudarcot vall**.
5. **A szerver élesben nem indul el a titok nélkül** — magyar üzenet és `exit 1`, spec pinneli.
6. **A rate limit tényleg fog**: a beállított küszöb feletti kérés 429-et kap.
7. **Az írási út élesben nem létezik**: `DATABASE_URL_READWRITE` nincs beállítva, és ezt a
   deploy-ellenőrzőlista kimondja.
8. **A `/debug/knowledge` élesben 404** — a meglévő spec már pinneli, éles környezetben is
   igazoljuk.
9. **A `packages/core` diffje üres** — a 08., 09. és a Kör A sorozata folytatódik.
10. **A csomag zöld marad**, és a teszt-szám az új védelem-specekkel **nő**.
