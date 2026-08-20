# HF3 leadandók — design

> Készült: 2026-08-20. Branch: `feat/hf3-leadandok` (a `master` `3ba8e14` merge-commitjáról ágaztatva).
> Bemenet: a vault `ora7hw.md`-je (`Projects/ai-agensfejlesztes/07/hazifeladat/ora7hw.md`) — a HF3 kiírása, a 7. óra anyagában leadva, de a **6. órához** (RAG) tartozik.

## Mit rögzít ez a doksi

A 06. alkalom lefutása **után** hiányzó HF3-leadandók tervét: a chunking-továbbfejlesztést, a golden setet a negatív teszttel, a `docs/ARCHITEKTURA.md`-t az ábrával, a költségbecslést és a multi-provider szereposztás leírását.

Amit **nem** rögzít: a már kész RAG-pipeline-t. Az ingest, a HyDE, a rerank, a grounding és a debug-végpontok a `docs/superpowers/plans/2026-08-18-ora-06-rag.md` terv alapján megépültek és futnak. Ez a doksi az arra ráépülő, hiányzó hatot tervezi.

## Kiindulási állapot — mérve, nem feltételezve

**Korpusz** (`seed/knowledge/`, B opció, a kurzus 202 angol Sill-cikke):

| mérték | érték |
|---|---|
| dokumentum | 202 |
| szó | 143 366 |
| törzs karakter | medián 4051 (p25 2534 · p75 5743 · max 14 229) |
| kategória | `plants-101` 112 · `ask-the-sill` 38 · `outdoor-plant-care` 25 · `care-miscellaneous` 24 · `the-basics` 3 |

**A jelenlegi chunker kimenete** (`chunkMarkdown`, `maxChars=1000`, 2041 darab):

| tünet | mérés |
|---|---|
| törpe darabok | 462 db (23%) < 200 karakter; 196 db < 80; a legkisebbek 3 karakteres üres `###` csonkok |
| üres címsor-bekezdés a korpuszban | 75 db |
| kontextus nélküli darabok | 394 db (19%) egyetlen címsort sem tartalmaz |
| **elveszett tárgy** | **860 db (42%) nem tartalmazza a saját cikke címének kulcsszavát** |
| darabméret | min 3 · p10 86 · medián 429 · p90 946 · max 1932 karakter |

**Miért ez a baj, és miért pont ezen a korpuszon.** A 112 `plants-101` cikk szerkezete azonos: h1 = a növény neve, h2 = `Sunlight` / `Water` / `Humidity` / `Temperature` / `Soil` / `Common Problems` / `Precautions`. Megszámolva, hány **különböző cikkben** fordul elő ugyanaz a h2:

```
26  Humidity        23  Water          22  Sunlight
26  Temperature     23  Soil           25  Common Problems
```

Ezek a darabok a vektortérben szinte megkülönböztethetetlenek, mert **a növény neve nincs bennük**. A „milyen gyakran öntözzem a kígyónövényt?" kérdés 23 majdnem azonos `## Water` darabbal találkozik, és a rerank is csak közülük tud választani. Ez nem elméleti kockázat: a 42%-os szám ezt méri.

**A bekezdés rossz atomi egység ezen a korpuszon**: a 4941 bekezdés **51%-a rövidebb 100 karakternél** (listaelemek, kiemelt egysorosok). A szakaszméret minden címsor-szinten vágva medián 366 (26% < 200), csak h1–h3-on vágva medián 589 (9% < 200), de p90 = 3579.

**Küszöb sehol nincs a rendszerben.** A `searchChunks` mindig visszaadja a 20 legközelebbit, akármilyen távol vannak. A `rerankHits` lepontozza őket 0–10-ig, de **egyet sem dob el** — csak rendez és vág top-5-re (`rerank.ts:113-127`). A `searchKnowledge` csak akkor mond „nincs találat"-ot, ha a **tudásbázis üres** (`search-knowledge-tool.ts:49`). Ráadásul a rerank-pontszám **nem megy be a modellhez**: a payload csak `title`, `source`, `content`, `distance` (`search-knowledge-tool.ts:62-67`). A negatív teszt tehát jelenleg **kizárólag** a `<grounding>` prompt-szabályon áll — pontosan az az eset, amire a kiírás figyelmeztet („enélkül a prompt-szabály csak dísz").

**Fájlnév-ütközés.** A gép fájlrendszere kis-nagybetű-érzéketlen: `docs/ARCHITEKTURA.md` ugyanaz a fájl, mint a meglévő `docs/architektura.md`. A gitben viszont `architektura.md` néven áll, tehát egy case-érzékeny rendszeren klónozó értékelő a kért néven **nem találja meg**. A meglévő doksira a `README.md` kétszer és a `CLAUDE.md` egyszer hivatkozik (a régi tervdoksik hivatkozásai történeti dokumentumok, nem frissítendők).

## Döntések

A brainstorming során hozott, felhasználói döntések — a spec ezekre épül, nem tér el tőlük.

| # | döntés | mit vetettünk el, és miért nem az lett |
|---|---|---|
| 1 | **Chunking: csak a címsor-útvonal előtag** | A „szakaszhatár csak h1–h3 + törpe-összevonás + előtag" hármast elvetettük: a kiírás figyelmeztet, hogy „a felesleges túlbonyolítás sem érdem". Az előtag egymagában a legnagyobb hatású tétel (a 42%-os hiányra megy rá). |
| 2 | **Az üres címsor-csonkok eldobása** | Nem stratégia-bővítés, hanem az 1. döntés **mellékhatásának** kivédése: előtaggal a 75 üres csonkból `… › ###` lesz — egy jól embeddelődő, címszerű darab **üres tartalommal**. A breadcrumb ezeket nem semlegesíti, hanem felerősíti. A 462 törpe darab és a h5/h6-vágás a döntés szerint **marad**. |
| 3 | **Golden set: szkript, generált táblázattal** | A kézi debug-végpont-kattintást és a Vitest-specet elvetettük. Indok: a chunking-változás miatt a mérést **kétszer** kell lefuttatni, és egy parancs újrafuttatható, a kézi másolás nem. |
| 4 | **Negatív teszt: előbb mérünk, utána döntünk** | Nem építünk előre rerank-küszöböt. Először a MAI kódon mérjük, kimondja-e a modell. Ha kimondja, az a legerősebb bizonyíték, hogy a grounding nem dísz. Ha hallucinál, akkor jön a küszöb, és a doksiban **mindkét** mérés szerepel. |
| 5 | **`docs/architektura.md` → `docs/architektura-monorepo.md`** | Így szabadul fel a `docs/ARCHITEKTURA.md` név, pontosan a kért alakban, minden értékelő gépén. A „külön néven" és a „fejezetként a meglévőbe" változatot elvetettük: az utóbbi a kiírás „külön dokumentum" kérésének is ellentmond. |
| 6 | **Ábra: mermaid forrás + bekommitolt kép** | A mermaid verziókövetett és a GitHub kirajzolja; a kép a kiírás „screenshot / export a repóba" betűjét teljesíti. |
| 7 | **Golden set nyelve: vegyes, szándékosan** | Túlnyomóan magyar (ez a valódi termék), de 2 angol kontroll-kérdéssel. Az angolnál a nyelvi szakadék nulla, tehát ott a nyers/teljes különbség **tisztán** a HyDE és a rerank érdeme. Csak magyarral a mérés nagyrészt a fordítást mérné, csak angollal a magyar felhasználó útját egyetlen sor sem fedné le. |

## A kritikus sorrend

Ez a design legfontosabb megkötése: **az „előtte" mérésnek a chunker átírása ELŐTT kell lefutnia.** Ha a chunkert előbb írjuk át, az alapvonal elveszett — visszaszerzéséhez a régi chunkerrel újra kellene ingestelni, ami még egy fizetős kör.

```
    ┌─ a MAI kódon, a MAI tudásbázison ─┐
 1. golden set kérdései + futtató szkript
 2. „előtte" mérés  → docs/golden/futas-regi-chunker.md
 3. negatív teszt mérése (agent-szintű futás)
    └───────────────────────────────────┘
 4. chunk.ts átírása + unit tesztek
 5. újra-ingest (valódi OpenAI-költség)
 6. „utána" mérés   → docs/golden/futas-uj-chunker.md
 7. docs/golden-set.md — a kézzel írt ELEMZÉS
 8. docs/chunking-strategia.md — az indoklás
 9. átnevezés + docs/ARCHITEKTURA.md + mermaid + képexport
10. README: költségbecslés + multi-provider szereposztás
11. CLAUDE.md átvezetés
```

**A hat leadandó és a helye** (a kiírás „Leadandók (összefoglalva)" listája szerint):

| leadandó | hol |
|---|---|
| működő repo + futtatási instrukciók | `README.md` + `CLAUDE.md` — **megvan**, a 06. alkalomból |
| chunking-stratégia leírása indoklással | `docs/chunking-strategia.md` |
| golden set + nyers vs. teljes + negatív teszt | `docs/golden-set.md` (+ a generált `docs/golden/futas-*.md`) |
| multi-provider szereposztás leírása | `README.md` |
| `docs/ARCHITEKTURA.md` + ábra-screenshot | `docs/ARCHITEKTURA.md` + `docs/img/` |
| költségbecslés | `README.md` |

## 1. A chunker

`chunkMarkdown(text, options)` egy új, **opcionális** opciót kap: `docTitle?: string`. Az opcionalitás nem kényelem: így a meglévő `chunk.spec.ts` esetei változatlanul futnak, és a változás bizonyíthatóan additív.

**Címsor-útvonal.** A függvény menet közben karbantart egy szint-indexelt útvonalat: `#…` bekezdésnél kiolvassa a szintet és a címet, levágja az útvonalat az adott szint alá, majd beírja az új címet. Minden darab **a saját kezdetén érvényes** útvonalat kapja — nem a végén érvényeset, mert egy darab több alcímet is átfoghat.

```
How To Care for a Snake Plant › Common Problems

Yellowing leaves are usually a sign of overwatering…
```

Az előtag a **`content` mezőbe** kerül, nem új oszlopba. Következmény: nincs migráció, és a modell is látja, melyik szakaszból idéz — ez a groundingnak is jót tesz. Ha a h1 szövege megegyezik a `docTitle`-lel, nem ismételjük meg.

**Üres csonkok.** Ha egy darab törzse a címsorsorok levonása után üres, a darab kimarad, és a megmaradók `index`-e folytonos marad (a `chunk_index` a forrás-hivatkozás sorrendjét adja, tehát nem lehet hézagos).

**Betöltő.** Az `ingest-knowledge.ts` átadja a címet: `chunkMarkdown(document.body, { docTitle: document.title })`.

**Unit tesztek** (a kiírás kifejezetten kéri: „a chunkolás determinisztikus, tehát tesztelhető"), a meglévő `chunk.spec.ts`-be:

- minden darabon rajta van az előtag
- az előtag a **beágyazó** szakaszt tükrözi, nem a záró alcímet (két alcímet átfogó darab esete)
- a h1 nem duplázódik a `docTitle`-lel
- az üres címsor-csonkok kiesnek, és az indexek hézagmentesek
- `docTitle` nélkül a kimenet változatlan (regresszió-védelem)

## 2. A golden set

**Szkript:** `pnpm golden:run --label <név>` → `apps/cli/src/golden-run.ts`. Ugyanaz az üzemeltetői minta, mint a `knowledge:ingest`: közvetlenül a konzolra ír, nincs Trace, és nincs a commander-parancsok között — ez nem agent-képesség.

**Kérdések:** `seed/golden-set.json`, verziókövetve, a korpusz mellett, a `findKnowledgeDir` mintájára felfelé keresett gyökérrel. Pontosan **8 kérdés**: 5 magyar tematikus + 2 angol kontroll + 1 magyar negatív (olyan téma, amiről a korpusz nem szól). A negatív kérdés azért magyar, mert a valódi felhasználó is magyarul kérdez — a grounding próbáját a termék tényleges útján kell elvégezni.

Kérdésenként két futás ugyanazon a `retrieveKnowledge`-en:

| mód | opciók |
|---|---|
| nyers | `{ useHyde: false, useRerank: false, topK: 5 }` |
| teljes | `{ useHyde: true, useRerank: true, topK: 5 }` |

A negatív kérdésnél **ezen felül** egy valódi agent-futás (`askAgent`), mert a kiírás azt kéri, hogy *az agent mondja ki* — ez generálás, nem retrieval, és a retrieval-táblázat önmagában nem bizonyítja.

**Kimenet:** `docs/golden/futas-<label>.md` — kérdésenként a két találati lista (cím, `chunk_index`, távolság, rerank-pontszám), és a fejlécben a futás időpontja + a label.

**Két külön fájl, szándékosan.** A szkript csak a *generált* mérést írja. A leadandó **`docs/golden-set.md` kézzel írt elemzés**, ami ezekre a futásokra hivatkozik: a kérdéslista és miért pont az, a nyers vs. teljes összevetés, **legalább egy kérdésnél a rerank átrendezésének konkrét bemutatása** és annak indoklása, hogy miért jobb az új sorrend, a negatív teszt eredménye, és a régi vs. új chunker összevetése. Elemzést nem lehet generálni — és a B opciónál pont az elemzésen van a súly.

**Ismert kockázat, előre kimondva:** a memóriában rögzített `yellow leaves` mérésnél a rerank alig rendezett át, a javulás nagyrészt a HyDE-tól jött. A kiírás erre az esetre külön felkészít („ha egyetlen kérdésnél sem rendez át semmit, az is eredmény"), de a kérdéslistába **szándékosan kerül olyan kérdés is, ahol a rerank valószínűleg dolgozik**: ahol a szó szerinti egyezés félrevisz, de a valódi válasz más szavakkal beszél ugyanarról (ezt a `rerank.ts` fejlécének példája — túlöntözés → gyökérrothadás — pont megfogalmazza).

## 3. Dokumentumok

### `docs/chunking-strategia.md` (új)

A kiírás **önálló leadandóként** sorolja fel: „chunking-stratégia leírása indoklással". A kód és a tesztek nem helyettesítik — az indoklás maga a leadandó, és a B opciónál ezen van a súly.

Tartalom: a fenti korpusz-mérések (az azonos h2-k táblázata, a 42%, a 23%, az 51%) → **mi következik belőlük** → mit választottunk és **mit nem, és miért nem**. A 2. döntés (üres csonkok) itt nem külön ötletként, hanem az 1. döntés kikényszerített következményeként szerepel. Kimondja azt is, amit tudatosan hagytunk benne: a 462 törpe darabot és a h5/h6-vágást — a kiírás „a felesleges túlbonyolítás sem érdem" mondatára hivatkozva. A hatás bizonyítéka nem itt van, hanem a `docs/golden-set.md`-ben; a két doksi egymásra hivatkozik.

### `docs/ARCHITEKTURA.md` (új, csak terv — nem implementáljuk)

Előtte: `git mv docs/architektura.md docs/architektura-monorepo.md` — a case-érzéketlen fájlrendszer miatt **két lépésben** (ideiglenes néven át, majd a végleges névre), különben a git nem érzékeli a változást. Utána a `README.md` két és a `CLAUDE.md` egy hivatkozása átírva.

Tartalom, a kiírás négy kérdésére felelve:

1. **Honnan tudjuk, hogy egy dokumentum változott** — dokumentumonkénti tartalom-hash; ami nem változott, nem vektorizálódik újra
2. **Új dokumentum** útja
3. **Törölt dokumentum** chunkjainak sorsa
4. **Mi triggereli** az újraindexelést
5. A mermaid-ábra + a bekommitolt kép: forrás → változásérzékelés → chunk → embed → tárolás, **és a törlés/módosítás útja**
6. Egy őszinte „mit NEM építünk meg, és miért" szakasz — a jelenlegi TRUNCATE + újratöltés kis korpusznál helyes válasz, és ezt ki kell mondani, nem elfedni

### `README.md`

**Költségbecslés** (a kiírás egy rövid bekezdést kér):

- az ingest összköltsége — a valódi karakterszámból és a `text-embedding-3-small` áraiból
- egy kérdés ára a teljes pipeline-nal — a válasz-oldal tokenszáma a meglévő JSONL-logokból

**A módszer korlátja, előre kimondva:** a HyDE és a rerank tokenjei **nem szerepelnek a JSONL-ben** — azok a `retrieve.ts`-en belül futnak, nem az agent-loopban, tehát az `onStepEnd` nem látja őket. Ezekre a mért karakterszámokból adunk becslést, és a README kimondja, hogy ez becslés. **Token-elszámoló infrastruktúrát nem építünk** hozzá; a kiírás nagyságrendet kér („elég a nagyságrend, de a saját számaidból"). Az aktuális modellárak a `claude-api` skillből ellenőrizendők, nem emlékezetből.

**Multi-provider szereposztás.** A routing már **implementálva van**, csak leírva nincs — ez a leadandó a leírás:

| modell | feladat | miért pont az |
|---|---|---|
| OpenAI `text-embedding-3-small` | szöveg → 1536 szám (ingest + minden keresés) | **kényszer, nem választás**: az Anthropic nem ad embedding-modellt. A projekt egyetlen nem-Anthropic hívása. |
| Claude Haiku 4.5 | HyDE + rerank | sok hívás, sablonos feladat, a minőségi plafon alacsonyan van — a rerank `generateObject`-tel megy, tehát a kimenet szerkezete garantált |
| a nagy Claude | a válasz | itt számít a megfogalmazás, a magyar nyelv és a grounding-fegyelem betartása |

A kézzelfogható tanulság, amit a doksi kimond: **a drága modell válaszol, az olcsó válogat.**

### `CLAUDE.md`

Átvezetés: az új `docs/architektura-monorepo.md` név, a `pnpm golden:run` parancs, a `chunkMarkdown` új viselkedése, valamint a `docs/ARCHITEKTURA.md`, a `docs/chunking-strategia.md` és a `docs/golden-set.md` szerepe.

## Amit szándékosan NEM csinálunk

- **Nem vonjuk össze a 462 törpe darabot**, és nem korlátozzuk a szakaszhatárt h1–h3-ra. Az 1. döntés ezt kizárta; a mérés a `docs/chunking-strategia.md`-ben szerepel, hogy látszódjon: ismerjük, és tudatosan hagytuk benne.
- **Nem építünk rerank- vagy távolság-küszöböt előre.** Csak akkor, ha a 4. döntés szerinti mérés megbukik.
- **Nem építünk migrációt** a címsor-útvonalnak: az előtag a `content`-be megy.
- **Nem implementáljuk** az inkrementális frissítést. A kiírás kifejezetten csak tervet kér.
- **Nem építünk token-elszámolást** a HyDE/rerank hívásokra.

## Sikerkritériumok — megfigyelhető viselkedés

Nem „a fájl tartalmazza X-et", hanem mi történik, ha lefuttatod.

1. `pnpm nx test core` — a `chunk.spec.ts` zöld, benne az öt új esettel. A `docTitle` nélküli eset kimenete **karakterre azonos** a mai kimenettel.
2. Egy szkript a korpuszra futtatva az új chunkerrel: a „dok-cím kulcsszava hiányzik" arány **42%-ról 0% közelébe** esik, és az üres csonkok száma **0**.
3. `pnpm knowledge:ingest` — a `knowledge_chunks` sorszáma a 2041-hez képest kb. 75-tel csökken, és egy `SELECT content FROM knowledge_chunks LIMIT 5` kimenetén **minden soron látszik az előtag**.
4. `pnpm golden:run --label uj-chunker` — API-kulcs nélkül **érthető magyar hibaüzenettel** áll meg, kulccsal pedig létrehozza a `docs/golden/futas-uj-chunker.md`-t, benne mind a 8 kérdéssel, kérdésenként két találati listával.
5. A negatív kérdésre az agent válasza **tartalmazza a „nincs információm" jellegű kimondást, és nem hivatkozik egyetlen forrásra sem** — vagy ha nem, akkor a doksiban ott a bukás mérése és a rá adott javítás mérése is.
6. `pnpm nx run-many -t lint typecheck build` zöld (ez reprodukálja a CI-t).
7. A `docs/ARCHITEKTURA.md` a gitben **ezen a néven** szerepel (`git ls-files docs/ | grep ARCHITEKTURA` talál), és a `docs/architektura-monorepo.md`-re mutató hivatkozások a README-ben és a CLAUDE.md-ben nem törtek el.
