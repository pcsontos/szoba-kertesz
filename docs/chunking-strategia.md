# Chunking-stratégia — mit tesz a korpusz, és mit teszünk mi

> A chunkolás a RAG első döntése, és a leggyakrabban elrontott. Ez a dokumentum azt írja le, **miért
> pont ezt** csináljuk: elöl a mérés, utána a döntés. A sorrend nem stílus kérdése — egy chunking-stratégia
> akkor jó, ha a konkrét tudásbázishoz illik, nem attól, hogy hány technikát vetettünk be.
>
> A hatás bizonyítása külön dokumentumban: [`docs/golden-set.md`](golden-set.md).

## 1. Mit mértünk a korpuszon

A korpusz **202 letöltött gondozási cikk** (The Sill, angol nyelvű), a `seed/knowledge/` könyvtárban.
Minden szám alább a saját mérésünk a `seed/knowledge/*.md` fájlokon.

**Bekezdés-méretek** — a bekezdés önmagában rossz atomi egység:

| mutató | érték |
|---|---|
| bekezdések száma | 4941 |
| **100 karakter alatt** | 2497 (**51%**) |
| medián bekezdés-hossz | 93 karakter |

**Címsor-szerkezet** — 1720 bekezdés kezdődik címsorral:

| szint | h1 | h2 | h3 | h4 | h5 | h6 |
|---|---|---|---|---|---|---|
| darab | 202 | 192 | 306 | 306 | **607** | 107 |

A cikkek szerkezete tehát **nem** a tankönyvi „h1 = cím, h2 = szakaszok": a leggyakoribb szakaszszint
az **h5**, és a címsorok **59%-a h4–h6**. Ugyanaz a szakaszcím különböző cikkekben különböző szinten áll.

**A leggyakoribb szakaszcímek** — és itt van a probléma gyökere:

| szakaszcím | hány cikkben |
|---|---|
| Humidity | 56 |
| Temperature | 56 |
| Common Problems | 54 |
| Water | 54 |
| Sunlight | 53 |
| Conclusion | 33 |
| Precautions | 33 |
| Soil | 28 |

## 2. Mi következik ebből

Az 54 „Water" szakasz **egymástól megkülönböztethetetlen a vektortérben**. Mindegyik ugyanarról szól —
öntözési gyakoriság, talajnedvesség, túlöntözés —, és a **növény neve egyikben sincs benne**: az csak a
cikk címében szerepel, ami egy másik darabba került.

Mérve a régi chunkerrel (`29282e7~1`): a 2041 darabból **1157 (57%)** tartalmazza a saját cikkének egy
kulcsszavát — vagyis **a darabok 43%-a nem árulja el, melyik növényről beszél**.

Ennek a következménye közvetlenül látszik a golden set mérésében: a „Milyen gyakran öntözzem a
kígyónövényt?" kérdés nyers vektorkeresése **egyetlen kígyónövény-darabot sem hoz be** az első ötbe —
helyette páfrány, fűszernövény és monstera öntözési szakaszait.

## 3. Amit választottunk: címsor-útvonal a darab elején

Minden darab elé beírjuk, **honnan jött**:

```
How To Care for a Snake Plant › Water

## Water

Water every 2-8 weeks, allowing the soil to dry out completely between waterings…
```

Három döntés van ebben, és mindegyik indokolt:

**(a) A dokumentum címe + a címsor-hierarchia, nem csak a cím.** A folytatás-darab a *beágyazó* szakaszt
kapja, nem a záró alcímet: egy darab arról szól, ahol **elkezdődött**. Ha egy hosszú „Water" szakasz
három darabra esik, mindhárom a `… › Water` előtagot viseli, pedig a `## Water` sor csak az elsőben van benne.

**(b) A hierarchia szintfüggetlen.** Mivel a korpusz h2 alól gyakran ugrik egyenesen h5-re, az útvonal a
kihagyott szinteken nem lyukad ki: `Snake Plant › Learn More › Water`. Ezt teszt rögzíti.

**(c) Az előtag a `content` mezőbe kerül, nem külön oszlopba.** Ez a lényegi döntés:

- amit **embeddelünk**, az a `content` — ha az előtag külön oszlopban ülne, a vektor nem tudna róla,
  és pontosan az a probléma maradna, amit meg akartunk oldani;
- a **modell** is ezt kapja: a válaszban látja, melyik cikk melyik szakaszából idéz — ez a groundingnak
  is jót tesz;
- és **nincs migráció**: a `knowledge_chunks` séma változatlan.

## 4. Amit a döntés kikényszerített: a törzs nélküli darabok eldobása

Ez **nem külön ötlet volt, hanem az előtag következménye**. A korpuszban 75 olyan bekezdés van
(37 fájlban), ami a `#` jeleken kívül **semmit nem tartalmaz** — 6 db `###`, 25 db `####`, 42 db
`#####`, 2 db `######`. Ezek a lementett oldalak tördelési maradékai. A régi chunker 3 karakteres
darabokat csinált belőlük: jelentés nélküli szemét, de ártalmatlan, mert a vektortérben sehová sem
esik közel. (Mérve: ebből 73 lett ténylegesen tartalom nélküli darab — a többit a chunker
összevonta a mögötte álló szöveggel.)

**Előtaggal viszont ezek `Snake Plant › FAQs` alakú, jól embeddelődő darabok lennének — üres tartalommal.**
Az előtag tehát nem semlegesíti, hanem **felerősítené** őket. Ezért a darab kiesik, ha a címsorokon kívül
nincs benne szöveg.

Ez a szabály viszont **túl sokat vitt el**, és ezt is mérés mutatta meg. Az első futás 184 darabot ejtett
el a várt ~75 helyett. A szétbontás:

| csoport | darab | mi ez | döntés |
|---|---|---|---|
| üres csonk | 73 | `###`, `#####` | **kiesik** |
| rövid szakaszcím | 62 | `FAQs`, `General Care`, `Plant Physiology` | **kiesik** |
| mondat címsorként | 49 | *„Ferns are fabulous. They are amongst the first plants on earth to form a vascular system."* | **marad** |

A harmadik csoport valódi tartalom, csak `######`-tal formázva — a cikkek bevezetője gyakran így áll.
Ezért a szabály kivételt kapott: **60 karakter fölött egy címsor már mondat, nem címke**. A leghosszabb
valódi szakaszcím a korpuszban jóval rövidebb ennél, tehát a határ tisztán vág.

**Ugyanez a határ dönt az útvonalról is** — és ez a PR-review után derült ki. Ha a mondat-címsor
*címsorként* számít, akkor be is kerül a címsor-útvonalba, és onnan **előtagként rárakódik a szakasz
minden darabjára** — ráadásul a törzs mellé, ugyanabba a darabba. Mérve a 202 fájlon: **381 darab (20%)
előtagja volt 100 karakternél hosszabb, 121-é 200-nál, a leghosszabb 624 karakter** — vagyis egy teljes
bevezető bekezdés, megduplázva, minden darab tetején. Ez pontosan az a jelentés-elmosódás, ami ellen a
darabolás egyáltalán van: az egy cikkből származó darabokat **egymáshoz** teszi hasonlóbbá.

A szabály tehát két helyen dönt, ugyanabban a szellemben: a mondat-címsor **tartalom** (a darab marad),
de **nem címke** (az útvonalba nem kerül be). Az eredmény: a leghosszabb előtag 624 → **191 karakter**,
200 fölött **egy sincs**, a darabszám pedig változatlan — a szűrés csak az előtagot érinti.

Végeredmény: **2041 → 1906 darab**, kiesik 135.

## 5. Amit tudatosan NEM csináltunk

| lehetőség | a mért adat | miért nem |
|---|---|---|
| **A törpe darabok összevonása** | a régi chunkerben 462 darab (23%) volt 200 karakter alatt | Az előtag ezt **magától** megoldotta: az új chunkerben 218 darab (11%) van 200 alatt, és a medián 429 → 531 karakterre nőtt. Egy külön összevonó lépés ma nem javítana számottevően, viszont elrontaná a szakaszhatárokat — a méret kedvéért ragasztana össze két gondolatot. |
| **A szakaszhatár szűkítése h1–h3-ra** | csak h1–h3-nál vágva 700 szakasz lenne, medián 581 karakter, de **204 szakasz 1000 karakter fölött** | A korpusz szakaszszintje h5 (607 db) — a h4–h6 határok elhagyása pont a *gondozási szakaszokat* olvasztaná össze („Water" + „Humidity" + „Soil" egy darabban). A méret ettől nem lenne jobb, a fókusz viszont elveszne. |
| **A h5/h6 külön kezelése** | a címsorok 59%-a h4–h6 | Nincs mit kezelni rajta: az útvonal szintfüggetlen. Egy szint-alapú szabály ennél a korpusznál önkényes lenne. |
| **Szemantikus (modell-alapú) darabolás** | — | Minden dokumentum újradarabolása modellhívásokba kerülne, minden újraépítéskor. A szerző tagolása ingyen van, és ennél a korpusznál — ahol a szerkezet erős és következetes — elég. |

A visszafogottság itt szándékos. A darabolás annyit bonyolódjon, amennyit a korpusz megkövetel; a
felesleges technika nem érdem, hanem karbantartási teher.

## 6. Hogyan bizonyítjuk, hogy használt

**Mérés a korpuszon** (embedding nélkül, determinisztikus):

| mutató | régi | új |
|---|---|---|
| darabszám | 2041 | 1906 |
| a darab tartalmazza a saját cikkének címét | 1157 (57%) | **1906 (100%)** |
| medián darabhossz | 429 karakter | **531 karakter** |
| 200 karakter alatti darab | 462 (23%) | **218 (11%)** |
| legkisebb darab | 3 karakter | **28 karakter** |

**Mérés a kereséssel** ([`docs/golden-set.md`](golden-set.md)): a legtisztább bizonyíték az angol
kontroll-kérdés, mert ott se HyDE, se rerank nem fut, és nincs nyelvi szakadék sem — az egyetlen változó
a darabok szövege. A „why are the leaves on my houseplant turning yellow?" **nyers** találati listájában
a régi tudásbázison a témába nem vágó *Bird of Paradise Care Guide* állt az élen; az újon a helyes cikk
négy darabja foglalja el az első négy helyet.

**A viselkedést tesztek rögzítik** (`packages/core/src/lib/rag/chunk.spec.ts`, 13 eset), köztük:
`docTitle` nélkül a kimenet karakterre változatlan · a folytatás-darab a beágyazó szakaszt kapja ·
a h1 nem duplázódik a dokumentum címével · a h2 → h5 ugrás nem lyukasztja ki az útvonalat ·
a törzs nélküli darab kiesik, és az indexek hézagmentesek maradnak · a mondatnyi címsor törzsnek számít.

**És a betöltött adatbázisban is ellenőrizhető:** `content LIKE title || '%'` mind az 1906 sorra igaz.
