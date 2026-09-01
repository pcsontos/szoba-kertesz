# Go-live Railwayen — végrehajtási terv

> **Agent-végrehajtóknak:** KÖTELEZŐ AL-SKILL: `superpowers:subagent-driven-development`
> (ajánlott) vagy `superpowers:executing-plans`. A lépések checkbox (`- [ ]`) jelölést
> használnak; a jelölők átírása KÉZI, és mindig KÜLÖN, dokumentum-jellegű commit.

**Cél:** a szoba-kertész kikerül élesbe Railwayre — **egy** service-ként, amely az API-t és a
buildelt webet is kiszolgálja, Basic auth mögött, rate limittel, erős adatbázis-jelszavakkal.

**Megközelítés:** a védelem és a statikus kiszolgálás az `apps/server`-ben él; a `packages/core`
nem változik. A szerep-jelszavak egy bootstrap scriptből, env-ből jönnek, a `migrate deploy`
**előtt** — a migráció `IF NOT EXISTS` őre miatt így nem íródnak felül a gyenge alapértelmezéssel.

**Tech stack:** Express 5.2.1 · `express-rate-limit` (új függőség) · `node:crypto` timing-safe
összehasonlítás · `pg` (gyökér-függőség) · `tsx` operációs scriptekhez · Railway (konténeres
Postgres + pgvector) · Vitest.

**Spec:** `docs/superpowers/specs/2026-09-01-go-live-railway-design.md`

## Globális megkötések

- **Az `app.ts` MELLÉKHATÁS-MENTES marad.** A hitelesítő adatok és a web-dist útja **opcióként**
  érkeznek (mint a meglévő `ask` és `store`); env-et **csak a `main.ts` olvas**. Ez a meglévő
  szétválasztás, ne bontsd meg.
- **Express 5 wildcard — MÉRVE 2026-09-01-én a telepített 5.2.1-en:** `app.get('*')` **DOB**
  (`Missing parameter name at index 1`). A SPA-fallback **nevesített** wildcarddal megy:
  `app.get('/*splat', …)`.
- **`packages/core` NEM változik.** A záró ellenőrzés üres diffet vár.
- **`SYSTEM_PROMPT` bájtazonosság** érintetlen.
- **Tesztet `nx`-en át futtatunk**, sosem közvetlen `vitest`-tel.
- **Buktató (mérve a Kör A-ban):** a `lint typecheck build` egyben futtatva a `web:typecheck`-en
  TS6305-tel bukhat. Mindig így futtasd:
  `rm -rf apps/web/dist apps/web/out-tsc && pnpm nx run-many -t lint typecheck && pnpm nx run-many -t build`.
  Az Nx a végén zöld futásnál is kiír egy „flaky task" bannert — az igazságot a
  `Successfully ran…` sor mondja.
- **Markdownt idézett heredoc-kal** írunk (`<<'EOF'`).
- **Commit:** magyar, `<type>: <leírás> (Task N)`, felsorolásos törzs, **trailer nélkül**.
- **Nem pusholunk és nem nyitunk PR-t** külön kérés nélkül.
- **Titkot soha nem írunk fájlba, és nem commitolunk.** A `.env` gitignore-olt; a Railway-titkokat
  a **felhasználó** viszi be a Railway felületén — ezt az agent nem teheti meg helyette.

---

## Fájl-térkép

| Fájl | Felelősség | Task |
|---|---|---|
| `apps/server/src/lib/basic-auth.ts` | **ÚJ** — Basic auth middleware, konstans idejű összehasonlítással | 1 |
| `apps/server/src/lib/basic-auth.spec.ts` | **ÚJ** — a middleware viselkedése | 1 |
| `apps/server/src/app.ts` | az auth, a rate limit és a statikus kiszolgálás bekötése | 1–3 |
| `apps/server/src/main.ts` | fail-fast élesben a hiányzó titokra | 1 |
| `apps/server/src/app.spec.ts` | route-szintű tesztek (401, 429, statikus) | 1–3 |
| `apps/server/package.json` | `express-rate-limit` felvétele | 2 |
| `apps/server/src/lib/web-dist.ts` | **ÚJ** — a web `dist` útjának feloldása | 3 |
| `apps/server/src/lib/web-dist.spec.ts` | **ÚJ** — az útfeloldás | 3 |
| `packages/db/prisma/bootstrap-roles.ts` | **ÚJ** — a három szerep env-ből vett jelszóval | 4 |
| `packages/db/prisma/check-role-passwords.ts` | **ÚJ** — a default jelszó ELUTASÍTÁSÁT méri | 4 |
| `package.json` | `db:roles` és `db:check-roles` scriptek | 4 |
| `railway.json` | **ÚJ** — build- és start-parancs | 5 |
| `docs/deploy.md` | **ÚJ** — a kitelepítés sorrendje | 5 |
| `README.md` | korlát-tábla + deploy-mutató | 5 |

---

## Task 1: Basic auth

**Fájlok:**
- Létrehoz: `apps/server/src/lib/basic-auth.ts`, `apps/server/src/lib/basic-auth.spec.ts`
- Módosít: `apps/server/src/app.ts` (a `createApp` opciói + a mount), `apps/server/src/main.ts`

**Interfészek:**
- Előállítja: `createBasicAuth(expected: BasicAuthCredentials): RequestHandler` és
  `interface BasicAuthCredentials { readonly user: string; readonly password: string }`.
- Előállítja: a `CreateAppOptions` új, opcionális `auth?: BasicAuthCredentials` mezője.
  A Task 2 és 3 ugyanezt az opció-objektumot bővíti tovább.

- [ ] **1.1 lépés: a bukó teszt megírása**

Hozd létre `apps/server/src/lib/basic-auth.spec.ts` néven. **Ebben a csomagban a `vitest`
neveit EXPLICITEN importáljuk** — az `app.spec.ts` is így teszi:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { createBasicAuth } from './basic-auth.js';

/**
 * A kapu, ami élesben az EGÉSZ appot fedi — a webes felületet is. Ezért a viselkedését
 * külön mérjük, nem csak route-szinten: egy elrontott fejléc-parse NÉMÁN átengedne.
 */

function fakeRes() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 0,
    body: '',
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(body: string) {
      this.body = body;
      return this;
    },
  };
}

function run(authorization: string | undefined) {
  const middleware = createBasicAuth({ user: 'demo', password: 'titkos-jelszo' });
  const req = { headers: authorization ? { authorization } : {} } as unknown as Request;
  const res = fakeRes();
  const next = vi.fn();
  middleware(req, res as unknown as Response, next);
  return { res, next };
}

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`;
}

describe('createBasicAuth', () => {
  it('a helyes jelszót átengedi', () => {
    const { res, next } = run(basic('demo', 'titkos-jelszo'));
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it('fejléc nélkül 401-et ad, ÉS kiírja a WWW-Authenticate-et', () => {
    // A WWW-Authenticate nélkül a böngésző nem dobna fel jelszó-ablakot, csak egy
    // üres 401-es oldalt — a kapu működne, de használhatatlan lenne.
    const { res, next } = run(undefined);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.headers['WWW-Authenticate']).toContain('Basic');
  });

  it('rossz jelszóra 401', () => {
    const { res, next } = run(basic('demo', 'rossz'));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('rossz felhasználónévre 401', () => {
    const { res, next } = run(basic('masvalaki', 'titkos-jelszo'));
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('más sémára (Bearer) 401', () => {
    const { res, next } = run('Bearer titkos-jelszo');
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('kettőspont nélküli, hibás base64-tartalomra 401 — nem dobás', () => {
    // Ha ez DOBNA, a hibás fejléc 500-at adna, és a stack trace kiszivárogna.
    const encoded = Buffer.from('nincs-ketttospont', 'utf8').toString('base64');
    const { res, next } = run(`Basic ${encoded}`);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it('a jelszó ELEJE nem elég — a részleges egyezés is 401', () => {
    const { res } = run(basic('demo', 'titkos'));
    expect(res.statusCode).toBe(401);
  });
});
```

- [ ] **1.2 lépés: futtatás — BUKNIA kell**

```bash
pnpm nx test server
```

Elvárt: mind a hét eset **BUKIK**, `Cannot find module './basic-auth.js'` jellegű hibával.

- [ ] **1.3 lépés: a middleware megírása**

Hozd létre `apps/server/src/lib/basic-auth.ts` néven:

```ts
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler, Response } from 'express';

// basic-auth.ts — A KAPU. Élesben ez fedi az EGÉSZ appot: az /api-t ÉS a webes felületet is,
// tehát az URL még csak nem is böngészhető jelszó nélkül.
//
// MIÉRT KÉZZEL, és miért nem csomagból? Mert ez ~40 sor, a `node:crypto` mindent ad hozzá, és
// egy függőség kevesebb. A rate limitnél FORDÍTVA döntöttünk (lásd Task 2): ott a proxy mögötti
// kliens-IP és a szabványos fejlécek kezelése az, ami hibaérzékeny.
//
// MIÉRT `timingSafeEqual`? Mert a `===` korán kilép az első eltérő bájtnál, és a válaszidőből
// karakterenként ki lehetne találni a jelszót. Ez a kapu az egyetlen védelem — nem engedhetjük
// meg, hogy kimérhető legyen.

export interface BasicAuthCredentials {
  readonly user: string;
  readonly password: string;
}

/**
 * Konstans idejű összehasonlítás. Eltérő hossznál a `timingSafeEqual` DOBNA, ezért előbb
 * hosszt nézünk — ez a puszta hosszt kiszivárogtatja, ami egy jelszónál vállalható, a
 * dobásból származó 500-as viszont nem lenne az.
 */
function safeEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

function challenge(res: Response): void {
  // A WWW-Authenticate nélkül a böngésző nem dob fel jelszó-ablakot.
  res.setHeader('WWW-Authenticate', 'Basic realm="Szobakertesz", charset="UTF-8"');
  res.status(401).send('Hitelesítés szükséges.');
}

export function createBasicAuth(
  expected: BasicAuthCredentials,
): RequestHandler {
  return (req, res, next) => {
    const header = req.headers.authorization ?? '';
    const separator = header.indexOf(' ');
    const scheme = separator === -1 ? '' : header.slice(0, separator);
    const encoded = separator === -1 ? '' : header.slice(separator + 1);

    if (scheme.toLowerCase() !== 'basic' || encoded === '') {
      challenge(res);
      return;
    }

    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon === -1) {
      challenge(res);
      return;
    }

    // MINDKETTŐT kiértékeljük, mielőtt döntünk: a rövidzár a felhasználónévnél
    // elárulná, hogy a név helyes volt-e.
    const userOk = safeEqual(decoded.slice(0, colon), expected.user);
    const passwordOk = safeEqual(decoded.slice(colon + 1), expected.password);
    if (!userOk || !passwordOk) {
      challenge(res);
      return;
    }

    next();
  };
}
```

- [ ] **1.4 lépés: futtatás — ZÖLDNEK kell lennie**

```bash
pnpm nx test server
```

Elvárt: mind a hét új eset zöld, a meglévő `server` tesztek érintetlenül zöldek.

- [ ] **1.5 lépés: bekötés az `app.ts`-be**

Az `apps/server/src/app.ts`-ben vedd fel az importot:

```ts
import { createBasicAuth, type BasicAuthCredentials } from './lib/basic-auth.js';
```

Bővítsd a `CreateAppOptions` interfészt (keresd meg a fájlban; ott van már `ask` és `store`):

```ts
  /**
   * Ha meg van adva, az EGÉSZ app Basic auth mögé kerül — az /api ÉS a statikus web is.
   * Az env-olvasás szándékosan a main.ts dolga: az app.ts mellékhatás-mentes marad.
   */
  readonly auth?: BasicAuthCredentials;
```

A `createApp` törzsében, **közvetlenül az `const app = express();` UTÁN, minden más mount ELŐTT**:

```ts
  // A kapu MINDEN elé kerül: a /debug, az /api és a statikus web is mögötte van.
  if (options.auth) {
    app.use(createBasicAuth(options.auth));
  }
```

- [ ] **1.6 lépés: route-szintű teszt az `app.spec.ts`-be**

Az `apps/server/src/app.spec.ts` végére.

> **ELŐBB bővítsd a fájl `start` helperjét** (a `app.spec.ts`-ben, a `fakeStore` alatt), hogy
> extra `createApp`-opciókat is át tudjon adni. A meglévő signature:
>
> ```ts
> async function start(
>   ask: AskFn,
>   store: ThreadStore = fakeStore().store,
> ): Promise<string> {
>   const app = createApp({ ask, store });
> ```
>
> Az új:
>
> ```ts
> async function start(
>   ask: AskFn,
>   store: ThreadStore = fakeStore().store,
>   extra: Parameters<typeof createApp>[0] = {},
> ): Promise<string> {
>   const app = createApp({ ask, store, ...extra });
> ```
>
> A fájl **nem használ `supertest`-et**: valódi `app.listen(0)`-t indít, és natív `fetch`-csel
> kérdez; a szervert az `afterEach` zárja. Kövesd ezt.

A tesztek:

```ts
describe('Basic auth az egész appon', () => {
  const auth = { user: 'demo', password: 'titkos-jelszo' };
  const header = (user: string, password: string) => ({
    authorization: `Basic ${Buffer.from(`${user}:${password}`, 'utf8').toString('base64')}`,
  });

  it('auth nélkül a /api/threads elérhető marad (fejlesztői mód)', async () => {
    const url = await start(async () => answer('x'));
    const response = await fetch(`${url}/api/threads`);
    expect(response.status).not.toBe(401);
  });

  it('auth-tal a /api/threads jelszó nélkül 401, WWW-Authenticate fejléccel', async () => {
    const url = await start(async () => answer('x'), fakeStore().store, { auth });
    const response = await fetch(`${url}/api/threads`);
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('Basic');
  });

  it('auth-tal a helyes jelszó átmegy', async () => {
    const url = await start(async () => answer('x'), fakeStore().store, { auth });
    const response = await fetch(`${url}/api/threads`, {
      headers: header('demo', 'titkos-jelszo'),
    });
    expect(response.status).toBe(200);
  });

  it('auth-tal a /api/chat is 401 — a FIZETŐS végpont sincs kint', async () => {
    const url = await start(async () => answer('x'), fakeStore().store, { auth });
    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: uiMessage('user', 'Hány kaktusz van?') }),
    });
    expect(response.status).toBe(401);
  });
});
```

- [ ] **1.7 lépés: fail-fast a `main.ts`-ben**

Az `apps/server/src/main.ts`-ben, a meglévő `DATABASE_URL_CHAT`-ellenőrzés **UTÁN**:

```ts
// A KAPU élesben KÖTELEZŐ. Ha csak "van env → véd" logika lenne, egy elfelejtett változó
// NÉMÁN kapcsolná ki a védelmet egy publikus URL-en — és a /api/chat valódi pénzt költ.
// Ugyanaz a fail-fast minta, mint fent: magyar üzenet, exit 1.
const isProduction = process.env.NODE_ENV === 'production';
const authUser = process.env['BASIC_AUTH_USER'];
const authPassword = process.env['BASIC_AUTH_PASSWORD'];

if (isProduction && (!authUser || !authPassword)) {
  console.error(
    'szobakertész szerver: hiányzó BASIC_AUTH_USER / BASIC_AUTH_PASSWORD — élesben ' +
      '(NODE_ENV=production) a szerver nem indul kapuzás nélkül. A /api/chat hitelesítés ' +
      'nélkül valódi pénzt költ, a /api/threads pedig minden beszélgetést kiadna.',
  );
  process.exit(1);
}
```

És a `createApp()` hívást cseréld erre:

```ts
createApp({
  auth: authUser && authPassword
    ? { user: authUser, password: authPassword }
    : undefined,
}).listen(port, () => {
```

- [ ] **1.8 lépés: a fail-fast élő igazolása**

```bash
NODE_ENV=production node apps/server/dist/main.js; echo "kilépési kód: $?"
```

**Előbb buildelj** (`pnpm nx run server:build`). Elvárt: magyar hibaüzenet a hiányzó
`BASIC_AUTH_*`-ról és **kilépési kód 1**. Ha elindul, a kapu élesben kikapcsolható lenne.

> Ha a futás előbb a `loadConfig()`-on vagy a `DATABASE_URL_CHAT`-en akad el, az is rendben —
> akkor add meg azokat a változókat, és ismételd, hogy a **BASIC_AUTH** ága bizonyítottan fusson.

- [ ] **1.9 lépés: lint + typecheck + build**

```bash
rm -rf apps/web/dist apps/web/out-tsc
pnpm nx run-many -t lint typecheck 2>&1 | grep -E "Successfully ran|Failed tasks"
pnpm nx run-many -t build 2>&1 | grep -E "Successfully ran|Failed tasks"
```

- [ ] **1.10 lépés: commit**

```bash
git add apps/server/src/lib/basic-auth.ts apps/server/src/lib/basic-auth.spec.ts \
        apps/server/src/app.ts apps/server/src/app.spec.ts apps/server/src/main.ts
git commit -F - <<'EOF'
feat: Basic auth az egész szerveren (Task 1)

A kitelepítés minőségileg mást csinál a szerverből: eddig localhoston
futott, élesben viszont a /api/threads MINDEN beszélgetést kiadna, a
/api/chat pedig hitelesítés nélkül VALÓDI PÉNZT költ.

- createBasicAuth: ~40 sor, node:crypto timingSafeEqual-lal. A === korán
  kilép az első eltérő bájtnál, amiből a válaszidőn keresztül
  karakterenként kitalálható lenne a jelszó
- a felhasználónevet és a jelszót MINDKETTŐT kiértékeljük, mielőtt
  döntünk: a rövidzár elárulná, hogy a név helyes volt-e
- WWW-Authenticate fejléc a 401-en, különben a böngésző nem dob fel
  jelszó-ablakot, csak egy üres oldalt
- a hibás fejléc 401-et ad, NEM dobást — a dobás 500-at adna stack
  trace-szel
- a kapu MINDEN mount elé kerül: a /debug, az /api és a statikus web is
  mögötte van

Élesben KÖTELEZŐ: a main.ts NODE_ENV=production mellett nem indul el a
titok nélkül (magyar üzenet, exit 1) — ugyanaz a fail-fast minta, mint
a loadConfig-nál és a DATABASE_URL_CHAT-nél. A "van env → véd" logika
egy elfelejtett változónál NÉMÁN kapcsolná ki a védelmet.

Az app.ts mellékhatás-mentes marad: a hitelesítő adat opcióként érkezik,
env-et csak a main.ts olvas.
EOF
```

---

## Task 2: Rate limit a `/api/chat`-en

**Fájlok:**
- Módosít: `apps/server/package.json` (függőség), `apps/server/src/app.ts`,
  `apps/server/src/app.spec.ts`

**Interfészek:**
- Használja: a Task 1 `CreateAppOptions` objektumát; új, opcionális mező:
  `readonly chatRateLimit?: { readonly windowMs: number; readonly limit: number }`.

- [ ] **2.1 lépés: a függőség felvétele**

```bash
pnpm add express-rate-limit --filter @szoba-kertesz/server
```

Ellenőrzés: `node -e "console.log(require('./apps/server/package.json').dependencies)"` — az
`express-rate-limit` szerepel benne.

- [ ] **2.2 lépés: a bukó teszt megírása**

Az `apps/server/src/app.spec.ts`-be. A chat-útvonal valódi streamet vár, ezért a fájl
`streamingAsk` helperjét használjuk, nem az `answer`-t:

```ts
describe('rate limit a /api/chat-en', () => {
  const post = (url: string) =>
    fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: uiMessage('user', 'Hány kaktusz van?') }),
    });

  it('a küszöb feletti kérés 429-et kap', async () => {
    // A /api/chat az EGYETLEN végpont, ami pénzt költ. Küszöb nélkül egy publikus URL
    // korlátlan számlát jelent — ezt VISELKEDÉSBEN mérjük, nem konfigban.
    const url = await start(streamingAsk('kész'), fakeStore().store, {
      chatRateLimit: { windowMs: 60_000, limit: 2 },
    });

    expect((await post(url)).status).not.toBe(429);
    expect((await post(url)).status).not.toBe(429);
    expect((await post(url)).status).toBe(429);
  });

  it('a /api/threads-et NEM korlátozza — az ingyenes, csak DB-t olvas', async () => {
    const url = await start(streamingAsk('kész'), fakeStore().store, {
      chatRateLimit: { windowMs: 60_000, limit: 1 },
    });
    await post(url);
    await post(url);

    const response = await fetch(`${url}/api/threads`);
    expect(response.status).not.toBe(429);
  });
});
```

- [ ] **2.3 lépés: futtatás — BUKNIA kell**

```bash
pnpm nx test server
```

Elvárt: a harmadik kérés **200-at** kap 429 helyett (nincs még limiter).

- [ ] **2.4 lépés: a limiter bekötése**

Az `app.ts` importjai közé:

```ts
import { rateLimit } from 'express-rate-limit';
```

A `CreateAppOptions`-be:

```ts
  /**
   * A /api/chat korlátja. Élesben kötelező (main.ts állítja be); tesztben kicsi értékekkel
   * injektáljuk, hogy a viselkedés gyorsan mérhető legyen.
   */
  readonly chatRateLimit?: { readonly windowMs: number; readonly limit: number };
```

A `createApp` törzsében, a Basic auth mount **után**, a `/api/chat` route **előtt**:

```ts
  // A Railway (mint minden PaaS) reverse proxy mögött futtat: enélkül MINDEN kérés a proxy
  // IP-jéről látszana, és a limiter globálissá válna — az első felhasználó kimerítené a
  // keretet mindenki elől. Egy proxy van köztünk, ezért 1.
  app.set('trust proxy', 1);

  const chatLimiter = options.chatRateLimit
    ? rateLimit({
        windowMs: options.chatRateLimit.windowMs,
        limit: options.chatRateLimit.limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: {
          error:
            'Túl sok kérés rövid idő alatt. Várj egy kicsit, aztán próbáld újra.',
        },
      })
    : undefined;
```

És a route-regisztrációt egészítsd ki a limiterrel. A meglévő sor:

```ts
  app.post('/api/chat', async (req: Request, res: Response) => {
```

helyett:

```ts
  const chatHandlers = chatLimiter ? [chatLimiter] : [];
  app.post('/api/chat', ...chatHandlers, async (req: Request, res: Response) => {
```

- [ ] **2.5 lépés: futtatás — ZÖLDNEK kell lennie**

```bash
pnpm nx test server
```

- [ ] **2.6 lépés: a limit bekötése a `main.ts`-be**

A `createApp({ auth: … })` hívást egészítsd ki:

```ts
  chatRateLimit: {
    windowMs: Number(process.env['CHAT_RATE_WINDOW_MS'] ?? 60_000),
    limit: Number(process.env['CHAT_RATE_LIMIT'] ?? 20),
  },
```

Alapértelmezés: **percenként 20 kérés** IP-nként. Ez egy demóhoz bőven elég, és a
`docs/deploy.md`-ben mért költséggel indokoljuk: 20 gondozási kérdés ≈ $0,92/perc felső korlát.

- [ ] **2.7 lépés: lint + typecheck + build**

```bash
rm -rf apps/web/dist apps/web/out-tsc
pnpm nx run-many -t lint typecheck 2>&1 | grep -E "Successfully ran|Failed tasks"
pnpm nx run-many -t build 2>&1 | grep -E "Successfully ran|Failed tasks"
```

- [ ] **2.8 lépés: commit**

```bash
git add apps/server/package.json apps/server/src/app.ts apps/server/src/app.spec.ts \
        apps/server/src/main.ts pnpm-lock.yaml
git commit -F - <<'EOF'
feat: rate limit a /api/chat-en (Task 2)

A /api/chat az EGYETLEN végpont, ami pénzt költ. A Basic auth kapuzza,
de egy megosztott jelszó mögött is korlátlan lenne a számla — a limit
tehát nem az auth helyett van, hanem mellette.

- express-rate-limit függőségként, ELLENTÉTBEN a Basic auth-tal, amit
  kézzel írtunk: itt a proxy mögötti kliens-IP és a szabványos fejlécek
  kezelése az, ami hibaérzékeny
- app.set('trust proxy', 1): Railway reverse proxy mögött futtat, enélkül
  MINDEN kérés a proxy IP-jéről látszana, a limiter globálissá válna, és
  az első felhasználó kimerítené a keretet mindenki elől
- a /api/threads NEM korlátozott: az ingyenes, csak DB-t olvas
- alapértelmezés percenként 20 kérés IP-nként

A teszt VISELKEDÉST mér, nem konfigot: három kérést indít 2-es limittel,
és a harmadiktól 429-et vár.
EOF
```

---

## Task 3: A web kiszolgálása ugyanabból a service-ből

**Fájlok:**
- Létrehoz: `apps/server/src/lib/web-dist.ts`, `apps/server/src/lib/web-dist.spec.ts`
- Módosít: `apps/server/src/app.ts`, `apps/server/src/main.ts`, `apps/server/src/app.spec.ts`

**Interfészek:**
- Előállítja: `resolveWebDist(candidate: string | undefined): string | null` — létező könyvtárra
  az abszolút utat adja, egyébként `null`-t.
- Előállítja: a `CreateAppOptions` új, opcionális `webDist?: string` mezője.

- [ ] **3.1 lépés: a bukó teszt megírása**

Hozd létre `apps/server/src/lib/web-dist.spec.ts` néven:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveWebDist } from './web-dist.js';

/**
 * Miért van erre külön modul és teszt? Mert a hibája NEM pirosat ad: ha az út rossz, a
 * szerver elindul, az /api működik, és a felhasználó egy 404-es üres oldalt kap —
 * a hiba csak élesben, böngészőben derülne ki.
 */

describe('resolveWebDist', () => {
  it('létező könyvtárra abszolút utat ad', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'webdist-'));
    await writeFile(join(dir, 'index.html'), '<html></html>', 'utf8');
    expect(resolveWebDist(dir)).toBe(dir);
  });

  it('nem létező útra null', () => {
    expect(resolveWebDist(join(tmpdir(), 'nincs-ilyen-konyvtar-remelem'))).toBeNull();
  });

  it('index.html nélküli könyvtárra null — a puszta létezés nem elég', async () => {
    // Egy üres dist ugyanolyan rossz, mint a hiányzó: a SPA-fallback 404-et adna.
    const dir = await mkdtemp(join(tmpdir(), 'webdist-ures-'));
    expect(resolveWebDist(dir)).toBeNull();
  });

  it('undefined-ra null', () => {
    expect(resolveWebDist(undefined)).toBeNull();
  });
});
```

- [ ] **3.2 lépés: futtatás — BUKNIA kell**

```bash
pnpm nx test server
```

- [ ] **3.3 lépés: a modul megírása**

Hozd létre `apps/server/src/lib/web-dist.ts` néven:

```ts
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

// web-dist.ts — HOL VAN A BUILDELT WEB. A 09. körig két service volt (Vite a 4200-on, Express
// a 3000-en); élesben EGY service szolgálja ki mindkettőt, mert így nincs cross-origin hívás,
// és a Basic auth a webes felületet is fedi.
//
// Az `index.html` meglétét is nézzük, nem csak a könyvtárét: egy üres vagy félig másolt dist
// ugyanolyan rossz, mint a hiányzó — a SPA-fallback 404-et adna, és a hiba csak böngészőben,
// élesben derülne ki.

export function resolveWebDist(candidate: string | undefined): string | null {
  if (candidate === undefined || candidate === '') {
    return null;
  }
  const absolute = isAbsolute(candidate)
    ? candidate
    : resolve(process.cwd(), candidate);
  return existsSync(resolve(absolute, 'index.html')) ? absolute : null;
}
```

- [ ] **3.4 lépés: futtatás — ZÖLDNEK kell lennie**

```bash
pnpm nx test server
```

- [ ] **3.5 lépés: a statikus kiszolgálás bekötése**

Az `app.ts` importjaihoz:

```ts
import { join } from 'node:path';
```

A `CreateAppOptions`-be:

```ts
  /** A buildelt web (`apps/web/dist`) útja. Ha nincs, az app csak API-t szolgál ki. */
  readonly webDist?: string;
```

A `createApp` **legvégére**, az **összes `/api` route UTÁN** (ez fontos: a fallback különben
elnyelné az API-hívásokat):

```ts
  // A buildelt web ugyanebből a service-ből. AZ ÖSSZES /api ROUTE UTÁN mountoljuk, különben
  // a SPA-fallback elnyelné őket.
  // Lokális konstans, hogy a closure-ben ne kelljen cast: a TypeScript az
  // `options.webDist`-et a callbacken belül nem szűkítené.
  const webDist = options.webDist;
  if (webDist) {
    app.use(express.static(webDist));
    // SPA-fallback. FIGYELEM: Express 5-ben a `app.get('*')` DOB
    // ("Missing parameter name at index 1") — mérve az 5.2.1-en. Nevesített wildcard kell.
    app.get('/*splat', (_req: Request, res: Response) => {
      res.sendFile(join(webDist, 'index.html'));
    });
  }
```

- [ ] **3.6 lépés: a `cors()` élesben ne mountolódjon**

Az `app.ts`-ben a `app.use(cors());` sort cseréld erre:

```ts
  // A cors() ÉLESBEN NEM KELL, és ezért nem is mountoljuk: egy service, egy origin — a
  // böngésző ugyanarról a hostról kéri az /api-t, ahonnan az oldalt kapta. Ami nincs ott,
  // azt nem lehet elrontani. Lokálisan viszont kell: ott a web a 4200-on, az API a 3000-en.
  if (process.env.NODE_ENV !== 'production') {
    app.use(cors());
  }
```

- [ ] **3.7 lépés: route-szintű teszt**

Az `app.spec.ts`-be. A fájl tetejére kellenek ezek az importok, ha még nincsenek ott:

```ts
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
```

A tesztek:

```ts
describe('a web kiszolgálása ugyanabból a service-ből', () => {
  async function webDistDir(prefix: string): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), prefix));
    await writeFile(join(dir, 'index.html'), '<html>szobakertesz-web</html>', 'utf8');
    return dir;
  }

  it('webDist nélkül az ismeretlen út 404 — nincs fallback', async () => {
    const url = await start(async () => answer('x'));
    const response = await fetch(`${url}/valami-ismeretlen`);
    expect(response.status).toBe(404);
  });

  it('webDist mellett az ismeretlen út az index.html-t kapja (SPA-fallback)', async () => {
    const url = await start(async () => answer('x'), fakeStore().store, {
      webDist: await webDistDir('webdist-app-'),
    });
    const response = await fetch(`${url}/valami-ismeretlen`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('szobakertesz-web');
  });

  it('a fallback NEM nyeli el az /api-t', async () => {
    // Ha a statikus mount az /api ELÉ kerülne, a thread-lista helyett index.html jönne —
    // és a chat NÉMÁN elromlana.
    const url = await start(async () => answer('x'), fakeStore().store, {
      webDist: await webDistDir('webdist-api-'),
    });
    const response = await fetch(`${url}/api/threads`);
    expect(await response.text()).not.toContain('szobakertesz-web');
  });
});
```

- [ ] **3.8 lépés: bekötés a `main.ts`-be**

Az importokhoz:

```ts
import { resolveWebDist } from './lib/web-dist.js';
```

A `createApp({...})` hívás elé:

```ts
// A buildelt web útja. Alapértelmezés a repo-elrendezés szerint; élesben a WEB_DIST env
// írja felül, mert ott a könyvtárszerkezet más lehet.
const webDist = resolveWebDist(
  process.env['WEB_DIST'] ?? join(process.cwd(), 'apps', 'web', 'dist'),
);

if (isProduction && webDist === null) {
  console.error(
    'szobakertész szerver: nem találom a buildelt webet (WEB_DIST vagy ' +
      'apps/web/dist, benne index.html). Élesben EGY service szolgálja ki az API-t ÉS a ' +
      'webet — enélkül a felhasználó üres 404-et kapna. Futtasd: pnpm nx run web:build',
  );
  process.exit(1);
}
```

És a `createApp` hívásba: `webDist: webDist ?? undefined,`

- [ ] **3.9 lépés: élő ellenőrzés egy service-ből**

```bash
pnpm nx run web:build
pnpm nx run server:build
BASIC_AUTH_USER=demo BASIC_AUTH_PASSWORD=proba node apps/server/dist/main.js &
sleep 3
curl -s -o /dev/null -w 'jelszó nélkül: %{http_code}\n' http://localhost:3000/
curl -s -o /dev/null -w 'jelszóval:     %{http_code}\n' -u demo:proba http://localhost:3000/
curl -s -o /dev/null -w 'API jelszóval: %{http_code}\n' -u demo:proba http://localhost:3000/api/threads
kill %1
```

Elvárt: **401**, **200**, **200**. Ha az első nem 401, a kapu nem fed mindent.

- [ ] **3.10 lépés: lint + typecheck + build + commit**

```bash
rm -rf apps/web/dist apps/web/out-tsc
pnpm nx run-many -t lint typecheck 2>&1 | grep -E "Successfully ran|Failed tasks"
pnpm nx run-many -t build 2>&1 | grep -E "Successfully ran|Failed tasks"

git add apps/server/src/lib/web-dist.ts apps/server/src/lib/web-dist.spec.ts \
        apps/server/src/app.ts apps/server/src/app.spec.ts apps/server/src/main.ts
git commit -F - <<'EOF'
feat: a web kiszolgálása ugyanabból a service-ből (Task 3)

Élesben EGY service szolgálja ki az API-t és a buildelt webet. Ez nem
csak takarékosság: a nyitott cors() problémája MEGSZŰNIK, mert nincs
cross-origin hívás — és a Basic auth így a webes FELÜLETET is fedi,
tehát az URL még csak nem is böngészhető.

- resolveWebDist: az index.html meglétét is nézi, nem csak a
  könyvtárét. Egy üres dist ugyanolyan rossz, mint a hiányzó, és a
  hibája NEM pirosat ad — a szerver elindulna, az /api menne, a
  felhasználó meg üres 404-et kapna
- a statikus mount az ÖSSZES /api route UTÁN van, különben a
  SPA-fallback elnyelné őket; erre külön teszt van
- SPA-fallback nevesített wildcarddal: Express 5-ben az app.get('*')
  DOB ("Missing parameter name at index 1") — mérve az 5.2.1-en
- a cors() élesben egyáltalán nem mountolódik (nem szűkítve): ami nincs
  ott, azt nem lehet elrontani
- élesben fail-fast, ha a buildelt web nincs meg

Élő ellenőrzés egy service-ből: jelszó nélkül 401 a gyökéren is,
jelszóval 200 a weben és az API-n.
EOF
```

---

## Task 4: Éles adatbázis-szerepek erős jelszóval

**Fájlok:**
- Létrehoz: `packages/db/prisma/bootstrap-roles.ts`, `packages/db/prisma/check-role-passwords.ts`
- Módosít: `package.json` (két script)

**Interfészek:** ez a Task önálló operációs eszközt ad; a szerver kódja nem hivatkozik rá.

**Miért nem migrációban?** Mert a Prisma-migráció **statikus SQL, nem tud env-et olvasni**. A
megoldás a migráció saját `IF NOT EXISTS` őrén áll: ha a szerep **már létezik** erős jelszóval,
a migráció nem hozza létre újra, csak a grantokat teszi rá. Ezért a bootstrap a `migrate deploy`
**előtt** fut.

- [ ] **4.1 lépés: a bootstrap script megírása**

Hozd létre `packages/db/prisma/bootstrap-roles.ts` néven:

```ts
// bootstrap-roles.ts — A HÁROM AGENT-SZEREP ERŐS JELSZÓVAL, env-ből.
//
// MIÉRT KELL EZ? Mert a migrációkban a jelszó a szerep NEVE
// (`CREATE ROLE "szoba-kertesz_ro" LOGIN PASSWORD 'szoba-kertesz_ro'`), és a repó PUBLIKUS.
// Lokálisan ez ártalmatlan (a Postgres a localhoston ül), élesben viszont közvetlen írási út
// a katalógusba a _rw szerepen.
//
// MIÉRT NEM MIGRÁCIÓBAN? A Prisma-migráció statikus SQL, nem olvas env-et. Ez a script a
// `migrate deploy` ELŐTT fut: a migráció `IF NOT EXISTS` őre miatt a már létező, erős
// jelszavú szerepeket nem írja felül — csak a grantokat teszi rájuk.
//
// MIÉRT `format()` ÉS NEM PARAMÉTER? Mert az `ALTER ROLE … PASSWORD` nem fogad bind-paramétert:
// a jelszónak string literálként kell ott állnia. A `format('%I', …)` és `%L` a Postgres SAJÁT
// escape-elése — így az injekció ellen nem a mi kódunk véd, hanem az adatbázis.
import { Pool } from 'pg';

interface RoleSpec {
  readonly role: string;
  readonly envName: string;
}

const ROLES: readonly RoleSpec[] = [
  { role: 'szoba-kertesz_ro', envName: 'DB_ROLE_PASSWORD_RO' },
  { role: 'szoba-kertesz_rw', envName: 'DB_ROLE_PASSWORD_RW' },
  { role: 'szoba-kertesz_chat', envName: 'DB_ROLE_PASSWORD_CHAT' },
];

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // Az env jöhet közvetlenül a shellből is — élesben pont úgy jön.
  }

  const adminUrl = process.env['DATABASE_URL'];
  if (!adminUrl) {
    console.error(
      'bootstrap-roles: hiányzó DATABASE_URL — a szerep-létrehozás admin kapcsolatot igényel.',
    );
    process.exit(1);
  }

  const missing = ROLES.filter(({ envName }) => {
    const value = process.env[envName];
    return value === undefined || value.length < 16;
  });
  if (missing.length > 0) {
    console.error(
      'bootstrap-roles: hiányzó vagy túl rövid jelszó (min. 16 karakter): ' +
        missing.map(({ envName }) => envName).join(', '),
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: adminUrl });
  try {
    for (const { role, envName } of ROLES) {
      const password = process.env[envName] as string;
      if (password === role) {
        console.error(
          `bootstrap-roles: a(z) ${envName} értéke azonos a szerep nevével — ez PONTOSAN az ` +
            'a gyenge alapértelmezés, amit ez a script kivált.',
        );
        process.exit(1);
      }

      // A Postgres állítja elő a biztonságos SQL-t: %I azonosítót, %L literált escape-el.
      const { rows } = await pool.query<{ stmt: string }>(
        `SELECT format(
           CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
                THEN 'ALTER ROLE %I PASSWORD %L'
                ELSE 'CREATE ROLE %I LOGIN PASSWORD %L'
           END, $1::text, $2::text) AS stmt`,
        [role, password],
      );
      const statement = rows[0]?.stmt;
      if (!statement) {
        throw new Error(`bootstrap-roles: nem sikerült SQL-t előállítani (${role}).`);
      }
      await pool.query(statement);
      console.log(`bootstrap-roles: ${role} jelszava beállítva.`);
    }
  } finally {
    await pool.end();
  }
}

void main();
```

- [ ] **4.2 lépés: az ellenőrző script megírása**

Hozd létre `packages/db/prisma/check-role-passwords.ts` néven:

```ts
// check-role-passwords.ts — MEGFIGYELHETŐ bizonyíték arra, hogy a gyenge alapértelmezés
// NEM működik. Nem azt nézi, hogy "lefutott-e a bootstrap", és nem is fájlt olvas: TÉNYLEGESEN
// megpróbál csatlakozni a default jelszóval (ami a szerep neve), és azt várja, hogy MINDHÁROM
// kísérlet ELBUKIK.
//
// Ha bármelyik SIKERÜL, az éles adatbázis a publikus repóban olvasható jelszóval elérhető.
import { Pool } from 'pg';

const ROLES = ['szoba-kertesz_ro', 'szoba-kertesz_rw', 'szoba-kertesz_chat'] as const;

async function canConnect(baseUrl: string, role: string): Promise<boolean> {
  const url = new URL(baseUrl);
  url.username = encodeURIComponent(role);
  url.password = encodeURIComponent(role); // a gyenge alapértelmezés
  const pool = new Pool({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // shellből is jöhet
  }

  const adminUrl = process.env['DATABASE_URL'];
  if (!adminUrl) {
    console.error('check-role-passwords: hiányzó DATABASE_URL.');
    process.exit(1);
  }

  const leaked: string[] = [];
  for (const role of ROLES) {
    if (await canConnect(adminUrl, role)) {
      leaked.push(role);
    }
  }

  if (leaked.length > 0) {
    console.error(
      'check-role-passwords: BUKÁS — a következő szerepek a PUBLIKUS repóban olvasható ' +
        `alapértelmezett jelszóval elérhetők: ${leaked.join(', ')}. ` +
        'Futtasd a `pnpm db:roles`-t erős jelszavakkal.',
    );
    process.exit(1);
  }

  console.log(
    'check-role-passwords: rendben — mind a három szerep elutasítja az alapértelmezett jelszót.',
  );
}

void main();
```

- [ ] **4.3 lépés: a két script felvétele**

A gyökér `package.json` `scripts` blokkjába:

```json
    "db:roles": "tsx packages/db/prisma/bootstrap-roles.ts",
    "db:check-roles": "tsx packages/db/prisma/check-role-passwords.ts",
```

- [ ] **4.4 lépés: az ellenőrző igazolása a LOKÁLIS adatbázison — BUKNIA kell**

```bash
pnpm db:check-roles; echo "kilépési kód: $?"
```

Elvárt: **BUKÁS**, kilépési kód **1**, és a három szerep felsorolva. Ez a helyes eredmény: a
lokális adatbázisban valóban a gyenge alapértelmezés van, és a script ezt **kimutatja**. Ha
zölden átmenne, az ellenőrző nem mérne semmit.

> **Ne javítsd a lokális adatbázist.** Ott a gyenge jelszó helyes: a `.env` erre van beállítva,
> és a Postgres a `localhost:5433`-on ül. A script élesben fut majd, ahol zöldet kell adnia.

- [ ] **4.5 lépés: a bootstrap igazolása egy ELDOBHATÓ adatbázison**

Ne a fejlesztői adatbázison próbáld. Hozz létre egy eldobhatót ugyanabban a konténerben:

```bash
docker exec szoba-kertesz-adatbazis psql -U "$(node -e "
process.loadEnvFile();
console.log(new URL(process.env.DATABASE_URL).username)")" -d postgres \
  -c 'CREATE DATABASE "bootstrap-proba";'
```

Majd futtasd a bootstrapot erre, erős jelszavakkal:

```bash
DATABASE_URL="$(node -e "
process.loadEnvFile();
const u = new URL(process.env.DATABASE_URL); u.pathname = '/bootstrap-proba';
console.log(u.toString())")" \
DB_ROLE_PASSWORD_RO='proba-eros-jelszo-ro-01' \
DB_ROLE_PASSWORD_RW='proba-eros-jelszo-rw-01' \
DB_ROLE_PASSWORD_CHAT='proba-eros-jelszo-chat-1' \
pnpm db:roles
```

Elvárt: három „jelszava beállítva" sor. **FIGYELEM:** a szerepek a klaszter szintjén élnek, tehát
ez a fejlesztői adatbázis szerepeinek jelszavát is átírja — ezért a lépés végén **állítsd
vissza**:

```bash
DB_ROLE_PASSWORD_RO='szoba-kertesz_ro__ideiglenes' \
DB_ROLE_PASSWORD_RW='szoba-kertesz_rw__ideiglenes' \
DB_ROLE_PASSWORD_CHAT='szoba-kertesz_chat__ideig' \
pnpm db:roles
```

majd `psql`-ből tedd vissza pontosan a `.env`-ben szereplő (gyenge, fejlesztői) jelszavakat, és
igazold, hogy a `pnpm nx test core` újra zöld. **Ha ez a lépés kockázatosnak tűnik, hagyd ki, és
jelezd a felhasználónak** — a bootstrap éles igazolása a Task 6-ban úgyis megtörténik.

- [ ] **4.6 lépés: az eldobható adatbázis törlése**

```bash
docker exec szoba-kertesz-adatbazis psql -U "$(node -e "
process.loadEnvFile(); console.log(new URL(process.env.DATABASE_URL).username)")" \
  -d postgres -c 'DROP DATABASE IF EXISTS "bootstrap-proba";'
```

- [ ] **4.7 lépés: lint + typecheck + a teljes csomag**

```bash
rm -rf apps/web/dist apps/web/out-tsc
pnpm nx run-many -t lint typecheck 2>&1 | grep -E "Successfully ran|Failed tasks"
pnpm nx run-many -t test 2>&1 | grep -E "Successfully ran|Failed tasks"
```

A `core` DB-s specjeinek **zöldnek kell lenniük** — ez igazolja, hogy a 4.5 lépés nem hagyott
maga után elrontott jelszót.

- [ ] **4.8 lépés: commit**

```bash
git add packages/db/prisma/bootstrap-roles.ts packages/db/prisma/check-role-passwords.ts package.json
git commit -F - <<'EOF'
feat: éles adatbázis-szerepek erős jelszóval (Task 4)

A migrációkban a három agent-szerep jelszava AZONOS A NEVÉVEL, és a
repó PUBLIKUS. Lokálisan ez ártalmatlan (a Postgres a localhoston ül),
élesben viszont közvetlen írási út a katalógusba a _rw szerepen.

- bootstrap-roles.ts: a három szerep jelszava env-ből, a migrate deploy
  ELŐTT futtatva. A migráció IF NOT EXISTS őre miatt a már létező, erős
  jelszavú szerepeket nem írja felül, csak grantol rájuk — így egyetlen
  migrációt sem kellett átírni (az Prisma checksum-driftet okozna)
- a jelszó minimum 16 karakter, és ha valaki a szerep nevét adná meg,
  a script kimondottan azt hibáztatja
- format('%I') és %L: az ALTER ROLE ... PASSWORD nem fogad
  bind-paramétert, a jelszónak literálként kell ott állnia. Az
  escape-elést így a Postgres végzi, nem a mi kódunk

- check-role-passwords.ts: MEGFIGYELHETŐ bizonyíték. Nem azt nézi,
  lefutott-e a bootstrap, hanem TÉNYLEGESEN megpróbál csatlakozni a
  default jelszóval, és mindhárom kísérlet kudarcát várja.

A lokális adatbázison az ellenőrző SZÁNDÉKOSAN pirosat ad — ott valóban
a gyenge alapértelmezés van, és ha zölden átmenne, nem mérne semmit.
EOF
```

---

## Task 5: Railway-konfiguráció, deploy-dokumentum és README

**Fájlok:**
- Létrehoz: `railway.json`, `docs/deploy.md`
- Módosít: `README.md`

- [ ] **5.1 lépés: `railway.json`**

A repo gyökerébe:

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "pnpm install --frozen-lockfile && pnpm nx run web:build && pnpm nx run server:build"
  },
  "deploy": {
    "startCommand": "node apps/server/dist/main.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

- [ ] **5.2 lépés: `docs/deploy.md`**

Írd meg a kitelepítés sorrendjét. Kötelező tartalom:

1. **Az adatbázis neve `szoba-kertesz` KELL legyen.** Ez telepítési invariáns: a
   `20260816191657_db_roles` és a `20260822112826_chat_role` migráció
   `GRANT CONNECT ON DATABASE "szoba-kertesz"`-t ír, be van drótozva. Más néven a
   `migrate deploy` **elhasal**. (A spec 5. döntése: a migráció átírását elvetettük, mert
   Prisma checksum-driftet okozna a fejlesztői adatbázison.)
2. **Railway Postgres pgvector-sablonnal** — konténeres Postgres, tehát `CREATE EXTENSION` és
   `CREATE ROLE` is megy.
3. **Sorrend:** `pnpm db:roles` (erős jelszavak env-ből) → `pnpm db:migrate` →
   `pnpm db:seed` → `pnpm knowledge:ingest` (**FIZETŐS, ~2 Ft**) → `pnpm db:check-roles`
   (**zöldet kell adnia**).
4. **A beállítandó titkok**, és amelyik **szándékosan hiányzik**:

   | Változó | Kötelező | Megjegyzés |
   |---|---|---|
   | `ANTHROPIC_API_KEY` | igen | |
   | `OPENAI_API_KEY` | igen | a RAG embeddingje enélkül elhasal |
   | `DATABASE_URL` | igen | admin — migráció, seed, tudásbázis-betöltés |
   | `DATABASE_URL_READONLY` | igen | `szoba-kertesz_ro` |
   | `DATABASE_URL_CHAT` | igen | enélkül a szerver **el sem indul** |
   | `DATABASE_URL_READWRITE` | **NEM** | **szándékosan hiányzik** — az író pool létre sem jön |
   | `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | igen | enélkül a szerver élesben **nem indul** |
   | `NODE_ENV=production` | igen | ez kapcsolja ki a `cors()`-t és a `/debug/knowledge`-et |
   | `CHAT_RATE_LIMIT` / `CHAT_RATE_WINDOW_MS` | nem | alap: 20 / perc |
   | `WEB_DIST` | nem | alap: `apps/web/dist` |

5. **Füstteszt** (**FIZETŐS, ~5 Ft**), és mellé a mért indoklás a rate limit alapértékéhez:
   percenkénti 20 kérés felső korlátja ≈ $0,92/perc, a `docs/roi.md` mért $0,046-os felső
   gondozási kérdésárával számolva.

- [ ] **5.3 lépés: README**

A „Vállalt korlátok" táblába vedd fel az **eddig hiányzó** tételt, és frissítsd a státuszokat:

- **ÚJ sor:** a `POST /api/chat` költség-kitettsége — élesben Basic auth + rate limit védi, de
  a megosztott jelszót ismerő bárki költhet. **Ez a tétel eddig egyetlen dokumentumban sem
  szerepelt.**
- A 3. sor (`/api/threads` hitelesítés nélkül) státusza: **élesben megoldva** Basic
  authtal — de a **tulajdonos-fogalom továbbra sem létezik**: aki bejut, mindenki
  beszélgetését látja. Ezt mondd ki, ne írd zöldre.

Plusz egy „Kitelepítés" szakasz a `docs/deploy.md`-re mutatva.

- [ ] **5.4 lépés: commit**

```bash
git add railway.json docs/deploy.md README.md
git commit -F - <<'EOF'
docs: Railway-konfiguráció, deploy-dokumentum és README (Task 5)

- railway.json: build (web + server) és start
- docs/deploy.md: a kitelepítés sorrendje, a titok-tábla, és a KÉT
  fizetős lépés kiírva (knowledge:ingest ~2 Ft, füstteszt ~5 Ft)
- kimondva a telepítési invariáns: az éles adatbázis neve
  szoba-kertesz KELL legyen, mert a GRANT CONNECT be van drótozva a
  migrációkba. A migráció átírását elvetettük (Prisma checksum-drift).
- a titok-táblában külön sor arról, ami SZÁNDÉKOSAN hiányzik:
  DATABASE_URL_READWRITE nélkül az író pool létre sem jön

README: a "Vállalt korlátok" tábla új sorral bővül — a /api/chat
költség-kitettsége. Ez a tétel EDDIG EGYETLEN DOKUMENTUMBAN SEM
szerepelt: sem a HF4 három gyengesége, sem a Kör A négy tétele közt.
A /api/threads sora nem lesz zöld: élesben a Basic auth elzárja, de
tulajdonos-fogalom továbbra sincs — aki bejut, mindenki beszélgetését
látja.
EOF
```

---

## Task 6: A tényleges kitelepítés — **EMBERI LÉPÉS**

> **Ezt a Taskot NEM az agent végzi.** A Railway-fiók, a bankkártya és a titkok a felhasználóé;
> az agent nem hoz létre fiókot, nem ad meg jelszót és nem visz be titkot idegen felületre.
> Az agent szerepe: **vezet és ellenőriz**.

- [ ] **6.1 — a felhasználó létrehozza** a Railway-projektet, benne a Postgres-t pgvector
  sablonból, `szoba-kertesz` nevű adatbázissal, és az `app` service-t erről a repóról.
- [ ] **6.2 — a felhasználó beviszi a titkokat** a `docs/deploy.md` táblája szerint. Erős
  jelszavakat generáljon (pl. `openssl rand -base64 24`), és a `DATABASE_URL_READWRITE`-ot
  **ne** vigye be.
- [ ] **6.3 — a felhasználó lefuttatja** a bootstrap → migrate → seed → ingest sorrendet.
- [ ] **6.4 — az agent ellenőriz** (a felhasználó által megadott URL-lel):

```bash
curl -s -o /dev/null -w 'gyökér jelszó nélkül: %{http_code}\n' https://<host>/
curl -s -o /dev/null -w 'API jelszó nélkül:    %{http_code}\n' https://<host>/api/threads
curl -s -o /dev/null -w 'debug élesben:        %{http_code}\n' https://<host>/debug/knowledge/sources
```

Elvárt: **401**, **401**, **401 vagy 404**.

- [ ] **6.5 — füstteszt** (**FIZETŐS, ~5 Ft**): a felhasználó a böngészőben, jelszóval, feltesz
  egy katalógus- és egy gondozási kérdést. Elvárt: a katalógus-kérdés száma **egyezik** az éles
  adatbázisban láthatóval, a gondozási kérdés pedig **forrásmegjelöléses** választ ad.
- [ ] **6.6 — `pnpm db:check-roles` az ÉLES `DATABASE_URL`-lel.** Elvárt: **zöld** — mind a
  három szerep elutasítja az alapértelmezett jelszót. Ez a kör egyik legfontosabb bizonyítéka.

---

## Záró ellenőrzés

- [ ] **Z.1 — a spec mind a 10 sikerkritériuma végigmérve**, kritériumonként kiírva, mi
  bizonyítja. Ami nem teljesült, azt **mondd ki**.
- [ ] **Z.2 — `git diff master --stat -- packages/core`.** Elvárt: **üres**.
- [ ] **Z.3 — `SYSTEM_PROMPT` bájtazonosság** (a `CLAUDE.md`-ben álló `diff`). Elvárt: üres.
- [ ] **Z.4 — a teljes csomag zöld**, és a teszt-szám az új specekkel **nő** (kiindulás: 555).
- [ ] **Z.5 — a terv jelölőinek átírása**, külön commitban, angolul (`docs: mark …`).
