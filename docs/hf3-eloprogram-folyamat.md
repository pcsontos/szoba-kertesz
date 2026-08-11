# HF3 előprogram — technikai folyamat a kódvezetés-doksik végigvitelére (03 → 04 → 05 → 06)

> Állapotfelmérés dátuma: 2026-08-11. A **tartalmi** döntések forrása a vault `HF3-eloprogram.md`-je (a repón kívül: `Projects/ai-agensfejlesztes/07/hazifeladat/`), ez a doksi a **végrehajtás gépezetét** rögzíti.

## Kontextus

A `szoba-kertesz` repót végig kell vinni a kurzus 03., 04., 05. és 06. alkalmának kódvezetés-dokumentumain, hogy meglegyen a HF3 (RAG) előfeltétel-lánca. A tartalmi döntések már megvannak írásban (B út, sorrend, előfeltétel-lánc bizonyítékokkal), és a lépések is (négy kódvezetés-doksi, commit-hashekkel és ellenőrző parancsokkal).

Ami hiányzott — és amit ez a doksi ad meg — a végrehajtás gépezete: hogyan kapcsolódik be a superpowers, ki tervez, ki hajt végre, hol vannak az ellenőrzési kapuk, és mi történik, ha a saját repo eltér a kurzusétól.

Ez a doksi **nem** a leckék tartalmát tervezi meg. Azt alkalmanként a `writing-plans` skill fogja, a kódvezetés-doksiból.

## Ellenőrzött kiindulási állapot

| Tény | Állapot |
|---|---|
| `superpowers` plugin | telepítve (6.2.0, user + local scope), de **`.claude/settings.local.json` → `"superpowers@claude-plugins-official": false`** |
| superpowers skillek | **nincsenek betöltve**, amíg a plugin ki van kapcsolva |
| aktiválás módja | `SessionStart` hook, `startup\|clear\|compact` matcherrel → **új session vagy `/clear` kell** |
| default branch | **`master`** (nem `main`), HEAD: `8c85fb8` |
| `03-amikor-egy-agent-nem-eleg` branch | elavult: `19d47cb`-n áll, **0 saját commit**, 3 committal a master mögött |
| referencia-repo | `../ai-agent-kurzus` lokálisan megvan, `upstream` → sajtosistvan, utolsó fetch 2026-08-10 |
| kurzus commit-hashek feloldhatók lokálisan | ✅ ellenőrizve: `4757b22`, `6c4b94f`, `7ab1fb6`, `61b9ed5`, `078e2dd`, `cd889c5`, `cc67548` mind `commit` |
| `docs/superpowers/` | még nem létezik |
| 06-hoz kellő infra | pgvector image ✅ (`5cab1a0`), `allowBuilds` ✅ (`cb4655b`), `CREATE EXTENSION vector` migrációban ❌, read-only grantok migrációban ❌ (csak `init.sql`), `OPENAI_API_KEY` a `.env`-ben ❌ |

## Döntések

1. **Brainstorming egyszer, a folyamatra** — nem alkalmanként a tartalomra. A kódvezetés-doksi már kész spec; a `brainstorming` a folyamat-designra fut le, egyszer.
2. **Vegyes végrehajtás** — 03–04 kézi ütemben, 05–06 subagent-driven.
3. **Alkalmanként új branch a masterről**, egymásra épülve.
4. **Artifactok a repóban**: `docs/superpowers/{specs,plans,reviews}`, commitolva (a kurzus-repo mintájára).

## Precedencia — mi nyer ütközésnél

Ezt a sorrendet minden plan-fájl fejlécébe be kell írni, mert a superpowers skillek alapértelmezései több ponton ütköznek a saját protokollal:

1. **A vault `HF3-eloprogram.md` „Végrehajtási protokoll" szakasza** — ez nyer mindenek felett. Konkrétan felülírja:
   - `subagent-driven-development` → *„Continuous execution: do not pause to check in between tasks"* ⟶ **nálunk: eltérésnél vagy bukott ellenőrző parancsnál azonnali megállás** (protokoll 8.).
   - `writing-plans` / `executing-plans` → *„Frequent commits"*, `finishing-a-development-branch` → PR-felajánlás ⟶ **nálunk: commit, push, PR csak kérésre** (protokoll 7.).
2. **A kódvezetés-doksi** a lépések forrása — nem a modell emlékezete, és nem a kurzus-repo mai `main`-je (az már a 13. alkalomnál tart).
3. **A projekt `CLAUDE.md` invariánsai** — két DB-kapcsolat két jogosultsági szinttel, framework-agnosztikus `core`, read-only tool-lánc.
4. A superpowers skillek minden más eleme (TDD, verification-before-completion, review-párosítás) változatlanul érvényes.

> ⚠️ **Egy invariáns menet közben elavul.** A `CLAUDE.md` most azt írja, hogy `system-prompt.ts` **bájtra azonos** kell legyen a `docs/system-prompt.md`-vel. A 03. alkalom 1. lépése a promptot `prompts.ts`-be mozgatja — a 03-as plan-fájlnak tartalmaznia kell egy explicit lépést, ami a `CLAUDE.md`-t (és a `docs/system-prompt.md` hivatkozásait) ehhez igazítja. Ezt ne a refaktor mellékhatásaként hagyd megtörténni.

## 0. lépés — Setup (egyszeri)

1. **Backup**: `.claude/settings.local.json` → `.claude/settings.local.json.bak` (a fájl nincs gitben, a `CLAUDE.md` szabálya szerint backup kell).
2. **`/plugin`** → `superpowers@claude-plugins-official` bekapcsolása erre a projektre. Kézi szerkesztés helyett a `/plugin` menü ajánlott — az írja az `enabledPlugins` blokkot, a fájlban lévő token érintetlen marad.
3. **Új session** (vagy `/clear`) — enélkül a `SessionStart` hook nem fut le, és a skillek nem töltődnek be.
4. **Ellenőrzés**: az új sessionben megjelennek a `superpowers:*` skillek (`brainstorming`, `writing-plans`, `executing-plans`, `subagent-driven-development`, `test-driven-development`, `verification-before-completion`, `using-git-worktrees`, `finishing-a-development-branch`, …).
5. **Zöld alapállapot**: `docker compose up -d` → `pnpm exec prisma migrate deploy` → `pnpm exec prisma db seed` → `pnpm nx test core && pnpm nx test cli`. Ha ez nem zöld, a lépésenkénti ellenőrzésnek nincs viszonyítási alapja.
6. **Referencia frissítése**: `git -C ../ai-agent-kurzus fetch upstream`.
7. **Branch-higiénia**: a stale `03-amikor-egy-agent-nem-eleg` törlése (0 saját commitja van, a commitja a master őse — nem vész el vele semmi), majd `feat/ora-03-trace-tools` a mai `master`-ről.
8. `mkdir -p docs/superpowers/{specs,plans,reviews}`.

## 1. lépés — Folyamat-brainstorming (egyszer, az új sessionben)

`superpowers:brainstorming`, de **kötött bemenettel**, hogy ne tárgyalja újra az eldöntött dolgokat.

**Amit adottként kell átadni neki** (nem kérdésként): B út, sorrend 03→04→05→06, célrepo és referencia-repo, a fenti precedencia-sorrend, a vegyes végrehajtási mód, a branch-stratégia, az artifact-hely.

**Amit valóban tervezzen meg** (ezek nyitottak):

- a saját kiegészítések átvezetésének ellenőrzési módja refaktoronként (`listCategories`, `sql-guard` `SELECT INTO`-tiltás + LIMIT-subquery, readline-guard, javított system prompt) — mi a konkrét, futtatható bizonyíték, hogy egy refaktor után is élnek;
- az alkalmankénti „kész" definíciója (a kódvezetés-doksi „Végállapot ellenőrzése" blokkja + a saját regressziós tesztek);
- mi történik, ha a saját repo eltér a kurzusétól (mikor követjük a kurzust, mikor tartjuk meg a sajátot) — a protokoll 8. pontjának operatív kifejtése;
- a 06-hoz hiányzó infra-elemek (`CREATE EXTENSION vector` migrációban, read-only grantok migrációba, `OPENAI_API_KEY`) melyik alkalom plan-jébe kerüljenek.

**Kimenet**: `docs/superpowers/specs/YYYY-MM-DD-hf3-eloprogram-vegrehajtas-design.md`.
**Felülírás**: a skill a végén commitolna — ne tegye, commit csak kérésre.

## 2. lépés — Alkalmanként terv (`superpowers:writing-plans`)

Alkalmanként **egy** plan-fájl: `docs/superpowers/plans/YYYY-MM-DD-ora-NN-<tema>.md`. Négy külön fájl, nem egy közös.

Bemenet a tervezéshez:

- a vault kódvezetés-doksija (`Projects/ai-agensfejlesztes/NN/NN-*_kodvezetes.md`) — a lépések, diffek és ellenőrző parancsok forrása;
- az 1. lépés folyamat-spec-je;
- a repo **tényleges** állapota (`git log --oneline`), nem a doksi táblázata (protokoll 3.);
- a lokális referencia-repo a hivatkozott hasheknél (`git -C ../ai-agent-kurzus show <hash>`).

Minden plan-fájl kötelező elemei:

- a precedencia-blokk (fent) a fejlécben;
- lépésenként a doksi ellenőrző parancsa, és hogy **a tényleges kimenettel** kell beszámolni, nem a várttal;
- **STOP-szabály**: eltérés a kurzustól vagy bukott ellenőrzés → megállás és jelzés, találgatás nélkül;
- **saját-kiegészítés-kapu**: a refaktort érintő lépések után explicit ellenőrzés, hogy a `listCategories` a helyén van (03-nál az `executeTool` dispatchben, 04-től a query-agent `buildTools`-ában) és a guardok élnek;
- záró akceptancia: a doksi „Végállapot ellenőrzése" blokkja.

## 3. lépés — Végrehajtás

**03 és 04 — kézi ütem** (`superpowers:executing-plans`). Itt megy át a lapos `packages/core/src/lib/` szerkezet `tools/` + `agents/` bontásba, és jön az AI SDK-migráció — ez az a két alkalom, ahol a saját kiegészítések elveszhetnek. Minden lépés után látható a tényleges kimenet, és onnan megy tovább.

**05 és 06 — subagent-driven** (`superpowers:subagent-driven-development`). Additív rétegek (szerver/web, majd RAG). Lépésenként friss implementer subagent + task reviewer — ez egyben teljesíti a `CLAUDE.md` „minden Work Agent mellé Review Agent" szabályát is. A STOP-szabály a plan-fájlból érvényes marad az orchestratorra.

Mindkét módban: **commit, push, PR csak kérésre**.

## 4. lépés — Alkalmanként zárás

`superpowers:verification-before-completion` → a doksi végállapot-ellenőrzése lefuttatva, tényleges kimenettel. Opcionálisan `superpowers:requesting-code-review` → a review a `docs/superpowers/reviews/`-be. A `finishing-a-development-branch` felajánlja a PR-t — **a branch megtartása a válasz**, hacsak nem kérjük a PR-t.

Ezután a következő alkalom branche az előző tetejéről indul (`feat/ora-04-…` a `feat/ora-03-…`-ból), mert a lánc egymásra épül.

## Érintett fájlok és helyek

- `.claude/settings.local.json` — a plugin bekapcsolása (backup előtte)
- `docs/superpowers/{specs,plans,reviews}/` — a folyamat artifactjai
- `CLAUDE.md` — a „`system-prompt.ts` bájtra azonos" invariáns a 03. alkalomnál frissítendő
- `packages/core/src/lib/{agent,system-prompt,runsql-tool,list-categories-tool,sql-guard,db-readonly}.ts` — ezek szerveződnek át 03–04-ben
- `packages/db/prisma/migrations/` — 06-hoz `CREATE EXTENSION vector` + a read-only grantok migrációba emelése (ma csak `init.sql`-ben vannak)
- vault: `Projects/ai-agensfejlesztes/{03,04,05,06}/*_kodvezetes.md`, `07/hazifeladat/HF3-eloprogram.md`
- referencia: `../ai-agent-kurzus` (csak olvasás)

## Ellenőrzés — honnan tudjuk, hogy a folyamat áll

1. **Plugin él**: új sessionben ott vannak a `superpowers:*` skillek, és meghívható a `superpowers:brainstorming`.
2. **Alapállapot zöld**: `pnpm nx test core && pnpm nx test cli` fut, a DB áll és seedelt (a `core` egyes specjei valós DB-t hívnak).
3. **Referencia feloldható**: `git -C ../ai-agent-kurzus cat-file -t 4757b22` → `commit`.
4. **Branch tiszta indulás**: `git log --oneline -1` a `feat/ora-03-trace-tools`-on = a mai `master` HEAD-je.
5. **Lépésenként**: a kódvezetés-doksi adott lépésének ellenőrző parancsa, tényleges kimenettel.
6. **Alkalmanként**: a doksi „Végállapot ellenőrzése" blokkja teljesül — a 03-nál pl. a trace-ben körönként növekvő `messages` tömb, két tool egy loopban, élő visszautaló kérdés interaktív módban.
7. **Regresszió-kapu minden refaktor után**: a `listCategories` kategória-kérdésre ténylegesen meghívódik (nem `runSql`), és a `sql-guard` tesztek zöldek.

## Kockázatok

- **A brainstorming újratárgyalja az eldöntött kérdéseket** (HARD-GATE-je erre hajlamos) → a kötött bemenet a védelem; ha mégis A/B úton kezd el kérdezni, meg kell állítani.
- **A subagent-driven „ne állj meg" szabálya elnyomja a protokollt** → ezért kerül a STOP-szabály magába a plan-fájlba, amit a subagentek megkapnak.
- **A 05. alkalom hozza a legnagyobb új felületet** (szerver/web réteg) — a scope-ját a plan-fázisban kell rögzíteni, mert a HF3 maga nem kér webet; csak a `debug-knowledge.ts` és a tool-kártyák miatt van benne.
- **Egy DB, egy `.env`** — ezért nincs worktree. Ha mégis párhuzamos munkára lenne szükség, előbb a DB-izolációt kell megoldani.
- **A globális `CLAUDE.md` hivatkozik egy `workflow` skillre, ami ebben a projektben nincs betöltve** — ezt a szerepet itt a superpowers workflow-skilljei töltik be.
