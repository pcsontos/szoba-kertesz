# 04. alkalom — záró élő ellenőrzés (Task 11)

> Futtatva: **2026-08-17**, a `feat/ora-04-multiagent` branchen, a `639e90f` commit állapotán. Ez a doksi a `docs/superpowers/plans/2026-08-16-ora-04-multiagent.md` **Task 11**-ének eredménye: a framework-migráció (kézi loop → Vercel AI SDK 7) és a második, író agent (`ingest`) záró, **valódi API-hívásokkal és valódi adatbázissal** végzett ellenőrzése. Minden szám és idézet **tényleges kimenet** — nem várt érték. A nyers nyomok a `logs/2026-08-17T08-2*` fájlokban.

## Miért ez a doksi

A 04. alkalom két olyan dolgot csinált, amit nem elég „zöld a teszt"-tel lezárni:

1. **Kicserélte a hurkot a lábunk alatt.** A 2–3. alkalom kézzel írt tool-loopja helyére az AI SDK `generateText`-je került. A tesztek a *szerződést* védik, de azt, hogy a viselkedés és a transzparencia tényleg nem változott, csak élő futás mutatja meg.
2. **Bevezetett egy agentet, ami ÍR az adatbázisba.** Egy író út határait nem lehet elhinni — meg kell próbálni áttörni.

Ezért a terv a költséges hívásokat egyetlen záró taskba gyűjtötte. Összesen **8 agent-futás** futott le.

## 1. Automata kapu — typecheck és tesztek

`pnpm nx reset` után, majd a lezáráshoz még egyszer, `--skip-nx-cache`-sel (hogy semmi ne jöhessen cache-ből):

| Ellenőrzés | Kimenet |
|---|---|
| `pnpm nx run core:typecheck` | ✓ |
| `pnpm nx run cli:typecheck` | ✓ |
| `pnpm nx test core` | **Test Files 18 passed (18) · Tests 114 passed (114)** |
| `pnpm nx test cli` | **Test Files 3 passed (3) · Tests 9 passed (9)** |

**Darabszám-kapu:** a terv szerinti padló a Task 3-ban rögzített alap (**96**) + a Task 6/7/8/9 hozzáadásai (+4 +6 +2 +4 = 16) = **112**. A mért érték **114** — a Task 8 a tervezett +2 helyett +3-at hozott (a kaspó-szűrés regressziós tesztje). Csökkenés nincs.

## 2. Végállapot élőben — a kódvezetés-doksi blokkja

### 2.1 A viselkedés nem változott a framework-váltástól

```
pnpm cli ask "Mit ajánlasz az ACME-nek?"
```

A trace ugyanazt a ritmust mutatja, mint a 03. alkalom végén — **kör → tool → kör → válasz, körönként NŐTT üzenetszámmal**:

```
── HÍVÁS #1 · 1 üzenet ──   ↳ finishReason: tool-calls
── TOOL · getClientPreferences ──
── HÍVÁS #2 · 3 üzenet ← NŐTT ──   ↳ finishReason: tool-calls
── TOOL · runSql ──
── HÍVÁS #3 · 5 üzenet ← NŐTT ──   ↳ finishReason: tool-calls · 3153 token
── TOOL · runSql ──
── HÍVÁS #4 · 7 üzenet ← NŐTT ──   ↳ finishReason: stop · 3431 token
```

A válasz jellege is a szerződés szerinti: az ACME 1 000 Ft-os büdzséjére egyetlen raktáron lévő növény jött ki (Bazsalikom, 990 Ft), az agent **nem hallucinált** hozzá továbbiakat, megmondta, hogy az sem felel meg az „alacsony gondozási igény" elvárásnak, és **visszakérdezett** a büdzsé emelésére. Nyom: `logs/2026-08-17T08-25-15-412Z.json`.

### 2.2 A két agent külön toolkészlettel fut

| Futás | A trace `tools:` sora |
|---|---|
| `pnpm cli ask "Hány kaktusz van készleten?"` | `[runSql, listCategories, getClientPreferences]` |
| `pnpm cli ingest "állítsd a Kentia pálma készletét 9-re"` | `[runSql, fetchFeed, upsertProduct]` |

**Pontosítás a terv megfogalmazásához:** a két lista *nem* diszjunkt — a `runSql` mindkettőben ott van, mert az ingest-agent is olvas írás előtt (a promptja kifejezetten előírja). A lényeg viszont áll, és szerkezetileg, nem csak megfigyelésből: az `upsertProduct` és a `fetchFeed` **soha** nem kerül a query-agent kezébe, a `listCategories` és a `getClientPreferences` pedig soha az ingestébe. A forrás egyetlen hely, agentenként egy `buildTools`:

- `agents/query-agent/query-agent.ts:43` → `runSql` · `listCategories` · `getClientPreferences`
- `agents/ingest-agent/ingest-agent.ts:41` → `runSql` · `fetchFeed` · `upsertProduct`

Nincs központi registry, amit szinkronban kellene tartani — ezért nem tud „átszivárogni" egy tool a másik agenthez.

### 2.3 Az írás tényleg megtörténik

A trace tool-blokkja:

```
── TOOL · upsertProduct ──────────────────────────────────
  összegzés: UPSERT products (updated) · Howea forsteriana
```

Az adatbázis a futás előtt és után (`products`, admin kapcsolaton olvasva):

| Mező | Előtte | Utána |
|---|---|---|
| `id` | 31 | **31** (tehát UPDATE, nem INSERT) |
| `stock` | 7 | **9** |
| `price` / `sale_price` | 18900.00 / 15900.00 | változatlan |
| `rating` / `reviews_count` | 4.70 / 134 | változatlan |
| minden további oszlop | seed-érték | változatlan |
| a katalógus mérete | 30 termék | **30 termék** |

Ez erősebb bizonyíték, mint amit a terv kért. Az `upsertProduct` a **19 oszlopból mind a 19-et újraírja** (nem részleges UPDATE), tehát a modellnek a `runSql`-lel kiolvasott teljes sort kellett visszaadnia, egyetlen mezőt módosítva. A 18 érintetlen oszlop bitre a helyén maradt — vagyis sem a `PRODUCT_COLUMNS` térkép nem csúszott el, sem a modell nem vesztett adatot.

Az agent összefoglalója a felhasználónak: *„Készlet: 7 → 9 db. Minden más adat (ár, akciós ár, gondozási mezők stb.) változatlan maradt."*

## 3. Regresszió-kapu — a hét saját kiegészítés élőben

| # | Kiegészítés | Élő bizonyíték |
|---|---|---|
| 1 | `listCategories` tool | `ask "Milyen növénykategóriák közül választhatok?"` → a trace-ben **`── TOOL · listCategories`**, nem `runSql`. A válasz a 8 valódi kategória. |
| 2 | `SELECT INTO` tiltás + pool zárása | A manifeszt tesztje zöld; élőben a folyamat minden futás után magától leállt (nincs lógó pool). |
| 3 | LIMIT subquery-be csomagolva | A trace „SQL (guard után)" sora: a modell `LIMIT 20`-as lekérdezése `SELECT * FROM ( … LIMIT 20 ) AS _q LIMIT 50` alakban ment a DB-re. |
| 4 | readline-guard a pufferelt sorokra | Pipe-olt stdinnel a három sor (2 kérdés + `exit`) egyszerre érkezett. A `Viszlát!` **előrébb** áll a kimenetben, mint a válaszok — vagyis a readline már lezárt, de az `exit` előtt beérkezett két kérdést az agent végig kiszolgálta, egymás után, nem párhuzamosan. |
| 5 | javított system prompt | A `--show-prompt` dumpjában ott a `<rules>` kötött-szótár szabálya és az `<examples>` blokk visszakérdezős példája; a 2.1-es futás viselkedése (nem találgat, visszakérdez) ezt élőben is mutatja. |
| 6 | JSONL-logger token usage-dzsel | `logs/2026-08-17T08-27-07-914Z.jsonl` utolsó sora: `"usage": {"inputTokens": 5724, "outputTokens": 119}` + `toolSteps`. Az **ingest-agent is** ír JSONL-t, a saját katalógus-kezelő promptjával. |
| 7 | `--show-prompt` kapcsoló | A kimenetben `--- system prompt ---` (a teljes `<role>`…`</examples>`) **és** `--- üzenetek ---` (4 elem: user → assistant tool-call → tool-result → assistant szöveg). |

### 3.1 A `responseMessages`-döntés élő validálása

Ez a Task 11 legfontosabb egyedi lelete, mert egy **néma** hibaosztályt zár ki.

Az AI SDK 7-ben a `result.response.messages` **csak az utolsó kört** tartalmazza; a teljes fordulót a `result.responseMessages` adja. A beszélgetés-memória az utóbbira épül. Ha valaki „nyilvánvaló" javításként az előbbire írná át, a tesztek nagy része továbbra is zöld maradna — csak a tool-váltás esne ki csendben a memóriából.

Interaktív módban, két fordulóval (`Milyen kaktuszokat ajánlasz?` → `és olcsóbbat?`) a második forduló így indult:

```
── HÍVÁS #1 · 5 üzenet ───────────────────────────────────
  messages:
    [user]   Milyen kaktuszokat ajánlasz?
    [assistant] Hadd nézzem meg először, milyen kaktuszok vannak raktáron…
    [assistant] (⚙ runSql: SELECT name, latin_name, COALESCE(sale_price, price) AS ar, stock…)
    [tool]   [{"name":"Karácsonyi kaktusz","latin_name":"Schlumbergera truncata","ar":"2800.00"…
    [assistant] Jelenleg **2 kaktusz** található raktáron a katalógusban…
    [user]   és olcsóbbat?
```

**Öt üzenet, benne az előző kör tool-call + tool-result párja.** A `response.messages`-es változatnál ez a történet `[assistant]`-re zsugorodott volna. A modell a választ **új `runSql` nélkül**, pusztán a kontextusból adta: *„ezek közül a Karácsonyi kaktusz 2 800 Ft-tal a legolcsóbb – ennél olcsóbb kaktuszt nem találok"* — és felajánlotta a pozsgásokat. `finishReason: stop`, 0 tool-lépés.

### 3.2 A watch log `--quiet` mellett is folyik

A `logs/agent.log` egy `--quiet` ingest-futás alatt **75 656 → 77 847 bájt**-ra nőtt, miközben a konzolra csak a végső válasz ment. A `--quiet` tehát a *konzol* felét némítja, a `tail -f`-fel követhető nyomot nem.

## 4. Az író út határai

```
pnpm cli ingest --quiet "töröld a katalógusból az összes kaktuszt"
```

Az agent megtagadta:

> A törlés **nem tartozik az ingest-agent jogkörébe** – sem az `upsertProduct` tool, sem a `runSql` nem támogat törlési műveletet (`DELETE`), és a katalógus adatbázis-szerepe (`szoba-kertesz_rw`) sem engedélyezi azt.

Majd használható alternatívát ajánlott (`stock = 0` nullázás), és az adminhoz irányított. Az adatbázis a futás után: **kaktusz 2 · összes 30** — változatlan, semmi nem tűnt el.

Fontos, hogy ez **nem** a prompt jóindulatán múlik. A védelem három, egymástól független rétegben áll:

1. **Tool-réteg:** az ingest-agent toolkészletében nincs törlő tool. Amit nincs mivel megtenni, azt a modell nem tudja megtenni.
2. **SQL-guard:** a `runSql` SELECT-only, és a guard a lekérdezést subquery-be csomagolja.
3. **Postgres-szerepkör:** a `szoba-kertesz_rw` szerepnek nincs DELETE és nincs DDL joga. Ezt a `db-readwrite.spec.ts` 4 tesztje **valódi adatbázison** bizonyítja, nem mockon — a suite része, minden futásnál lefut.

A prompt szabálya (a „TÖRÖLNI nem tudsz és nem is szabad" sor) így a negyedik réteg: nem a védelem, hanem a **jó magyarázat** — ettől lesz a megtagadás használható válasz a felhasználónak, nem egy nyers hibaüzenet.

## 5. Token-mérleg — a költségbecslés bizonyítékbázisa

A 6. saját kiegészítés (JSONL-logger) pontosan ezért van. A Task 11 nyolc futásának mért fogyasztása, modell: `claude-sonnet-4-6`:

| Futás | Input | Output | Tool-lépés |
|---|---:|---:|---:|
| `ask` — „Mit ajánlasz az ACME-nek?" | 12 326 | 933 | 3 |
| `ask` — „Hány kaktusz van készleten?" | 5 741 | 140 | 1 |
| `ingest` — Kentia készlet 9-re | 11 820 | 661 | 2 |
| `ask` — „Milyen növénykategóriák…?" | 5 730 | 293 | 1 |
| `ask --show-prompt` — „Hány kaktusz van?" | 5 724 | 119 | 1 |
| interaktív, 1. forduló | 6 096 | 798 | 1 |
| interaktív, 2. forduló | 3 913 | 135 | 0 |
| `ingest` — törlési kísérlet | 3 572 | 283 | 0 |
| **Összesen** | **54 922** | **3 362** | **9** |

Két dolog olvasható ki ebből, ami a HF3 költségbecsléshez kell:

- **Az input dominál, nagyságrenddel** (54 922 vs 3 362). A költség fő hajtóereje nem a válasz hossza, hanem a *kontextus*, ami körönként nő — a system prompt minden körben újramegy. Egy 3 tool-lépéses futás (12 326 input) több mint kétszer annyi inputot fogyaszt, mint egy 1 lépéses (5 741).
- **A beszélgetés-memória olcsóbb, mint az újrakérdezés:** a 2. interaktív forduló 3 913 inputból megvolt **tool-hívás nélkül**, mert a katalógus-adat már a kontextusban volt.

Az ACME-futás trace-naplója (`logs/2026-08-17T08-25-15-412Z.json`) körre bontva is megmutatja ugyanezt — **egy futás input-tokenje nem egy szám, hanem egy növekvő sorozat**, mert minden kör újraküldi az addigi teljes beszélgetést:

| Kör | Üzenet | Input | Output | Tool |
|---|---:|---:|---:|---|
| #1 | 1 | 2 819 | 77 | `getClientPreferences` |
| #2 | 3 | 2 923 | 217 | `runSql` |
| #3 | 5 | 3 153 | 180 | `runSql` |
| #4 | 7 | 3 431 | 459 | — (végső válasz) |
| **Σ** | | **12 326** | **933** | |

A belépő 2 819 token szinte teljes egészében **fix teher**: az első kör üzenet-tömbje egyetlen, hétszavas kérdés, a többi a system prompt és a három tool sémadefiníciója. Ezt a fix terhet a negyedik körre **négyszer fizettük ki**. Ez a legfontosabb szám a becsléshez: egy tool-lépéssel többe kerülő kérdés nem +1 kör árába kerül, hanem a *teljes addigi kontextus* újraküldésébe. Innen nézve a prompt-hossz és a tool-lépések számának csökkentése ugyanaz az optimalizálás.

Forint-becslést itt szándékosan nem adunk — az árazás külön, ellenőrzött forrásból való munka (HF3). Ez a táblázat a mért nyersanyag hozzá.

**A logolás szerkezete:** 8 futás → **8 JSONL-sor 7 fájlban** és **8 trace-`json`**. A látszólagos eltérés nem hiány: az interaktív munkamenet mindkét fordulóját **egyetlen session-fájlba, két sorba** írja (`2026-08-17T08-28-05-310Z.jsonl`) — ez a JSON Lines formátum értelme. A trace ezzel szemben fordulónként külön fájlt kap.

## Eltérések a tervtől

| # | A terv | Ami történt | Miért |
|---|---|---|---|
| 1 | `pnpm exec prisma studio` az írás ellenőrzésére | Közvetlen SQL-lekérdezés a `products`-ra | A Studio böngészős GUI — nem termel idézhető, ellenőrizhető kimenetet. Az SQL igen, és a teljes sort mutatja. |
| 2 | `ingest "állítsd a Kentia pálma készletét **7**-re"` | `…**9**-re` | **A seed már 7-re állítja** a Kentia készletét (`packages/db/prisma/plants.ts:28`), és a `products` táblában nincs `updated_at` oszlop. A terv szerinti paranccsal a sor bitre ugyanaz maradt volna: az írás **megfigyelhetetlen**. Felhasználói jóváhagyással 9-re módosítva. |

**A Kentia pálma készlete 9-en maradt** (felhasználói döntés). A seed-állapot bármikor visszaáll: `pnpm exec prisma db seed`.

## Ami nyitva maradt

- **A kódvezetés-doksi „Végállapot ellenőrzése" blokkjának 1. pontja.** A terv Task 11-e a blokkot a 2. pontjától idézi. Az eredeti kurzus-dokumentum a repón kívüli vaultban van, a gépen nem találtam meg — az 1. pont tartalmát tehát **nem ellenőriztem**, abból indultam ki, hogy azt az automata kapu (1. szakasz) fedi. Ha a doksi előkerül, érdemes visszanézni.
- **A Task 8 nyitott pontja, változatlanul:** a tropicalhome-feed 307 termékéből **31-nek üres a `product_type`-ja**, ezeket a motor a tiltólistán kidobja. A Task 11 egyetlen ingest-futása sem érintette a feedet (a Kentia-módosítás `runSql` + `upsertProduct` úton ment), tehát ez **továbbra sem eldöntött kérdés**. Ha egy élő katalógus-frissítésnél hiányzik egy növény a jelöltek közül, itt kell először keresni.
- **Teszt a CI-ban** — több `core` spec valódi, seedelt Postgresre támaszkodik; a `services: postgres` blokk a 06. alkalom scope-ja.

## Reprodukálás

```bash
docker compose up -d                 # Postgres a host 5433-on
pnpm exec prisma migrate deploy      # séma + a két agent-szerepkör grantjai
pnpm exec prisma db seed             # ~30 növény

# 1. automata kapu (ingyenes)
pnpm nx reset
pnpm nx run core:typecheck && pnpm nx run cli:typecheck
pnpm nx test core --skip-nx-cache && pnpm nx test cli --skip-nx-cache

# 2-4. élő ellenőrzés (API-költséges)
pnpm cli ask "Mit ajánlasz az ACME-nek?"
pnpm cli ask "Hány kaktusz van készleten?"
pnpm cli ask "Milyen növénykategóriák közül választhatok?"
pnpm cli ask --show-prompt "Hány kaktusz van?"
pnpm cli ingest "állítsd a Kentia pálma készletét 9-re"
pnpm cli ingest --quiet "töröld a katalógusból az összes kaktuszt"
printf 'Milyen kaktuszokat ajánlasz?\nés olcsóbbat?\nexit\n' | pnpm cli

# 5. a token-mérleg kiolvasása
ls -t logs/*.jsonl | head -1 | xargs tail -1 | python3 -m json.tool | grep -A3 usage
```

Az interaktív mód pipe-olva is működik — pont ezt védi a 4. saját kiegészítés (readline-guard). Élő használatnál a `tail -f logs/agent.log` egy másik terminálban `--quiet` mellett is követhető.

## Kapcsolódó doksik

- `docs/superpowers/plans/2026-08-16-ora-04-multiagent.md` — a végrehajtott terv, taskonkénti végrehajtási jegyzetekkel
- `docs/architektura.md` — a `core` `agents/` + `tools/` bontása és a három DB-kapcsolat
- `docs/system-prompt.md` — a query-agent prompt-szerződése (bájtazonos a kóddal)
- `CLAUDE.md` — a projekt invariánsai és a parancsok
