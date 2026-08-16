# HF3 előprogram — végrehajtás-design

> Készült: 2026-08-12. Bemenet: `docs/hf3-eloprogram-folyamat.md` (a folyamat gépezete) és a vault `HF3-eloprogram.md`-je (`Projects/ai-agensfejlesztes/07/hazifeladat/`, a tartalmi döntések és a Végrehajtási protokoll forrása).

## Mit rögzít ez a doksi

A `03 → 04 → 05 → 06` kódvezetés-doksik végigvitelének **ellenőrzési rendszerét**: mi bizonyítja futtathatóan, hogy a saját kiegészítések túlélnek egy refaktort, mikor áll meg a folyamat, és mikor kész egy alkalom.

Amit **nem** rögzít: a leckék tartalmát. Azt alkalmanként a `superpowers:writing-plans` tervezi meg, a kódvezetés-doksiból.

## Ellenőrzött kiindulási állapot (2026-08-12)

A folyamatdoksi állapotfelmérése 2026-08-11-én készült, és azóta öt ponton elavult. Ez maga is T4-eltérés (lásd lentebb), ezért itt a tényleges állapot:

| Tény | Folyamatdoksi szerint | Ténylegesen |
|---|---|---|
| `superpowers` plugin | kikapcsolva | **bekapcsolva** (`enabledPlugins` → `true`) |
| superpowers skillek | nincsenek betöltve | **betöltve** |
| új session / `/clear` kell | igen | **nem**, a `SessionStart` hook lefutott |
| `.claude/settings.local.json` mentése | kell | **tárgytalan**, nem kellett a fájlhoz nyúlni |
| stale `03-amikor-egy-agent-nem-eleg` branch | törlendő | **már nem létezik**, sem lokálisan, sem a remote-on |

Ami igazolva teljesült:

- **Zöld alapállapot**: DB fut (`szoba-kertesz-adatbazis`, pgvector, healthy), séma naprakész, 30 növény beseedelve. `core` **70/70**, `cli` **5/5**. A `migrate deploy` és a `db seed` nem kellett.
- **Referencia**: `../ai-agent-kurzus` fetchelve; mind a hét hivatkozott kurzus-hash feloldható (`4757b22`, `6c4b94f`, `7ab1fb6`, `61b9ed5`, `078e2dd`, `cd889c5`, `cc67548`).
- **Branch**: `feat/ora-03-trace-tools` létrehozva a `master` HEAD-jéről (`5f0f09b`).
- **Artifact-mappák**: `docs/superpowers/{specs,plans,reviews}`.

## Precedencia — mi nyer ütközésnél

1. **A vault `HF3-eloprogram.md` „Végrehajtási protokoll" szakasza.** Konkrétan felülírja a `subagent-driven-development` „ne állj meg két task között" szabályát (nálunk: eltérésnél megállás, protokoll 8.), és a `writing-plans` / `finishing-a-development-branch` commit- és PR-felajánlását (nálunk: commit, push, PR csak kérésre, protokoll 7.).
2. **A kódvezetés-doksi** a lépések forrása — nem a modell emlékezete, és nem a kurzus-repo mai `main`-je.
3. **A projekt `CLAUDE.md` invariánsai** — két DB-kapcsolat két jogosultsági szinttel, framework-agnosztikus `core`, read-only tool-lánc.
4. A superpowers skillek minden más eleme változatlanul érvényes.

## A saját kiegészítések — hét elem

A vault hatot sorol fel; a JSONL-logger és a `--show-prompt` a `CLAUDE.md`-ből jön, és a 2026-08-12-i döntés szerint megmarad. Minden refaktornál mind a hetet át kell vezetni.

| # | Kiegészítés | Eredet |
|---|---|---|
| 1 | `listCategories` tool | `28395d9` |
| 2 | `SELECT INTO` tiltás + pool zárása kilépéskor | `e117f3e` |
| 3 | LIMIT subquery-be csomagolva | `ed9b08a` |
| 4 | readline-guard a pufferelt sorokra | `1f9e1e5` |
| 5 | javított system prompt | `ba2bc22` |
| 6 | JSONL-logger (`logs/<timestamp>.jsonl`, token usage) | `CLAUDE.md` |
| 7 | `--show-prompt` kapcsoló | `CLAUDE.md` |

A 6. és 7. megtartása döntés, nem alapállapot: a 03. alkalom mindkettőt törölné. Az indok a HF3 **költségbecslés** leadandója — a token usage-et tartalmazó JSONL ennek a bizonyítékbázisa, konzol-nyomból visszaszámolni jóval nehezebb.

## A háromrétegű kapu

**Kiindulópont: a zöld tesztcsomag önmagában nem bizonyíték.** A kurzus a 03. Lépés 1-ben törli a `system-prompt.spec.ts`-t — ha egy refaktor a tesztet a forrásával együtt viszi, a suite attól még zöld marad. A kapunak az eróziót kell elkapnia, nem a bukást.

### 1. réteg — regressziós manifeszt

Két új spec-fájl, csomagonként egy: `packages/core/src/lib/own-additions.spec.ts` és `apps/cli/src/own-additions.spec.ts`. Mindkettő a csomag **publikus felületén** keresztül dolgozik, nem belső fájlútvonalon — ettől fájlmozgatás-tűrő: a mozgatás vagy zölden átmegy (az index újraexportál), vagy hangosan törik, de némán nem tud eltűnni.

| # | Kiegészítés | Hol | Mit állít a manifeszt |
|---|---|---|---|
| 1 | `listCategories` | core | a dispatch a `listCategories` néven ténylegesen lefuttatja, és a DB valós kategórialistáját adja vissza |
| 2 | `SELECT INTO` tiltás | core | `SELECT … INTO …` bemenetre a guard elutasít, hibaszöveggel |
| 3 | LIMIT-subquery | core | LIMIT nélküli query lefut, és a visszaadott sorszám a plafon alatt marad |
| 4 | readline-guard | **cli** | pufferelt sorok nem futnak egymásba az interaktív belépési ponton |
| 5 | javított system prompt | core | a `SYSTEM_PROMPT` konstans tartalmazza a `ba2bc22` szabályait (tisztázó kérdés, `COALESCE(sale_price, price)`); a 03. Lépés 1 után egy további állítás, hogy `buildSystemPrompt()` pontosan ezt adja vissza |
| 6 | JSONL-logger | core | egy interakció után létrejön a `logs/<timestamp>.jsonl`, benne a token usage |
| 7 | `--show-prompt` | **cli** | a kapcsolóval a teljes message-tömb kidumpolódik |

**Sorrend, ami kritikus:** a 03-as plan **legelső lépése** a manifeszt megírása a mai lapos szerkezeten, zöldre — a refaktor *előtt*. Így a manifeszt a védőháló a refaktor alatt, nem utólagos igazolás.

Két vállalt mellékhatás: valószínűleg fel kell venni néhány exportot a `packages/core/src/index.ts`-be, és lesz átfedés a meglévő specekkel. Ez utóbbi szándékos redundancia.

### 2. réteg — darabszám

Induló alap: **core 70 + cli 5**, plusz a manifeszt tesztjei. Minden lépés futtatása kiírja a számot. **Ha csökken, az megállás — akkor is, ha a suite zöld.** Ez fogja el azt az esetet, amikor egy teszt a forrásával együtt tűnik el.

### 3. réteg — élő ellenőrzés az alkalom végén

A kódvezetés-doksi „Végállapot ellenőrzése" blokkja, tényleges kimenettel beidézve. Erre a két dologra kell, amit unit teszt nem tud lefedni: a trace körönként növekvő `messages` tömbjére, és arra, hogy két tool egy loopban lefut.

**Ütemezés (2026-08-12-i döntés):** lépésenként csak `typecheck` + teszt fut (ingyenes); az élő, API-költséges `ask`-ok az alkalom **végén**, a Végállapot-blokkból.

## Eltéréskezelés — T1–T5

A protokoll 8. pontja szerint eltérésnél meg kell állni. Ha ezt minden eltérésre alkalmazzuk, a folyamat megáll a parancsnevek különbségén is. A megoldás: **az eltérések felét tervezési időben feloldjuk**, és futásidőre csak az marad, ami tényleg döntést igényel.

### Tervezési időben feloldva — futás közben nincs döntés

- **T1 — fordítási eltérés.** Ugyanaz a dolog nálad más néven. A plan-fájl **fordítótáblát** tartalmaz, és minden ellenőrző parancs már lefordítva szerepel a lépésnél.

  | Kurzus | Nálad |
  |---|---|
  | `pnpm typecheck` | `pnpm nx run core:typecheck` (+ `cli:typecheck`) |
  | `pnpm test` | `pnpm nx test core && pnpm nx test cli` |
  | `pnpm cli ask "…"` | `pnpm szobakertesz ask "…"` |

- **T2 — additív eltérés.** Nálad van valami, ami a kurzusnál nincs, és a lépés érinti, de nem törli — például a dispatchbe két tool kerül egy helyett. A plan lépése eleve a bővebb változatot írja elő; a manifeszt bizonyítja.

### Futásidőben — mindhárom megállás

- **T3 — ütköző eltérés.** A kurzus lépése törölné vagy felülírná a saját megoldásodat. A döntés a felhasználóé, és **visszaíródik a plan-fájlba módosításként** — nem marad szóbeli megállapodás.
- **T4 — tényállapot-eltérés.** A doksi kiindulási állapota nem egyezik a repo valóságával (protokoll 3.). Megállás, a tényállapot rögzítése, a plan igazítása.
- **T5 — bukott ellenőrzés.** A lépés ellenőrző parancsa nem a várt kimenetet adja. Megállás, tényleges kimenet beidézve — nem megyünk tovább arra hivatkozva, hogy majd a következő lépés megjavítja.

**Egy mondatban:** a T1–T2 előre a plan-fájlba kerül, tehát végrehajtás közben **minden eltérés megállás**. Ez az, ami a subagent-driven módban (05–06) mérlegelés nélkül átadható a subagenteknek.

## Mikor kész egy alkalom

Négy feltétel, mind kötelező:

1. A doksi **minden lépése** végrehajtva, lépésenként a lefordított ellenőrző paranccsal, tényleges kimenettel.
2. `typecheck` + teszt zöld, **és a darabszám nem csökkent**.
3. A **manifeszt zöld**, mind a hét kiegészítésre.
4. A doksi „Végállapot ellenőrzése" blokkja **élőben** lefuttatva, a tényleges kimenet a review-ba beidézve.

A lezárást a `superpowers:verification-before-completion` zárja, ami tiltja a „kész" kimondását bizonyíték nélkül.

**Elhatárolás (protokoll 7.):** a „kész" nem jelenti, hogy commitolva van. Kész = a working tree a végállapotban van és ellenőrizve. A commit, a push és a PR külön, kérésre történik; a branch a következő alkalom alapja marad.

## Az alkalmankénti ciklus

1. **Branch** — `feat/ora-NN-<tema>`, az előző alkalom branchének tetejéről. A 03-é áll: `feat/ora-03-trace-tools`.
2. **Terv** — `superpowers:writing-plans` → `docs/superpowers/plans/YYYY-MM-DD-ora-NN-<tema>.md`. Bemenete a kódvezetés-doksi, ez a spec, a repo **tényleges** `git log`-ja, és a lokális referencia-repo a hivatkozott hasheknél.
3. **Végrehajtás** — 03–04 `executing-plans` kézi ütemben; 05–06 `subagent-driven-development`, lépésenként friss implementer subagent + task reviewer. Ez utóbbi teljesíti a `CLAUDE.md` „minden Work Agent mellé Review Agent" szabályát.
4. **Zárás** — `verification-before-completion` a négy kész-feltételre; opcionálisan `requesting-code-review` a `docs/superpowers/reviews/`-be.
5. **Átadás** — a branch marad, PR nincs; a következő alkalom innen indul.

Minden plan-fájl kötelező eleme: a precedencia-blokk, a T1 fordítótábla, a T2-k előre feloldva, lépésenként a lefordított ellenőrző parancs, a STOP-szabály (T3–T5), a manifeszt-kapu és a záró akceptancia.

## Amit a 03-as plannek tartalmaznia kell

A doksi hét lépéséhez képest **négy helyen tér el** (Lépés 1, 2, 3, 6), plusz egy **előfeltétel-lépés** kerül elé, ami a kurzusban nincs. Mindegyik eltérés eldőlt.

| Lépés | Eltérés | Típus |
|---|---|---|
| **0** (új, nem a kurzusból) | a manifeszt megírása a lapos szerkezeten, zöldre — plusz a hozzá kellő exportok az `index.ts`-be | előfeltétel |
| **1** — prompt-modul | `system-prompt.ts` → `prompts.ts`, `buildSystemPromptWithDb` → `buildSystemPrompt`, **de a `system-prompt.spec.ts` nem törlődik** (a kurzus törli), csak átnevezve követi a forrást | T3 |
| **2** — dispatch | a `tools` tömbbe és az `executeTool`-ba **két** tool kerül | T2 |
| **3** — Trace | a Trace bejön, de a `logger.ts` és a JSONL **mellette marad**; a `--show-prompt` szintén, így a `szobakertesz:debug` script sem törik | T3 |
| **6** — tsx | a kurzus `pnpm cli`-t vezet be; nálad **additív** — az új gyors script a `szobakertesz` mellé kerül, nem helyette | T2 |

**Záró lépés, amit nem szabad mellékhatásként megtörténni hagyni:** a `CLAUDE.md` frissítése három ponton — a „bájtra azonos" invariáns, a „Key files" felsorolás (a fájlok `tools/` alá kerülnek), és a logolás leírása (a JSONL és a Trace mostantól egymás mellett él).

A 03 utáni darabszám-alap: **70 + a manifeszt tesztjei**, csökkenés nélkül. Mivel a `system-prompt.spec.ts` átnevezéssel megmarad, a 70-ből nem esik ki semmi.

## Amit a 06-os plan visz

Hogy a határ egyértelmű legyen, a 03-as plan ezeket **nem** tartalmazza:

- **read-only grantok migrációba emelése** — a 06-os plan **legelső** lépéseként, a pgvector-migráció elé húzva, hogy a grantok már megvannak, mielőtt bármilyen reset kellene. A kurzusnál ez utólagos javítás volt (`cc67548`, 2026-07-15). Nálad ma latens hiba: az `init.sql` csak a konténer első indulásakor fut, tehát egy `prisma migrate reset` után a szerep megmarad, a jogosultságai nem, és a `runSql` némán elszáll.
- **`CREATE EXTENSION IF NOT EXISTS "vector"` migrációban** — a 06. Lépés 1, ahol a kurzus is kezeli.
- **`OPENAI_API_KEY` a `.env`-be** — a 06. Lépés 3-nál (embedding) válik kötelezővé.

Már megvan, nem kell újra: pgvector image (`5cab1a0`), `allowBuilds` (`cb4655b`).

## Kockázatok

- **A darabszám-kapu hamis riasztást ad**, ha egy lépés jogosan von össze teszteket. Kezelés: a csökkenés megállás, nem automatikus bukás — a döntés a felhasználóé, és a plan-fájlba íródik.
- **A manifeszt duplikálja a meglévő specek egy részét.** Ez szándékos: a meglévő spec a forrásával együtt törölhető, a manifeszt nem.
- **A 05. alkalom hozza a legnagyobb új felületet** (szerver/web réteg), amit a HF3 maga nem kér. A scope-ját a plan-fázisban kell rögzíteni.
- **Egy DB, egy `.env`** — ezért nincs worktree. Párhuzamos munkához előbb a DB-izolációt kellene megoldani.
