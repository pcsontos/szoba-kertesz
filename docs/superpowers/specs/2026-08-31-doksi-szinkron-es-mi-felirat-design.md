# Doksi-szinkron és MI-felirat — design

> **Kör A** a 2026-08-31-i állapotfelmérésből. A felmérés négy tételt talált; ez a doksi az első
> hármat fogja össze, a **go-live (Kör B)** külön specet kap. Nem kurzus-alkalom: a 10–13. alkalom
> egyikéhez sem tartozik kurzus-kód, ez a kör a **saját repónk** adósságát törleszti.

## Mit rögzít ez a doksi

Mit írunk meg, milyen állásponttal, és minden döntésnél azt is, mit vetettünk el és miért. A
végrehajtási terv ebből készül; a döntéseket ott már nem kell újra kitalálni.

Egy mondatban a kör tétje: **a repó három helyen mást állít magáról, mint ami igaz** — a README
nem tud a két legutóbbi körről, a ROI egy 2026 júliusi képességhalmazt áraz, a felület pedig
elhallgatja a felhasználó elől, hogy modell válaszol neki. Mindhárom ugyanaz a hiba, három
közönség felé: fejlesztő, üzlet, felhasználó.

És egy mondat arról, miért nem „csak doksizás": a harmadik eset **lejárt jogszabályi határidő**
(AI Act 50. cikk, általános alkalmazás 2026-08-02 óta), amit a saját, már leadott HF4-ünk nevez
meg. A kör tehát egy megfelelési tételt zár le, nem kozmetikát végez.

## Kiindulási állapot — mérve, nem feltételezve

Minden alábbi állítás a repóból származik, **2026-08-31-én** mérve. Ahol egy szám korábbi
mérésből való, az külön ki van írva.

### A repó

`master` = `8db30ba`, munkafa tiszta, szinkronban az `origin/master`-rel. 12 PR, mind mergelve.
Két tag: `hf3-leadas`, `hf4-ai-act`. A kurzus 03–09. alkalma végigvíve; a 10. lezárva (nincs hozzá
kurzus-kód, a témája a 08-ban valósult meg, a HF4 leadva). **552 teszt** — ez a **09. körben**
mérve, ez a kör nem mérte újra.

Munkaág: `feat/doksi-szinkron-es-mi-felirat`, a masterről.

### A három mért hiány

| # | Állítás | Mérés | Következmény |
|---|---|---|---|
| 1 | A README nem tud a 08. és 09. alkalomról | utolsó érintő commit `b2e7a56` (2026-08-23), azaz a `66d5835` és `5fbd90c` merge **előtt**; `grep -c "apps/mcp\|tools/autotest" README.md` → **0** | a repó két legnagyobb képessége (mérőeszköz, MCP-szerver) leírás nélkül áll |
| 2 | Az implementációs terv alkalom-táblája a 07-nél áll | `grep "\| 08\.\|\| 09\." docs/implementacios-terv.md` → nincs találat | a fázis-nyilvántartás két körrel le van maradva |
| 3 | `docs/roi.md` a 04. alkalom **előttről** való | utolsó commit `5f32123` (2026-07-03); a RAG/web/MCP/mérőeszköz szavakra 2 találat, mindkettő a „webshop" szóból | egy CLI-only képességhalmazt áraz, a mai termék nevében |
| 4 | Egyetlen MI-re utaló felirat sincs a felületen | `App.tsx:193` fejléce `Szobakertész`, `:207` üres állapota „Kérdezz a növénykatalógusról…"; a CLI bannere (`interactive.ts:171`) és `--help`-je (`main.ts:41`) sem mondja | **AI Act 50. cikk (1)+(5) — lejárt határidő**, a `docs/hf4-ai-act.md` 2.3 pontja néven nevezi |

A HF4 által megadott sorszámok (`App.tsx:193`, `:207`) **ma is pontosan stimmelnek** — a
dokumentum azóta nem avult el.

### Egy architektúra-tény, ami a 7. döntést eldöntötte

| Mérés | Eredmény |
|---|---|
| `grep -rn "@szoba-kertesz/core" apps/web/` | **0 találat** — a webes app soha nem importál a core-ból |
| `apps/web/package.json` | a `@szoba-kertesz/core` **nincs** a függőségei között |
| `tsconfig.base.json` → `compilerOptions.paths` | **nincs** — a feloldás pnpm-workspace-en megy |
| `eslint.config.mjs` | `@nx/enforce-module-boundaries` `error` szinten, `enforceBuildableLibDependency: true` |

Ez nem véletlen, hanem **fenntartott invariáns**: az `apps/web` böngésző-bundle, a
`packages/core` barrelje viszont `pg`-t (`db-readonly.ts`, `db-chat.ts`) és Node-only configot
is újraexportál. A core-nak **nincs** eager mellékhatása (a poolok lazyk, `new Pool` függvényen
belül), tehát Node-ban — CLI, szerver, teszt — az importja ártalmatlan; a probléma kizárólag a
böngésző-bundle.

### Amiből a ROI mért számai jönnek

| Forrás | Mit ad |
|---|---|
| `logs/*.jsonl` — **94 futás** | valódi `usage` a válasz-rétegre |
| `README.md` „Költségbecslés" (06. kör) | katalógus-kérdés **3849 be / 235 ki**; gondozási **8702 be / 287 ki**; tudásbázis-építés ~0,55 cent |
| `logs/autotest/2026-08-26T07-12-39-154Z-battery.json` | esetenkénti `costUsd`; a RAG-grounding eset **$0,040257** |
| `tools/autotest/src/lib/cost.ts` | ár-tábla: Sonnet 4.6 $3/$15, Haiku 4.5 $1/$5 / 1M token |

**Egy mérési csapda, amit a spec szintjén rögzítünk, hogy a terv ne essen bele.** A battery
`costUsd`-je a `logs/<ts>.json` `usage` mezőjéből számol (`server-usage.ts`), ez pedig **az
agent-loop** használata. A HyDE, a rerank és az embedding a `retrieve.ts`-en belül fut, nem a
loopban — az `onStepEnd` nem látja őket. A battery száma tehát **kizárólag a válasz-réteg**, és a
README teljes ~3,6 centjével **nem** összevethető, csak annak ~3,0 centes válasz-részével.

Így összevetve a különbség **~32%**, és az oka visszafejthető: a battery esete 9139 be / **856 ki**
token, a README-é 8702 be / **287 ki**. A bemenet közel azonos, a **kimenet háromszoros** — a
battery kérdésére az agent táblázatos, tagolt választ írt. Ez nem mérési hiba, hanem a
kérdésenkénti költség természetes szórása, és a ROI-nak **sávot kell mondania, nem pontot**.

## Döntések

| # | Döntés | Amit elvetettünk, és miért |
|---|---|---|
| 1 | **Két kör:** 1–3 együtt (ez a spec), a go-live külön | Négy külön kör: négyszeres ceremónia két prózafeladatra és egy egyfájlos UI-változásra · Egy kör mind a négyre: a deploy döntései (hoszting, titkok, éles DB) elnyomnák a másik hármat, és a PR átnézhetetlen lenne · Kör A kettévágva (doksi külön, felirat külön): a jogszabályi tétel önálló PR-je vonzó, de a README úgyis a felirat után íródik, tehát a két kör összeragadna |
| 2 | **ROI: ugyanaz a forgatókönyv** (5 fős lakberendező iroda), **mért számokkal** | Új forgatókönyv (webshop ügyfél-chat): illene a mai felülethez, de látogatószám- és konverzió-feltételezéseket követelne — **gyengébb** anyag lenne, nem erősebb · Kettős forgatókönyv: kétszeres terjedelem, a második fele méretlen · Minimál „mi változott azóta" szakasz: a bevezető hamis maradna |
| 3 | **A felirat hatóköre: web + CLI** | Csak `apps/web`: szorosabban követné a HF4-et, de a CLI is közvetlenül természetes személlyel interaktál, és a kötelezettség nem felület-specifikus · web + CLI + MCP: az `ask_szobakertesz` közvetlen hívója egy **idegen host modellje**, nem természetes személy — az 50. cikk (1) alkalmazhatósága ott vitatható, ezért nem állítunk róla semmit |
| 4 | **Az 50. cikk (2) nyitva marad, de ADR rögzíti** | Megoldás most (jelölő HTTP-fejléc / üzenet-metaadat): **nem érné el**, amit a rendelkezés kér (watermarking, provenance) — megfelelési állítást nem alapozhatnánk rá, és egy álmegoldás rosszabb a bevallott hiánynál · Nyitva marad ADR nélkül: a HF4 már néven nevezi, de egy későbbi olvasó nem tudná megkülönböztetni a tudatos döntést a feledékenységtől |
| 5 | **Doksi-szinkron: kiegészítés + INGYENES állítás-audit** | Csak kiegészítés: a 13. alkalom mércéjét („minden állítás igazolható") nem teljesíti · Teljes friss-klón próba: a legerősebb bizonyíték, de valódi API-költség (`knowledge:ingest` + egy battery-futás) és a helyi DB újraépítése — a fizetős állítások helyett a **meglévő naplókra hivatkozunk, kiírt mérési dátummal** |
| 6 | **Végrehajtási sorrend: felirat → ROI → README** | A felhasználó által kért 1→2→3 (README elöl): a README a **végállapotot** írja le, elöl megírva a felirat és az új ROI után újra kellene írni. A fontossági sorrend nem változik, csak a README kerül a végére, hogy **egyszer** íródjon és igazat mondjon |
| 7 | **Felületenkénti konstans**, a `packages/core` **érintetlenül** (`apps/web/src/lib/ai-disclosure.ts` és `apps/cli/src/lib/ai-disclosure.ts`) | **JAVÍTVA a tervezés közben — az eredeti döntés mérésen bukott meg.** Először közös core-konstanst írtam elő az `ansi.ts` precedensére hivatkozva; a terv írásakor kiderült, hogy az `apps/web` **nulla** sort importál a core-ból, a `@szoba-kertesz/core` **nincs** a `package.json`-jában, és `tsconfig.base.json`-ban **nincs** `paths` — az import fel sem oldódna, felvéve pedig a barrel `pg`-t és Node-only configot húzna egy böngésző-bundle-be. Az `ansi.ts` azért érvénytelen precedens, mert az a Trace és a CLI között él, ahol **mindkét oldal Node**. · Elvetve: core-konstans + webes másolat teszttel összekötve — valódi drift-védelem, de a `apps/web`-nek fel kellene vennie a core-t dev-függőségnek, ami átlépi a mért „a web nem függ a core-tól" határt · Elvetve: külön mini workspace-csomag (`packages/disclosure`) — az egyetlen igazi „egy forrás" megoldás, de egy teljes csomag (package.json, tsconfig, lint, build-target) **egyetlen sztringért** aránytalan |
| 8 | **A felirat ÁLLANDÓ, nem elutasítható** | Elutasítható banner: az 50. cikk (5) „legkésőbb az első interakció idején"-t kér — egy eltüntethető sáv ezt csak az **első** betöltésre teljesítené, egy visszatérő felhasználónak soha |
| 9 | **Nem hivatkozunk az 50. cikk (1) „nyilvánvaló" kivételére** | A kivételre hivatkozás: a HF4 2.3 pontja már kimondta, hogy nem hivatkozunk rá, és megindokolta — ugyanezt a felületet emberi ügyintézővel is láthatná a felhasználó. Ezt a kör **nem tárgyalja újra** |
| 10 | **Egy PR az egész körre**, Task-onkénti commitokkal | PR-enkénti tétel: lásd az 1. döntést |

## A négy leadandó

### 1. MI-tájékoztatás — `apps/web` + `apps/cli`

**A mondat** (a `docs/hf4-ai-act.md` 2.3 pontjából, változatlanul):

> Ez egy MI-asszisztens — a válaszokat nyelvi modell generálja.

**Felületenként egy konstansban** él (`apps/web/src/lib/ai-disclosure.ts` és
`apps/cli/src/lib/ai-disclosure.ts` — utóbbit a CLI két fájlja használja), és minden felület a
saját formájába csomagolja. A `packages/core` **nem változik**; az indoklás a 7. döntésnél áll.

| Felület | Hol | Hogyan |
|---|---|---|
| web | `App.tsx:193` fejléc mellett | állandó, mindig látható felirat a `Szobakertész` cím alatt |
| web | `App.tsx:207` üres állapot | ~~a tájékoztatás elöl, a példakérdés utána~~ → **ELVETVE a Task 1 élő ellenőrzésén.** Megvalósítva és megnézve a böngészőben: a mondat így kétszer állt egymás alatt ~60 képponttal, ami kettőzésnek hatott. A felirat **csak a fejlécben** marad; az 50. cikk (5)-öt az teljesíti, mert az első interakció előtt **és** után is látszik — az üres állapot szövege viszont az első üzenettel eltűnne |
| CLI | `interactive.ts:171` banner | az indító sor kiegészül |
| CLI | `main.ts:41` `--help` leírás | a parancs leírása kiegészül |

**Amit a felirat NEM csinál:** nem tűnik el görgetéskor, nem elutasítható, és nem az első
üzenet után jelenik meg.

### 2. `docs/roi.md` — újraírva

A forgatókönyv (5 fős lakberendező iroda) és a szerkezet (1–7. szakasz) marad. Ami változik:

1. **A 4. szakasz (üzemeltetési költség) becslésből méréssé válik.** A régi számsor
   („≈ 1 510 input token") eltűnik, helyére a fenti négy forrás megnevezett adatai kerülnek.
2. **A költség sávként szerepel, nem pontként** — a mért 9139/856 vs. 8702/287 szórás alapján,
   a szórás okával együtt (a válasz hossza, nem a kérdés).
3. **A haszon-oldalra bejön a tudásbázis.** A gondozási kérdés 2026-07-03-án nem létezett
   képességként; a régi anyag árazni sem tudta. A `docs/golden-set.md` és a
   `docs/chunking-strategia.md` a minőségi hivatkozás.
4. **Bejön a mérőeszköz** mint a „honnan tudod, hogy jól működik" válasza (11 fok / 29 eset +
   hat RAGAS-metrika).
5. **Minden feltételezés-sor megjelölve: mért vagy becsült.** Ez volt a dokumentum legnagyobb
   gyengesége — a bér- és időbecslés (A5–A8) becslés marad, de ezentúl **láthatóan** az.
6. **A 7. szakasz (Korlátok) kiegészül** azzal, amit a mérés most tett láthatóvá: a battery
   száma csak a válasz-réteg, a RAG-pipeline három hívása nem szerepel a loop `usage`-ében.

### 3. `README.md` + `docs/implementacios-terv.md`

**README** — új tartalom:

- Szakasz a **mérőeszközről** (08.): `tools/autotest`, a nehézségi létra, a RAGAS-mérés, és hogy
  miért külön workspace-csomag és nem `.claude/` alatt.
- Szakasz az **MCP-szerverről** (09.): a három tool három stílusban, és a `role: 'customer'` +
  `print: false` rögzítés mint a kör biztonsági állítása.
- **HF4-mutató** a meglévő „HF3 — hol találod a leadandókat" mellé.
- A „Jelenlegi státusz" és a „Minőségi kapuk" szakasz átvezetése a mai állapotra.

**Implementációs terv** — az alkalom-tábla kiegészül a `08.` és `09.` sorral (mi került be, mi
maradt ki tudatosan), plusz egy sor a `10.`-ről: nincs hozzá kurzus-kód, a témája a 08-ban
valósult meg, a HF4 leadva.

**Az ingyenes audit** — ténylegesen lefuttatva, az eredmény a Task-jegyzetbe kerül:

```
pnpm nx run-many -t lint typecheck build
pnpm nx run-many -t test          # futó, seedelt Postgres kell hozzá
pnpm mcp:smoke                    # valódi MCP-kliens, modellhívás nélkül
pnpm autotest:battery --dump-cases
```

A fizetős állítások (`knowledge:ingest`, `golden:run`, `autotest:battery`, `autotest:rag`) **nem**
futnak újra: a meglévő naplókra hivatkozunk, **kiírt mérési dátummal**. Ami így sem igazolható,
azt vagy javítjuk, vagy korlátként kimondjuk — elhallgatni nem lehet.

### 4. ADR — `docs/adr/0003-ai-act-50-2-gepi-jeloles.md`

A végrehajtásban **közvetlenül a felirat után** következik, még a ROI előtt: ugyanahhoz a
jogszabályi tételhez tartozik, és a döntés akkor friss, amikor az 50. cikk (1)-et éppen
megvalósítottuk.

Az 50. cikk (2) (szintetikus szöveg gépi olvashatóságú jelölése): **megfontoltuk, elvetettük
ebben a körben.** A sablon szerint az elvetett alternatívák is felsorolva: jelölő HTTP-fejléc a
`/api/chat` válaszán, metaadat a tárolt asszisztens-üzeneteken, provenance/C2PA-szerű jelölés.
Indoklás: a technikai szabvány nincs lezárva, és egy álmegoldásra megfelelési állítást alapozni
rosszabb, mint a hiányt bevallani.

## Ami tudatosan KIMARAD

- **A go-live** minden formája (hoszting, build-configok, éles DB, titokkezelés) — ez Kör B.
- **A 07. C+D fázis** (orchestráció, voice miniapp) — a legnagyobb hiányzó *termék*-képesség,
  de nem doksi-adósság.
- **Az MCPB-csomag és a streamable HTTP** (09. kör 1. döntése) — Kör B-vel függ össze.
- **A HF4 másik két megnevezett gyengesége:** a `/api/threads` hitelesítetlensége és a
  beszélgetés-tár megőrzési ideje. **Nem** ebben a körben — mindkettő tulajdonos-fogalmat és
  auth-ot igényel, ami saját kört érdemel. A README-ben viszont **kimondva** maradnak.
- **A régi review-tételek** (`ora-04` #4–#16, `ora-05` #3/#6/#7) — a memória szerint nyitottak,
  de **ez a kör nem ellenőrizte újra**, és nem is nyúl hozzájuk.
- **Nem futtatunk fizetős mérést** (5. döntés).
- **Nem írjuk át a `SYSTEM_PROMPT`-ot.** A felirat felületi tájékoztatás, nem prompt-szabály; a
  `query-prompt.ts` ↔ `docs/system-prompt.md` bájtazonosság érintetlen marad.

## Sikerkritériumok — megfigyelhető viselkedés

Nem az, hogy „a fájl tartalmazza X-et", hanem hogy mi **figyelhető meg**:

1. **A böngészőben a felirat az első interakció ELŐTT látszik.** A web-spec `<App/>`-ot renderel
   **nulla üzenettel**, és a tájékoztató szöveg a dokumentumban van — majd üzenetekkel is, hogy
   nem tűnik el. Ez a viselkedés, nem a forráskód.
2. **A CLI indulásakor a felhasználó látja a tájékoztatást.** Az `interactive.spec.ts`
   konzol-spy-jal állítja, mit ír ki a program **ténylegesen** induláskor.
3. **Mindkét felület szövegét spec pinneli, a pontos mondattal.** Egy felületen belül egy
   forrás van (a CLI két fájlja egy konstansból dolgozik), és ha valaki átírja, a saját
   csomagja pirosat ad.
   **Vállalt korlát, mondjuk ki:** a `web` és a `cli` konstansa **két külön másolat** (7.
   döntés). Ha valaki mindkét helyen átírja a szöveget **és** mindkét specet hozzáigazítja,
   azt semmi nem fogja meg. Ezt tudatosan vállaljuk — az alternatívák ára (a web
   core-függősége vagy egy külön workspace-csomag egyetlen mondatért) nagyobb volt.
4. **A `docs/roi.md` minden száma visszakereshető.** Aki megnyitja a hivatkozott naplófájlt vagy
   doksi-szakaszt, azt a számot találja, amit az anyag állít. Ahol becslés van, ott ez ki van
   írva — nincs olyan sor, amiről ne derülne ki, mért-e vagy becsült.
5. **A ROI költség-oldala sávot mond.** Nem egyetlen „X cent/kérdés" szám áll benne, hanem a
   mért szórás és annak oka.
6. **A README-ben leírt ingyenes parancsok tényleg lefutnak** — a Task-jegyzet a valódi
   kimenetüket idézi, nem az elvártat.
7. **A README nem ígér többet, mint amit tud.** A fizetős képességeknél kiírva, hogy melyik szám
   mikor lett mérve; a `/api/threads` hitelesítetlensége és a megőrzési idő hiánya kimondva marad.
8. **Az `apps/mcp` és a `tools/autotest` megtalálható a README-ből.** Ugyanaz a `grep`, ami ma
   0-t ad, a kör után nem 0-t ad — de a mérce nem a találat, hanem hogy egy olvasó a leírás
   alapján **el tudja indítani** mindkettőt.
9. **Az ADR-ből kiderül, mit vetettünk el.** Aki később az 50. cikk (2)-re kérdez, a döntést és
   az indoklását találja, nem hallgatást.
10. **A csomag zöld marad.** `lint` + `typecheck` + `build` + `test` a kör végén is zöld, és a
    teszt-szám a felirat új eseteivel **nő**, nem csökken. (A kiindulási 552 a 09. körben mért
    érték — a kör első dolga újramérni, hogy legyen mihez viszonyítani.)
