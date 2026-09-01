# Doksi-szinkron és MI-felirat — végrehajtási terv

> **Agent-végrehajtóknak:** KÖTELEZŐ AL-SKILL: `superpowers:subagent-driven-development`
> (ajánlott) vagy `superpowers:executing-plans`. A lépések checkbox (`- [ ]`) jelölést
> használnak; a jelölők átírása KÉZI (`sed`), és mindig KÜLÖN, dokumentum-jellegű commit.

**Cél:** a repó három helyen mást állít magáról, mint ami igaz — a README nem tud a 08–09.
körről, a `docs/roi.md` egy 2026 júliusi képességhalmazt áraz, a felület pedig elhallgatja a
felhasználó elől, hogy modell válaszol neki. Ez a terv mindhármat lezárja, plusz naplózza az
egyetlen tudatosan nyitva hagyott jogi tételt.

**Megközelítés:** a felirat **felületenként egy konstansból** él (`apps/web/src/lib/` és
`apps/cli/src/lib/`), mert a webes bundle nem importálhat a `packages/core`-ból; a két szöveg
bájtazonosságát külön lépés méri. A dokumentumok utoljára
készülnek, hogy a **végállapotot** írják le. A README állításait ingyenes parancsokkal
igazoljuk; fizetős mérést ez a kör nem indít.

**Tech stack:** TypeScript (strict) · Nx · pnpm · React 19 + Tailwind v4 (`apps/web`) ·
commander + `node:readline` (`apps/cli`) · Vitest (`globals: true` — a specek nem importálják a
`describe`/`it`/`expect`/`vi` neveket, kivéve a `packages/core` specjeit, amelyek igen).

**Spec:** `docs/superpowers/specs/2026-08-31-doksi-szinkron-es-mi-felirat-design.md`

## Globális megkötések

- **A felirat mondata szó szerint, változtatás nélkül:**
  `Ez egy MI-asszisztens — a válaszokat nyelvi modell generálja.`
  (a `docs/hf4-ai-act.md` 2.3 pontjából; a gondolatjel **em dash**, nem kötőjel)
- **A felirat ÁLLANDÓ:** nem elutasítható, nem tűnik el görgetéskor, nem az első üzenet után
  jelenik meg (AI Act 50. cikk (5) — spec 8. döntés).
- **A mondat KÉT másolatban él** (`apps/web/src/lib/ai-disclosure.ts` és
  `apps/cli/src/lib/ai-disclosure.ts`), és a kettőnek **bájtra egyeznie kell**. A
  `packages/core`-ba **nem** kerül: a web böngésző-bundle, és nem függ a core-tól (spec 7.
  döntés, mérve). A Z.2 lépés az üres core-diffet, a 2.8 lépés a két másolat egyezését méri.
- **A `SYSTEM_PROMPT`-hoz NEM nyúlunk.** A `query-prompt.ts` ↔ `docs/system-prompt.md`
  bájtazonosság érintetlen; a felirat felületi tájékoztatás, nem prompt-szabály.
- **Nem futunk fizetős mérést.** Tilos: `pnpm knowledge:ingest`, `pnpm golden:run`,
  `pnpm autotest:battery` (a `--dump-cases` kapcsolóval **szabad**, az ingyenes),
  `pnpm autotest:rag`, `pnpm embed:demo`.
- **Tesztet `nx`-en át futtatunk**, sosem közvetlen `vitest`-tel: a közvetlen hívás nem kapja
  meg a gyökér `.env`-et, és némán hamis eredményt ad.
- **Markdownt idézett heredoc-kal írunk** (`<<'EOF'`), különben a shell lefuttatja a
  backtickeket.
- **Commit-üzenet:** magyar, `<type>: <leírás> (Task N)`, felsorolásos törzs, **trailer nélkül**.
- **Nem pusholunk és nem nyitunk PR-t** külön kérés nélkül.

---

## Fájl-térkép

| Fájl | Felelősség | Task |
|---|---|---|
| `apps/web/src/lib/ai-disclosure.ts` | **ÚJ** — a mondat a webes felület számára | 1 |
| `apps/web/src/App.tsx` | fejléc-felirat (`role="note"`) | 1 |
| `apps/web/src/App.disclosure.spec.tsx` | **ÚJ** — a felirat viselkedése | 1 |
| `apps/cli/src/lib/ai-disclosure.ts` | **ÚJ** — ugyanaz a mondat a CLI-nek (két fájl használja) | 2 |
| `apps/cli/src/interactive.ts` | az indító banner | 2 |
| `apps/cli/src/main.ts` | a `--help` leírása | 2 |
| `apps/cli/src/interactive.spec.ts` | egy új eset a bannerre | 2 |
| `docs/adr/0003-ai-act-50-2-gepi-jeloles.md` | **ÚJ** — az elvetett döntés | 3 |
| `docs/adr/README.md` | az ADR-index egy sora | 3 |
| `docs/roi.md` | újraírva mért számokra | 4 |
| `README.md` | 08–09. szakasz + HF4-mutató + státusz | 5 |
| `docs/implementacios-terv.md` | az alkalom-tábla 08/09/10. sora | 5 |

---

## Task 1: A webes felirat

**Fájlok:**
- Létrehoz: `apps/web/src/lib/ai-disclosure.ts`
- Létrehoz: `apps/web/src/App.disclosure.spec.tsx`
- Módosít: `apps/web/src/App.tsx:191-210`

**Interfészek:**
- Előállítja: `AI_DISCLOSURE: string` az `apps/web/src/lib/ai-disclosure.ts`-ből.
  A Task 2 **ugyanezt a nevet** használja a saját, `apps/cli`-beli másolatában — a **szöveg**
  legyen bájtra azonos, de a két modul külön él (spec 7. döntés).

> **A `packages/core`-hoz EBBEN A TASKBAN NEM NYÚLUNK.** Az `apps/web` böngésző-bundle, és
> mérve **nulla** sort importál a core-ból; a `@szoba-kertesz/core` nincs a `package.json`-jában,
> `tsconfig.base.json`-ban nincs `paths`, a `@nx/enforce-module-boundaries` pedig `error`
> szinten áll. Egy core-import fel sem oldódna, felvéve pedig a barrel `pg`-t és Node-only
> configot húzna a böngészőbe. A Z.2 lépés ezt méri: a `packages/core` diffjének **üresnek**
> kell maradnia.

- [x] **1.1 lépés: a konstans megírása**

Hozd létre `apps/web/src/lib/ai-disclosure.ts` néven:

```ts
// ai-disclosure.ts — AI Act 50. cikk (1) és (5): a felhasználót tájékoztatni kell, hogy
// MI-rendszerrel beszél, "legkésőbb az első interakció idején".
//
// MIÉRT ITT, és miért nem a packages/core-ban? Mert ez böngésző-kód. Az apps/web mérve
// EGYETLEN sort sem importál a core-ból: a core barrelje pg-t (db-readonly.ts, db-chat.ts)
// és Node-only configot is újraexportál, ami egy böngésző-bundle-be nem való. Ez fenntartott
// invariáns, nem véletlen — nem törjük meg egyetlen mondatért.
//
// AZ ÁRA, kimondva: az apps/cli ugyanezt a mondatot a saját másolatában tartja. A két
// szövegnek bájtra egyeznie kell; mindkét oldalt spec pinneli.
//
// MIÉRT NEM A SYSTEM PROMPTBAN? Mert ez nem a modell viselkedése, hanem a FELÜLET
// tájékoztatása. Egy promptba írt szabály attól függne, hogy a modell betartja-e; ez a
// mondat akkor is ott van a képernyőn, ha a modell el sem indul.
//
// A "nyilvánvaló" kivételre (50. cikk (1) utolsó fordulat) SZÁNDÉKOSAN nem hivatkozunk —
// az indoklás a docs/hf4-ai-act.md 2.3 pontjában áll.

/** A tájékoztató mondat. A gondolatjel em dash (—), nem kötőjel. */
export const AI_DISCLOSURE =
  'Ez egy MI-asszisztens — a válaszokat nyelvi modell generálja.';
```

- [x] **1.2 lépés: a bukó teszt megírása (web)**

Hozd létre `apps/web/src/App.disclosure.spec.tsx` néven. A `stubFetch` mintája az
`App.testids.spec.tsx`-ből való; a `describe`/`it`/`expect` **globális** ebben a csomagban:

```tsx
import { render } from '@testing-library/react';
import { AI_DISCLOSURE } from './lib/ai-disclosure.js';
import App from './App.js';

/**
 * AI ACT 50. cikk (1)+(5) — a tájékoztatásnak "legkésőbb az első interakció idején" meg kell
 * történnie. Ez a spec azt méri, amit a FELHASZNÁLÓ LÁT, nem azt, hogy a forrásban benne
 * van-e a mondat: renderel, és megnézi, ott van-e a képernyőn MIELŐTT bármit kérdeztek.
 *
 * Miért `role="note"` és nem testid? Mert a felirat akadálymentesen is közlendő, és a role
 * természetes fogódzó — az App.testids.spec.tsx elve szerint ahol van ilyen, ott nem teszünk
 * testidet.
 *
 * A MÁSODIK eset a teherbíró: a felirat CSAK a fejlécben van. Az üres állapot az első üzenet
 * után eltűnik — ha a fejléces példány elveszne, a tájékoztatás pont beszélgetés közben
 * szűnne meg, és egy visszatérő látogató sosem látná.
 */

const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string) => unknown): void {
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    new Response(JSON.stringify(handler(String(input))), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

describe('MI-tájékoztatás (AI Act 50. cikk)', () => {
  beforeEach(() => {
    stubFetch(() => ({ threads: [] }));
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('a felirat az ELSŐ INTERAKCIÓ ELŐTT látszik, üres beszélgetésben', async () => {
    const { getByRole, findByText } = render(<App />);

    await findByText(/Kérdezz a növénykatalógusról/);
    expect(getByRole('note').textContent).toContain(AI_DISCLOSURE);
  });

  it('a felirat NEM tűnik el, amikor már van üzenet a beszélgetésben', async () => {
    const id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    window.history.replaceState(null, '', `?thread=${id}`);
    stubFetch((url) =>
      url.endsWith('/api/threads')
        ? {
            threads: [
              {
                id,
                title: 'Hány kaktusz van?',
                updatedAt: '2026-08-22T10:00:00.000Z',
              },
            ],
          }
        : {
            id,
            messages: [
              {
                id: 1,
                role: 'user',
                parts: [{ type: 'text', text: 'Hány kaktusz van?' }],
              },
              {
                id: 2,
                role: 'assistant',
                parts: [{ type: 'text', text: 'Két kaktusz van.' }],
              },
            ],
          },
    );

    const { findByText, getByRole } = render(<App />);
    await findByText('Két kaktusz van.');

    expect(getByRole('note').textContent).toContain(AI_DISCLOSURE);
  });
});
```

- [x] **1.3 lépés: futtatás — BUKNIA kell**

```bash
pnpm nx test web
```

Elvárt: a három új eset **BUKIK**. A várható hibaüzenet
`Unable to find an accessible element with the role "note"`. Ha bármelyik ZÖLDEN átmegy,
állj meg: akkor nem azt méred, amit hiszel.

- [x] **1.4 lépés: a webes felület megvalósítása**

Az `apps/web/src/App.tsx` import-blokkjához add hozzá (a többi `./lib/…` import mellé):

```tsx
import { AI_DISCLOSURE } from './lib/ai-disclosure.js';
```

A `:193` sort (`<h1 …>Szobakertész</h1>`) cseréld erre:

```tsx
        {/* AI Act 50. cikk (1)+(5): állandó, az első interakció előtt látható tájékoztatás.
            NEM elutasítható sáv — az eltüntethető banner csak az első betöltésre teljesítené
            a "legkésőbb az első interakció idején" követelményt, egy visszatérő látogatónak
            soha. A "nyilvánvaló" kivételre nem hivatkozunk (docs/hf4-ai-act.md 2.3). */}
        <header>
          <h1 className="text-xl font-semibold text-emerald-900">
            Szobakertész
          </h1>
          <p role="note" className="text-xs text-neutral-600">
            {AI_DISCLOSURE}
          </p>
        </header>
```

A `:207` üres állapothoz **NEM nyúlunk**. (A spec eredetileg kérte, de a Task 1 élő
ellenőrzésén elvetettük: a mondat így kétszer állt egymás alatt. A fejléces példány a
teherbíró, mert üzenetek mellett is ott marad.)

- [x] **1.5 lépés: futtatás — ZÖLDNEK kell lennie**

```bash
pnpm nx test web
```

Elvárt: minden `web` teszt zöld, beleértve a meglévő `App.testids.spec.tsx`-et is. Az utóbbi
`findByText(/Kérdezz a növénykatalógusról/)`-t használ; a bekezdés `textContent`-je most a
tájékoztatással kezdődik, de a reguláris kifejezés továbbra is illeszkedik. **Ha mégis bukik,
az valódi információ** — ne a tesztet igazítsd, hanem nézd meg, mit változtattál.

- [x] **1.6 lépés: a core érintetlenségének igazolása**

```bash
git diff --stat -- packages/core
```

Elvárt: **üres kimenet.** Ha bármi van benne, visszaléptél a spec 7. döntése elé — nézd meg,
mit módosítottál, és vond vissza.

- [x] **1.7 lépés: lint + typecheck + build**

```bash
rm -rf apps/web/dist apps/web/out-tsc
pnpm nx run-many -t lint typecheck
pnpm nx run-many -t build
```

A `build` itt azért kell, és nem csak a kör végén: ez az a lépés, ami **kimutatná**, ha az új
import mégis Node-only kódot húzna a böngésző-bundle-be.

> **BUKTATÓ, mérve a Task 1-ben — a sorrend számít.** A `web:typecheck` (`tsc --build`) a
> deklarációit az `apps/web/dist`-be emittálja, **ugyanoda, ahová a Vite `build` ír**, a
> `tsbuildinfo` pedig az `apps/web/out-tsc`-ben él. Ha a `build` a `typecheck` UTÁN fut és
> felülírja a `dist`-et, a következő `typecheck` **TS6305**-tel bukik nyolc olyan fájlon is,
> amihez senki nem nyúlt. Ez NEM regresszió — a tiszta HEAD-en is reprodukálható. Ezért
> futtatjuk KÉT lépésben, és törlünk előtte:
>
> ```bash
> rm -rf apps/web/dist apps/web/out-tsc
> pnpm nx run-many -t lint typecheck
> pnpm nx run-many -t build
> ```
>
> Az Nx a végén akkor is kiír egy „Nx detected a flaky task" bannert, ha minden zöld — az
> igazságot a `Successfully ran…` sor mondja, ne a banner.

- [x] **1.8 lépés: ÉLŐ ellenőrzés — ezt a felhasználó nézi meg**

```bash
pnpm serve:api    # egyik terminál
pnpm serve:web    # másik terminál
```

Nyisd meg a `http://localhost:4200`-at, és **kérdezd meg a felhasználót**, hogy a fejléc
felirata így jó-e. **Ez emberi visszaigazolás, nem futtatható állítás.** Ne lépj tovább a
válasza nélkül. (MEGTÖRTÉNT: a felhasználó itt vetette el az üres állapotbeli második
példányt.)

- [x] **1.9 lépés: commit**

```bash
git add apps/web/src/lib/ai-disclosure.ts apps/web/src/App.tsx \
        apps/web/src/App.disclosure.spec.tsx
git commit -F - <<'EOF'
feat: MI-tájékoztatás a webes felületen (Task 1)

AI Act 50. cikk (1)+(5): a felhasználót tájékoztatni kell, hogy
MI-rendszerrel beszél, legkésőbb az első interakció idején. Az általános
alkalmazás 2026-08-02 óta tart, tehát ez LEJÁRT határidő volt, nem
jövőbeli feladat — a docs/hf4-ai-act.md 2.3 pontja néven is nevezte.

- a fejlécben állandó, role="note" felirat — NEM elutasítható sáv, mert
  az csak az első betöltésre teljesítené az 50. cikk (5)-öt
- a "nyilvánvaló" kivételre (50. cikk (1)) nem hivatkozunk, az indoklás
  a HF4-ben áll

A konstans az apps/web-ben él, NEM a packages/core-ban: az apps/web
böngésző-bundle, és mérve egyetlen sort sem importál a core-ból, aminek
a barrelje pg-t és Node-only configot is újraexportál. A core diffje
üres marad. Ára — kimondva —, hogy a CLI a saját másolatát tartja
majd; mindkét oldalt spec pinneli.

A spec azt méri, amit a felhasználó LÁT: renderel, és megnézi, ott
van-e a felirat, mielőtt bármit kérdeztek — plusz hogy üzenetek mellett
sem tűnik el.
EOF
```

---

## Task 2: A CLI két felülete

**Fájlok:**
- Létrehoz: `apps/cli/src/lib/ai-disclosure.ts`
- Módosít: `apps/cli/src/interactive.ts:170-172`
- Módosít: `apps/cli/src/main.ts:39-42`
- Módosít: `apps/cli/src/interactive.spec.ts` (egy új eset)

**Interfészek:**
- Előállítja: `AI_DISCLOSURE` az `apps/cli/src/lib/ai-disclosure.ts`-ből, a CLI **két** fájlja
  (`interactive.ts`, `main.ts`) használja.
- **A szövegnek bájtra egyeznie kell** az `apps/web/src/lib/ai-disclosure.ts`-belivel (Task 1).
  Ez a spec 7. döntésének vállalt korlátja: két másolat, mindkettőt spec pinneli.

- [x] **2.1 lépés: a konstans megírása**

Hozd létre `apps/cli/src/lib/ai-disclosure.ts` néven. **A mondat bájtra azonos** a Task 1-ben
írttal; a gondolatjel em dash (—), nem kötőjel:

```ts
// ai-disclosure.ts — AI Act 50. cikk (1) és (5). A CLI is KÖZVETLENÜL természetes személlyel
// interaktál, tehát a kötelezettség ide is szól: a HF4 kizárólag az apps/web-et mérte, de a
// rendelkezés nem felület-specifikus.
//
// MIÉRT MÁSOLAT? Mert az apps/web böngésző-bundle, és nem importálhat a packages/core-ból
// (a barrel pg-t és Node-only configot is újraexportál). Egy közös helyet vagy a web
// core-függősége, vagy egy külön workspace-csomag árán lehetne tartani — mindkettő
// aránytalan EGYETLEN mondatért. A döntés és az elvetett alternatívák a specben állnak.
//
// A SZÖVEGNEK BÁJTRA EGYEZNIE KELL az apps/web/src/lib/ai-disclosure.ts-belivel.

/** A tájékoztató mondat. A gondolatjel em dash (—), nem kötőjel. */
export const AI_DISCLOSURE =
  'Ez egy MI-asszisztens — a válaszokat nyelvi modell generálja.';
```

- [x] **2.2 lépés: a bukó teszt megírása**

Az `apps/cli/src/interactive.spec.ts` import-blokkjában vedd fel az `AI_DISCLOSURE`-t a
`./lib/ai-disclosure.js`-ből, és adj hozzá egy esetet a `describe('runInteractive', …)`-ba. A
`logSpy` már létezik a `beforeEach`-ben:

```ts
  it('az indító banner kimondja, hogy MI-asszisztens válaszol', async () => {
    // AI Act 50. cikk (1)+(5). Nem a forrást nézzük, hanem amit a felhasználó INDULÁSKOR
    // ténylegesen lát a konzolon — ezért console-spy, nem sztring-összehasonlítás a fájlra.
    const ask = vi.fn().mockResolvedValue(makeResult('a válasz'));

    const done = runInteractive({
      input,
      output,
      ask,
      print: false,
      store: silentStore(),
    });
    input.write('exit\n');
    await done;

    // A banner a kérdés ELŐTT íródik ki: a modell meg sem szólalt.
    expect(ask).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(AI_DISCLOSURE),
    );
  });
```

Az `ask`, a `print: false`, a `silentStore()` és az `input.write('exit\n')` minta a fájl
meglévő eseteiből való (`interactive.spec.ts:78` és `:99`) — ne térj el tőle, és ne találj ki
új opciót.

- [x] **2.3 lépés: futtatás — BUKNIA kell**

```bash
pnpm nx test cli
```

Elvárt: az új eset **BUKIK**, mert a banner még nem tartalmazza a mondatot.

- [x] **2.4 lépés: az interaktív banner kiegészítése**

Az `apps/cli/src/interactive.ts`-ben vedd fel az `AI_DISCLOSURE` importot a
`./lib/ai-disclosure.js`-ből, és a `:170` `console.log(...)` hívást cseréld erre:

```ts
    // AI Act 50. cikk (1)+(5): a CLI is közvetlenül természetes személlyel interaktál, tehát
    // a kötelezettség ide is szól — a HF4 csak az apps/web-et mérte, de nem felület-specifikus.
    // EGY console.log hívás marad: a meglévő spec arra épít, hogy a banner egyetlen kiírás.
    console.log(
      `Szobakertész interaktív mód — írj be egy kérdést, és válaszol. Kilépés: "exit".\n${AI_DISCLOSURE}`,
    );
```

- [x] **2.5 lépés: a `--help` leírás kiegészítése**

Az `apps/cli/src/main.ts`-ben vedd fel az `AI_DISCLOSURE` importot a `./lib/ai-disclosure.js`-ből,
és a `:40-42` `.description(...)` hívást cseréld erre:

```ts
  .description(
    `Szobakertész CLI — szobanövény-katalógushoz kapcsolódó, magyar nyelvű kérdéseket megválaszoló asszisztens. ${AI_DISCLOSURE}`,
  )
```

- [x] **2.6 lépés: futtatás — ZÖLDNEK kell lennie**

```bash
pnpm nx test cli
```

Elvárt: minden `cli` teszt zöld. Figyelj a **meglévő** esetre, amelyik azt állítja, hogy
kilépéskor „se banner, se Viszlát!" nincs (`interactive.spec.ts:404` környéke,
`expect.stringContaining('interaktív mód')`) — ez továbbra is illeszkedik, mert egyetlen
`console.log` hívás maradt.

- [x] **2.7 lépés: élő füstpróba (ingyenes)**

```bash
pnpm cli --help
```

Elvárt: a leírásban ott a mondat. Az interaktív banner ellenőrzése API-hívást indítana kérdés
esetén, de a **banner maga a kérdés előtt** kiíródik:

```bash
echo "exit" | pnpm cli
```

Elvárt: a banner két sora megjelenik, kérdés nélkül kilép, **API-hívás nem történik**.

- [x] **2.8 lépés: a két másolat egyezésének igazolása**

A spec 7. döntésének korlátja miatt ez **kézi ellenőrzés**, és pont ezért van külön lépésben:

```bash
diff <(grep -A2 "^export const AI_DISCLOSURE" apps/web/src/lib/ai-disclosure.ts) \
     <(grep -A2 "^export const AI_DISCLOSURE" apps/cli/src/lib/ai-disclosure.ts)
```

Elvárt: **üres kimenet**. Ha eltér, a két felület mást mond a felhasználónak — javítsd, mielőtt
továbbmész.

- [x] **2.9 lépés: lint + typecheck**

```bash
pnpm nx run-many -t lint typecheck
```

- [x] **2.10 lépés: commit**

```bash
git add apps/cli/src/lib/ai-disclosure.ts apps/cli/src/interactive.ts \
        apps/cli/src/main.ts apps/cli/src/interactive.spec.ts
git commit -F - <<'EOF'
feat: MI-tájékoztatás a CLI-ben (Task 2)

A CLI is közvetlenül természetes személlyel interaktál, tehát az AI Act
50. cikk (1) ide is szól. A HF4 kizárólag az apps/web-et mérte, de a
kötelezettség nem felület-specifikus — ez a commit a következetlenséget
szünteti meg, nem új követelményt teljesít.

- az interaktív mód indító bannere kiegészül (egyetlen console.log
  hívás marad, mert a meglévő spec arra épít)
- a --help leírása kiegészül
- a CLI két fájlja EGY konstansból dolgozik (apps/cli/src/lib/)

A web a saját másolatát tartja, mert böngésző-bundle-ként nem
importálhat a packages/core-ból. A két szöveg bájtra egyezik, és ezt a
Task egy külön lépésben diff-fel igazolja — de kimondjuk: ha valaki
mindkét helyen átírja, azt semmi nem fogja meg. Ez a spec 7. döntésének
vállalt korlátja; az alternatívák (a web core-függősége vagy külön
workspace-csomag) egyetlen mondatért aránytalanok voltak.

A spec console-spy-jal azt méri, amit a felhasználó INDULÁSKOR
ténylegesen lát, nem azt, hogy a forrásban benne van-e a mondat.
EOF
```

---

## Task 3: ADR — az 50. cikk (2) elvetése

**Fájlok:**
- Létrehoz: `docs/adr/0003-ai-act-50-2-gepi-jeloles.md`
- Módosít: `docs/adr/README.md` (az index táblája)

Ez a Task **közvetlenül a felirat után** jön, még a ROI előtt: ugyanahhoz a jogszabályi
tételhez tartozik, és a döntés akkor friss, amikor az 50. cikk (1)-et éppen megvalósítottuk.

- [x] **3.1 lépés: az ADR megírása**

Másold a `docs/adr/_template.md` szerkezetét, és töltsd ki. A kötelező tartalom:

- **Státusz:** elfogadva · **Dátum:** 2026-09-01
- **Kontextus:** az 50. cikk (2) a szintetikus tartalom **gépi olvashatóságú** jelölését kéri.
  A `docs/hf4-ai-act.md` 2.3 pontja ezt nyitott tételként vitte tovább, azzal az indokkal, hogy
  hivatkozással nem tudta megválaszolni. A Task 1–2 az 50. cikk **(1)+(5)**-öt teljesítette; a
  (2) nyitva maradt, és most nem véletlenül, hanem döntésből.
- **Döntés:** ebben a körben **nem** vezetünk be gépi jelölést.
- **Megfontolt alternatívák** — a táblázatban MIND, az elvetés indokával:

  | Alternatíva | Miért nem ezt választottuk |
  |---|---|
  | Jelölő HTTP-fejléc a `/api/chat` válaszán | A stream fogyasztója a böngésző `useChat`-je; a fejléc sem a tárolt üzenetben, sem a megosztott `?thread=` visszatöltésben nem marad meg — a jelölés a tartalomtól elválna, ami épp az ellenkezője a provenance-nek |
  | Metaadat a tárolt asszisztens-üzeneteken (`messages.parts`) | A `_chat` szerep **append-only**, tehát visszamenőleg nem jelölhetnénk; és a jelölés a mi adatbázisunkat hagyva azonnal elvész — egy kimásolt válaszon nem látszik |
  | Provenance / C2PA-szerű aláírt jelölés | Ez érné el, amit a rendelkezés kér, de szövegre a szabvány ma nem kiforrott, és a bevezetése önálló kör — nem fér ebbe |
  | „Jelöljük valamivel, jobb a semminél" | Megfelelési állítást nem alapozhatnánk rá. Egy álmegoldás **rosszabb** a bevallott hiánynál: elhiteti, hogy a tétel le van zárva |

- **Következmények:** a tétel **nyitott marad**, és a README-ben is kimondva marad. Amikor a
  szövegre vonatkozó jelölési gyakorlat kiforr, ez az ADR a kiindulópont. Nyereség: a döntés
  naplózott, tehát egy későbbi olvasó meg tudja különböztetni a tudatos döntést a
  feledékenységtől.

- [x] **3.2 lépés: az index kiegészítése**

A `docs/adr/README.md` táblájába, a `0002` sor **alá**:

```markdown
| [0003](0003-ai-act-50-2-gepi-jeloles.md) | Az AI Act 50. cikk (2) gépi jelölésének elhalasztása | elfogadva | 2026-09-01 |
```

- [x] **3.3 lépés: ellenőrzés**

```bash
ls docs/adr/
grep -c "0003" docs/adr/README.md
```

Elvárt: a fájl létezik, és az index pontosan **egy** hivatkozást tartalmaz rá. Nyisd meg és
olvasd el: a négy alternatíva **mind** benne van-e az elvetés indokával? Az ADR értéke épp ez.

- [x] **3.4 lépés: commit**

```bash
git add docs/adr/0003-ai-act-50-2-gepi-jeloles.md docs/adr/README.md
git commit -F - <<'EOF'
docs: ADR 0003 — az 50. cikk (2) gépi jelölésének elhalasztása (Task 3)

A Task 1-2 az AI Act 50. cikk (1)+(5)-öt teljesítette. A (2) — a
szintetikus szöveg gépi olvashatóságú jelölése — nyitva maradt, és ez
mostantól DÖNTÉS, nem hallgatás.

Négy megfontolt alternatíva, mind az elvetés indokával: jelölő
HTTP-fejléc (a jelölés elválna a tartalomtól), üzenet-metaadat (a _chat
szerep append-only, és a jelölés az adatbázist elhagyva elvész),
provenance/C2PA (ez érné el, amit a rendelkezés kér, de szövegre nem
kiforrott szabvány, és önálló kör), valamint a "jobb a semminél"
álmegoldás — erre megfelelési állítást nem lehetne alapozni, és
elhitetné, hogy a tétel le van zárva.
EOF
```

---

## Task 4: `docs/roi.md` újraírása mért számokra

**Fájlok:**
- Módosít: `docs/roi.md` (a forgatókönyv és a 7 szakaszos szerkezet marad)

**A kör legfontosabb tartalmi szabálya:** minden szám mellett ki kell derülnie, hogy **mért**
vagy **becsült**, és a mértnél a forrásnak megnevezve kell lennie. Ez volt a dokumentum eddigi
legnagyobb gyengesége.

- [ ] **4.1 lépés: a mért alap átvétele (NE számold újra)**

Ezek a számok a spec „Kiindulási állapot" szakaszából valók, és **fizetős mérés nélkül**
rendelkezésre állnak. Írd be őket a dokumentumba forrásmegjelöléssel:

| Tétel | Érték | Forrás |
|---|---|---|
| katalógus-kérdés, válasz-réteg | 3849 be / 235 ki token → **$0,0151** | `README.md` „Költségbecslés" (06. kör) |
| gondozási kérdés, válasz-réteg | 8702 be / 287 ki token → **$0,0304** | ugyanott |
| gondozási kérdés, válasz-réteg (battery) | 9139 be / 856 ki token → **$0,0403** | `logs/autotest/2026-08-26T07-12-39-154Z-battery.json` |
| RAG-pipeline (HyDE + rerank + embedding) | ≈ **$0,0055** | `README.md`, becslés karakterszámból |
| tudásbázis teljes felépítése | ≈ **$0,0055** (0,55 cent) | `README.md`, mért karakterszám |
| ár-tábla | Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5 / 1M | `tools/autotest/src/lib/cost.ts` |

Ebből a **kérdésenkénti sáv**, amit a dokumentumnak ki kell mondania:

- katalógus-kérdés: **≈ $0,015**
- gondozási kérdés: **$0,036 – $0,046** (a válasz-réteg 3,04–4,03 centje + a pipeline 0,55 centje)

- [ ] **4.2 lépés: a 4. szakasz (üzemeltetési költség) újraírása**

A régi becsült számsor (`≈ 1 510 input token`) **teljesen kiesik**. Helyette:

1. A fenti mért tábla, forrásokkal.
2. **A mérési csapda kimondva:** a battery `costUsd`-je a `logs/<ts>.json` `usage` mezőjéből
   számol (`tools/autotest/src/lib/server-usage.ts`), ami az **agent-loop** használata. A HyDE,
   a rerank és az embedding a `rag/retrieve.ts`-en belül fut, az `onStepEnd` nem látja őket —
   tehát a battery száma **kizárólag a válasz-réteg**, és a teljes költséghez hozzá kell adni a
   pipeline-t.
3. **Miért sáv és nem pont:** a két mért gondozási eset bemenete közel azonos (8702 vs. 9139),
   a **kimenete háromszoros** (287 vs. 856) — a battery kérdésére az agent táblázatos, tagolt
   választ írt. Nem mérési hiba: ez a kérdésenkénti költség természetes szórása.
4. Havi API-költség a 300 kérdésre (A4) **sávként**, a kérdés-összetételtől függően. A két
   végpont kiszámolva (300 kérdés, 380 Ft/USD — lásd az 5. pontot):

   | Összetétel | USD/hó | Ft/hó |
   |---|---|---|
   | csupa katalógus-kérdés ($0,0151) | $4,52 | **~1 720 Ft** |
   | csupa gondozási, alsó vég ($0,0359) | $10,77 | **~4 090 Ft** |
   | csupa gondozási, felső vég ($0,0458) | $13,73 | **~5 220 Ft** |

   A régi anyag **1 020 Ft/hó**-t becsült — a mért sáv ennek **1,7–5,1-szerese**. Írd ki ezt a
   szorzót: ez a mérés egyetlen valódi meglepetése.
5. Az árfolyam **explicit, dátumozott feltételezés** — a régi anyag 380 Ft/USD-t használt
   2026-07-03-i állapotra. **Tartsd meg ezt az értéket, de jelöld becsültnek és
   ellenőrizetlennek**; ne találj ki friss árfolyamot.
6. Az üzemeltetési puffer (~20 000 Ft/hó) **becslés marad**, így jelölve. **Írd oda**, hogy ezt
   a szám a go-live köre (Kör B) fogja valósra cserélni.

- [ ] **4.3 lépés: a haszon-oldal kiegészítése**

Az 1. és 3. szakaszba:

- **A tudásbázis mint új képesség.** 2026-07-03-án nem létezett; a régi anyag árazni sem tudta.
  A gondozási kérdés nem katalógus-keresés — kézzel ez cikkek olvasását jelentené, nem szűrést.
  Hivatkozás: `docs/golden-set.md`, `docs/chunking-strategia.md`.
- **A mérőeszköz mint minőségi bizonyíték** (11 fok / 29 eset + hat RAGAS-metrika,
  `tools/autotest/`). Ez a „honnan tudod, hogy jól működik" válasza — üzleti anyagban ez az,
  ami a „szerintem jó" helyére lép.
- **A felület.** A régi anyag CLI-t feltételezett; ma böngésző-chat van megosztható
  beszélgetésekkel, ami a bevezetési súrlódást csökkenti (ezt **becslésként** jelöld, nem
  mértként — nem mértük).

- [ ] **4.4 lépés: a feltételezés-tábla megjelölése**

A 2. szakasz táblája kapjon egy **új oszlopot**: `mért | becsült`. Az A1–A9 sorok többsége
**becsült** marad (a bér- és időadatok), és ez így helyes — a lényeg, hogy **látszódjon**.

- [ ] **4.5 lépés: a 7. szakasz (Korlátok) kiegészítése**

Vedd fel az újakat:

- a battery száma csak a válasz-réteg (lásd 4.2/2.);
- a kérdés-összetétel (katalógus vs. gondozási arány) **nincs mérve**, ezért a havi API-költség
  sáv, nem pont;
- az árfolyam ellenőrizetlen, 2026-07-03-i feltételezés;
- az üzemeltetési puffer becslés, amit a go-live köre válthat valósra.

- [ ] **4.6 lépés: a következtetés ellenőrzése — és kimondása**

Számold ki a nettó megtakarítást az új költségekkel. **Elvárt eredmény:** az API-költség nőtt a
régi becsléshez képest, de a nagyságrend változatlan, tehát a **következtetés nem dől meg**.

**Ezt írd is le a dokumentumban.** Az, hogy a mérés nem borította fel a becslést, önálló
megállapítás — nem formalitás. Ha viszont a számolás mást ad, **azt írd le**, és ne igazítsd
hozzá a feltételezéseket.

- [ ] **4.7 lépés: a hivatkozások visszakereshetőségének ellenőrzése**

```bash
grep -n "logs/autotest\|README.md\|cost.ts\|golden-set\|chunking-strategia" docs/roi.md
ls logs/autotest/2026-08-26T07-12-39-154Z-battery.json
```

Elvárt: minden hivatkozott fájl **létezik**, és minden szám mellett ott a forrás vagy a
„becsült" jelölés. Nyisd meg a dokumentumot, és olvasd végig: van-e olyan szám, amiről nem
derül ki, honnan jön? Ha igen, az hiba.

- [ ] **4.8 lépés: commit**

```bash
git add docs/roi.md
git commit -F - <<'EOF'
docs: a ROI újraírása mért számokra (Task 4)

A docs/roi.md 5f32123 (2026-07-03) óta érintetlen volt — a 04. alkalom
ELŐTTRŐL —, és egy CLI-only képességhalmazt árazott a mai termék
nevében. A forgatókönyv (5 fős lakberendező iroda) és a szerkezet marad;
a számok alapja változik.

- a 4. szakasz becslésből méréssé válik: a régi "≈ 1 510 input token"
  helyére a README 06. körös mért adatai és a battery JSON valódi
  costUsd-je kerül, forrásmegjelöléssel
- a költség SÁV, nem pont: a két mért gondozási eset bemenete közel
  azonos (8702 vs. 9139), a kimenete háromszoros (287 vs. 856) — a
  kérdésenkénti költség természetes szórása, nem mérési hiba
- kimondva a mérési csapda: a battery costUsd-je az AGENT-LOOP usage-ét
  méri, a HyDE/rerank/embedding a retrieve.ts-en belül fut, tehát nincs
  benne — a teljes költséghez hozzáadandó
- a haszon-oldalra bejön a tudásbázis (2026-07-03-án nem létezett) és a
  mérőeszköz mint minőségi bizonyíték
- minden feltételezés-sor megjelölve: mért vagy becsült

A következtetés nem dőlt meg: az API-költség nőtt a régi becsléshez
képest, de a nagyságrend változatlan a bérköltség-megtakarítás mellett.
Ez önálló megállapítás, nem formalitás.
EOF
```

---

## Task 5: README + implementációs terv + ingyenes állítás-audit

**Fájlok:**
- Módosít: `README.md`
- Módosít: `docs/implementacios-terv.md` (a „Hol tart a terv" tábla, `:176` környéke)

Ez a Task jön **utoljára**, hogy a README a végállapotot írja le — beleértve a Task 1–2
feliratát és a Task 4 új ROI-ját.

- [ ] **5.1 lépés: az ingyenes audit lefuttatása — ELŐSZÖR, nem utoljára**

```bash
rm -rf apps/web/dist apps/web/out-tsc
pnpm nx run-many -t lint typecheck
pnpm nx run-many -t build
pnpm nx run-many -t test
pnpm mcp:smoke
pnpm autotest:battery --dump-cases
```

A `lint typecheck` és a `build` KÜLÖN fut, és előtte törlünk — lásd az 1.7 lépés buktatóját.

**Írd le a tényleges kimenetet** (teszt-szám, hibák), ne az elvártat. A kiindulási teszt-szám
**552** volt a 09. körben mérve; a Task 1–2 négy új esettel járul hozzá, tehát a számnak
**nőnie** kell. Ha bármi bukik, azt **most** derítsd ki — a README nem hivatkozhat olyan
parancsra, ami nem fut le.

> `pnpm nx test autotest` a CI-ben külön lépés; a `run-many -t test` behúzza a `core` DB-s
> specjeit, ezért futó, seedelt Postgres kell. A `--dump-cases` **ingyenes** (nem indít
> böngészőt és nem hív modellt), a `mcp:smoke` szintén (valódi MCP-kliens, modellhívás nélkül).

- [ ] **5.2 lépés: a README két új szakasza**

A „Jelenlegi státusz" alá, a meglévő alszakaszok mintájára (`### Cím` + magyarázó bekezdés):

**`### Mérőeszköz — a nehézségi létra és a RAG-mérés (08.)`**
- `tools/autotest` mint **külön workspace-csomag**: `battery.ts` (Playwright, 11 fok / 29 eset)
  és `rag-eval.ts` (RAGAS-stílus, hat metrika, böngésző nélkül).
- **Miért nem a `.claude/skills/` alatt?** Mert az kívül esik a pnpm-workspace-en, tehát oda se
  lint, se typecheck, se CI nem futna — pont arra a kódra, amelyik **hamis zöldet** tud jelezni.
- **Miért nem az `apps/cli`-ben?** Mert az szállított termék, és a Playwright nem való a
  függőségei közé.
- A tesztesetek **adatban** élnek (`cases/*.json`), tehát új eset = egy sor.
- **FIZETŐS** — írd oda, és hivatkozz a `.claude/skills/autotest/SKILL.md` mért
  költség-tábláira; a számok mellé a mérés dátumát.

**`### Negyedik belépési pont — MCP-szerver (09.)`**
- `apps/mcp`, stdio; az irány **megfordul**: eddig mi hívtuk a modellt, itt egy **idegen host**
  hívja a mi tooljainkat.
- Három tool három stílusban: `search_plants` (adat-tool, modell nélkül), `search_knowledge`
  (átkötött core-tool), `ask_szobakertesz` (agent-as-tool).
- **A kör biztonsági állítása:** az `ask_szobakertesz` fixen `role: 'customer'` + `print: false`
  — adminként a `delegateToIngest`-tel egy idegen host modellje **írhatna** a katalógusba. Spec
  pinneli valódi MCP-híváson át.
- Ami **nincs** kitéve: `queryCustomers`, `upsertProduct`, `delegateToIngest`, a
  `threads`/`messages` tár; és MCP-hívás semmit nem perzisztál.
- A szervert **nem kézzel indítod**, a HOST indítja (`.mcp.json`, minta: `.mcp.example.json`).
- Részletek: `docs/mcp.md`.

- [ ] **5.3 lépés: HF4-mutató és státusz-átvezetés**

- A meglévő „HF3 — hol találod a leadandókat" mellé **HF4-mutató**: `docs/hf4-ai-act.md` és
  `docs/hf4/HF4-leadas.pdf`, `hf4-ai-act` tag.
- Az MI-felirat megemlítése a felület leírásában (Task 1–2 eredménye).
- **A megnevezett korlátok maradjanak kimondva**, sőt egészüljenek ki: a `/api/threads`
  hitelesítetlensége (ez már benne van, `:153`), a beszélgetés-tár **megőrzési idejének
  hiánya**, és az **50. cikk (2)** nyitott tétele az ADR 0003-ra hivatkozva.

- [ ] **5.4 lépés: az implementációs terv táblája**

A `docs/implementacios-terv.md` „Hol tart a terv — a kurzus-alkalmak" táblájába három sor, a
meglévő oszlopokkal (`Alkalom | Mi került be | Mi maradt ki tudatosan`):

- **08.** — `tools/autotest` mérőeszköz (Playwright battery + RAGAS RAG-eval + ADR-napló);
  kimaradt: a fizetős futások CI-be emelése (a `lib`-specek mennek csak).
- **09.** — `apps/mcp` stdio MCP-szerver három toollal; kimaradt: MCPB-csomag és streamable
  HTTP + Railway-deploy (a spec 1. döntése).
- **10.** — nincs hozzá kurzus-kód, a témája a 08-ban valósult meg; a HF4 leadva
  (`hf4-ai-act` tag).

- [ ] **5.5 lépés: állítás-audit a README-n**

Menj végig a README-n, és minden **parancson és állításon** ellenőrizd, igaz-e ma:

```bash
grep -n '```bash' -A3 README.md | grep -E "pnpm |node |docker " | sort -u
```

Minden ingyenes parancsra: fut-e. Minden fizetősre: **ki van-e írva, hogy fizetős**, és a
hivatkozott szám mellett ott van-e a **mérés dátuma**. Amit nem tudsz igazolni, azt **korlátként
mondd ki** — elhallgatni nem szabad.

- [ ] **5.6 lépés: a mért hiány megszűnésének ellenőrzése**

```bash
grep -c "apps/mcp\|tools/autotest" README.md
grep -n "| 08\.\|| 09\.\|| 10\." docs/implementacios-terv.md
```

Elvárt: az első **nem 0** (a kiindulás 0 volt), a második három sort ad. **De a mérce nem a
találat**, hanem hogy egy olvasó a leírás alapján el tudja indítani mindkettőt — olvasd el a
két új szakaszt ezzel a szemmel.

- [ ] **5.7 lépés: záró zöld-ellenőrzés**

```bash
rm -rf apps/web/dist apps/web/out-tsc
pnpm nx run-many -t lint typecheck
pnpm nx run-many -t build
pnpm nx run-many -t test
```

Elvárt: zöld, és a teszt-szám nagyobb, mint az 5.1 lépésben mért kiindulás.

- [ ] **5.8 lépés: commit**

```bash
git add README.md docs/implementacios-terv.md
git commit -F - <<'EOF'
docs: README és implementációs terv szinkron a 08-09. körre (Task 5)

A README utoljára b2e7a56 (2026-08-23) óta változott, a 66d5835 és az
5fbd90c merge ELŐTT: a repó két legnagyobb képessége leírás nélkül állt.
Mérve volt: grep -c "apps/mcp\|tools/autotest" README.md -> 0.

- új szakasz a mérőeszközről (08.): miért külön workspace-csomag, és
  miért nem a .claude/ alatt — oda se lint, se typecheck, se CI nem
  futna, pont arra a kódra, ami hamis zöldet tud jelezni
- új szakasz az MCP-szerverről (09.): a három tool három stílusban, és a
  kör biztonsági állítása (role: 'customer' + print: false)
- HF4-mutató a HF3-as mellé; az MI-felirat átvezetve a felület
  leírásába
- az implementációs terv alkalom-táblája kiegészül a 08/09/10. sorral

A megnevezett korlátok kimondva maradnak, sőt bővülnek: a nyitott
/api/threads, a beszélgetés-tár megőrzési idejének hiánya, és az AI Act
50. cikk (2) nyitott tétele az ADR 0003-ra hivatkozva.

Ingyenes állítás-audit: lint + typecheck + build + test, mcp:smoke és
autotest --dump-cases ténylegesen lefuttatva. Fizetős mérés nem futott;
a fizetős állítások a meglévő naplókra hivatkoznak, kiírt mérési
dátummal.
EOF
```

---

## Záró ellenőrzés (a terv teljesülése)

- [ ] **Z.1 — a spec mind a 10 sikerkritériuma végigmérve.** Vedd elő a specet, és
  kritériumonként írd le, mi bizonyítja. Ami nem teljesült, azt **mondd ki**.
- [ ] **Z.2 — a `packages/core` diffje ÜRES.** `git diff master --stat -- packages/core`.
  Elvárt: **üres kimenet**. A 08. és 09. kör is ezt mérte; ez a kör folytatja a sorozatot. Ha
  bármi van benne, az scope-szivárgás — a spec 7. döntése kifejezetten kizárja.
- [ ] **Z.3 — a `SYSTEM_PROMPT` bájtazonossága.** Futtasd a `CLAUDE.md`-ben álló `diff`
  parancsot. Elvárt: üres kimenet.
- [ ] **Z.4 — a terv jelölőinek átírása** (`- [ ]` → `- [x]`), **külön commitban**, angolul,
  a projekt szokása szerint (`docs: mark …`).
