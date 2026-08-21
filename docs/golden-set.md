# Golden set — mit ad hozzá a HyDE, a rerank és a címsor-útvonal

> Ez a dokumentum **elemzés**. A nyers mérési adat két generált fájlban áll:
> [`docs/golden/futas-regi-chunker.md`](golden/futas-regi-chunker.md) és
> [`docs/golden/futas-uj-chunker.md`](golden/futas-uj-chunker.md).
> Minden itt szereplő szám azokból való — elemzést nem lehet generálni, mérési adatot pedig nem érdemes kézzel írni.

## A kérdéslista, és miért ezek

A kérdések a `seed/golden-set.json`-ben állnak, verziókövetve. Ez nem formaság: két futás csak akkor
összehasonlítható, ha **ugyanaz a kérdéslista** fut. A `kind` mező három szerepet különböztet meg.

| # | kérdés | nyelv | típus | mit hivatott bizonyítani |
|---|---|---|---|---|
| 1 | Miért sárgulnak a szobanövényem levelei? | `hu` | `thematic` | A leggyakoribb gondozási kérdés. Sok cikk érinti, tehát a RETRIEVAL bősége a kihívás, nem a hiánya. |
| 2 | Milyen gyakran öntözzem a kígyónövényt? | `hu` | `thematic` | A CÍMSOR-ÚTVONAL próbája: 23 cikkben van '## Water' szakasz, és a növény neve egyikben sincs benne. Ha valahol, itt kell javulnia a találatnak. |
| 3 | Túlöntöztem a monsterámat, mit tegyek? | `hu` | `thematic` | A RERANK próbája: a 'monstera öntözése' chunk vektorban közel van, de a valódi válasz a gyökérrothadásról szóló szakaszban van, ami más szavakkal beszél ugyanarról. |
| 4 | Milyen növény bírja a sötét fürdőszobát? | `hu` | `thematic` | Két tudásforrás határa: a fény- és páraigény a cikkekben van, a konkrét termék a katalógusban. A retrieval-mérés csak a cikk-oldalt nézi. |
| 5 | Milyen földet használjak átültetéskor? | `hu` | `thematic` | Több cikk '## Soil' szakasza felel rá (23 cikkben van ilyen). A HyDE-nak itt kell eldöntenie, melyik kontextusban kérdezünk. |
| 6 | why are the leaves on my houseplant turning yellow? | `en` | `control` | ANGOL KONTROLL az 1. kérdéshez. A nyelvi szakadék nulla, tehát a nyers és a teljes pipeline különbsége itt tisztán a HyDE és a rerank számlájára megy. |
| 7 | how often should I water a snake plant? | `en` | `control` | ANGOL KONTROLL a 2. kérdéshez. Ugyanaz a mérés nyelvi szakadék nélkül — így elválik, mennyit adott a címsor-útvonal és mennyit a fordítás. |
| 8 | Hogyan cseréljek téli gumit az autómon? | `hu` | `negative` | NEGATÍV TESZT — a SZEREP határa. A korpusz növénygondozási cikkekből áll, erről egy szó sincs benne. Mérve: az agent ezt a kérdést 0 tool-hívással utasítja el, tehát a keresésig el sem jut — ezért kell mellé a légycsapós kérdés is. |
| 9 | Hogyan gondozzam a Vénusz légycsapóját? | `hu` | `negative` | NEGATÍV TESZT — a TUDÁS határa, és a grounding valódi próbája. Növénygondozási kérdés, tehát átmegy a szerep-kapun és LEFUT a keresés — de a korpuszban egyetlen cikk sem szól húsevő növényről (mérve: 0 találat a 'Venus flytrap'-re). A pgvector ettől függetlenül visszaad 20 darabot: a kérdés az, kimondja-e az agent, hogy nincs róla információja, forráskitalálás helyett. |

## Hogyan mérünk

Minden kérdés **kétszer** fut, **ugyanazon** a `retrieveKnowledge` függvényen, csak más beállítással:

| mód | beállítás | mi történik |
|---|---|---|
| **nyers** | `{ useHyde: false, useRerank: false }` | a kérdés embeddingje → pgvector koszinusz-távolság → top-5 |
| **teljes** | `{ useHyde: true, useRerank: true }` | HyDE (angol hipotetikus válasz) → embedding → pgvector top-20 → Claude Haiku átrangsorol → top-5 |

Ez a szétválasztás azért fontos, mert így a különbség **nem két külön kódúté**, hanem ugyanazé a
pipeline-é, két beállítással. A mérés parancsa: `pnpm golden:run --label <név>`.

Két tudásbázis-állapoton futott le ugyanez:

| label | tudásbázis | fájl |
|---|---|---|
| `regi-chunker` | 2041 darab, címsor-útvonal nélkül | `docs/golden/futas-regi-chunker.md` |
| `uj-chunker` | 1906 darab, címsor-útvonallal | `docs/golden/futas-uj-chunker.md` |

**Egy korlát, amit előre ki kell mondani:** a két állapot **abszolút távolságai nem összevethetők**.
Az előtag minden darab szövegét megváltoztatja, tehát minden vektor elmozdul. Ami összevethető, az a
**sorrend** és az, hogy *melyik cikkből* jönnek a találatok.

## Nyers vektorkeresés vs. teljes pipeline

Az új tudásbázison mért top-1 találatok (`futas-uj-chunker.md`):

| # | kérdés | nyers top-1 | teljes top-1 | rerank |
|---|---|---|---|---|
| 1 | Miért sárgulnak a szobanövényem levele | Bird of Paradise Care Guide #14 · 0.629 | 5 Causes For Your Plant’s Yellow Leaves #1 · 0.236 | 9/10 |
| 2 | Milyen gyakran öntözzem a kígyónövényt | Bird’s Nest Fern #3 · 0.618 | How To Care for a Snake Plant #6 · 0.162 | 10/10 |
| 3 | Túlöntöztem a monsterámat, mit tegyek? | The Hole Truth: Monsteras #5 · 0.717 | How to Care for a Desert Rose #7 · 0.449 | 9/10 |
| 4 | Milyen növény bírja a sötét fürdőszobá | The Plant That Loves a Humid Bathroom #3 · 0.487 | 10 Best Low Light Indoor Plants for Your Home or Office #2 · 0.368 | 9/10 |
| 5 | Milyen földet használjak átültetéskor? | How to Reuse Coffee Grounds to Fertilize Houseplants #5 · 0.782 | Plant Care: Potting Mix 101 #8 · 0.294 | 9/10 |
| 6 | why are the leaves on my houseplant tu | 5 Causes For Your Plant’s Yellow Leaves #4 · 0.327 | 5 Causes For Your Plant’s Yellow Leaves #3 · 0.261 | 9/10 |
| 7 | how often should I water a snake plant | How To Care for a Snake Plant #6 · 0.254 | How To Care for a Snake Plant #6 · 0.163 | 10/10 |
| 8 | Hogyan cseréljek téli gumit az autómon | A Gardener's Guide to Growing Evergreen Trees and Shrubs #10 · 0.707 | Japanese Maple Care Guide #11 · 0.666 | 0/10 |
| 9 | Hogyan gondozzam a Vénusz légycsapóját | Fiddle Me This: Caring for a Fiddle Leaf Fig #6 · 0.764 | How to Care for a Tradescantia #3 · 0.456 | 0/10 |

**A teljes pipeline 9 kérdésből 8-nál más darabot tett az élre**, mint a nyers keresés. Ebből
**hét esetben másik CIKK** került az első helyre, a 6. kérdésnél viszont ugyanaz a cikk maradt, csak
másik darabja (`#4` helyett `#3`) — ott a rerank finomhangolt, nem cserélt.

Az egyetlen kérdés, ahol a top-1 egyáltalán nem mozdult, a 7.: ott a nyers keresés is elsőre
eltalálta a helyes darabot. Ez az egyetlen **angolul feltett, konkrét növényt megnevező** kérdés,
tehát pontosan az az eset, ahol a vektorkeresésnek a legkönnyebb dolga van — a kérdés szavai
szó szerint ott állnak a keresett darabban.

## A rerank átrendezése — egy konkrét eset

A 2. kérdés (*„Milyen gyakran öntözzem a kígyónövényt?"*) a legbeszédesebb, mert a nyers keresés
**egyetlen kígyónövényről szóló darabot sem hoz be** az első ötbe:

**Nyers vektorkeresés:**

1. **Bird’s Nest Fern** #3 · dist 0.618
2. **Herb Care and Botanical Cocktail Making** #5 · dist 0.635
3. **How to Care for Bird’s Nest Fern** #2 · dist 0.640
4. **How To Care for a Monstera Deliciosa** #9 · dist 0.647
5. **Bird of Paradise Care Guide** #9 · dist 0.653

**Teljes pipeline (HyDE + rerank):**

1. **How To Care for a Snake Plant** #6 · dist 0.162 · rerank 10/10
2. **Fall Plant Care Tips For Houseplants** #4 · dist 0.289 · rerank 9/10
3. **How Often & How Much You Should Water Houseplants** #9 · dist 0.363 · rerank 4/10
4. **How Often & How Much You Should Water Houseplants** #4 · dist 0.361 · rerank 3/10
5. **How Often & How Much You Should Water Houseplants** #3 · dist 0.382 · rerank 3/10

Az első lista *növénygondozási* darabokat hoz — páfrány, fűszernövény, monstera —, mert a magyar
kérdés vektora nagyjából egyforma távol van mindegyiktől. A második lista élén a **kígyónövény saját**
cikkének öntözési szakasza áll, 10/10-es rerank-pontszámmal, és a 3–5. hely is öntözésről szóló
cikk. Két különböző lépés dolgozott itt:

- a **HyDE** angolul megfogalmazott hipotetikus választ ad, tehát a keresés már nem magyar kérdést,
  hanem angol *választ* keres az angol korpuszban — ez hozza be egyáltalán a jó darabokat a top-20-ba;
- a **rerank** ebből a húszból emeli előre azt, amelyik tényleg a kígyónövényről szól.

## Mit adott a HyDE, és mit a fordítás — az angol kontroll

A magyar kérdéseknél a nyers és a teljes pipeline különbsége **két hatást kever**: a fordításét és a
rerankét. Az angol kontroll-kérdések ezt választják szét, mert ott a nyelvi szakadék nulla.

A 6. kérdés (*„why are the leaves on my houseplant turning yellow?"*) nyers találatai a **régi**
tudásbázison:

1. **Bird of Paradise Care Guide** #15 · dist 0.289
2. **5 Causes For Your Plant’s Yellow Leaves** #1 · dist 0.323
3. **5 Causes For Your Plant’s Yellow Leaves** #5 · dist 0.343
4. **5 Causes For Your Plant’s Yellow Leaves** #4 · dist 0.357
5. **5 Causes For Your Plant’s Yellow Leaves** #3 · dist 0.368

Ugyanez az **új** tudásbázison:

1. **5 Causes For Your Plant’s Yellow Leaves** #4 · dist 0.327
2. **5 Causes For Your Plant’s Yellow Leaves** #5 · dist 0.330
3. **5 Causes For Your Plant’s Yellow Leaves** #1 · dist 0.340
4. **5 Causes For Your Plant’s Yellow Leaves** #3 · dist 0.342
5. **Bird of Paradise Care Guide** #14 · dist 0.344

Ez a **címsor-útvonal legtisztább bizonyítéka az egész mérésben**: se HyDE, se rerank nem futott,
a kérdés angol, a korpusz angol — az egyetlen változó a darabok szövege. A régi bázison a témába
nem vágó *Bird of Paradise Care Guide* állt az élen, az újon a témába vágó cikk **négy** darabja
foglalja el az első négy helyet, és a *Bird of Paradise* az ötödik helyre szorult.

A 7. kérdésnél (*„how often should I water a snake plant?"*) a top-1 mindkét bázison ugyanaz, de a
lista alja átalakult: a régin *Moon Valley Pilea*, *A is for Aroids* és *Oxalis* darabjai álltak a
2–5. helyen, az újon öntözésről szóló cikkek. Vagyis ahol a nyers keresés amúgy is eltalálta a
választ, ott az előtag **a mezőny többi részét** javította.

**A magyar kérdéseknél viszont a nyers oldal továbbra sem talál pontosan** — a 2. kérdés nyers
listája az új bázison sem tartalmaz kígyónövény-darabot. Ez a mérés józanító tanulsága: a
**címsor-útvonal a nyelvi szakadékot nem hidalja át**, azt a HyDE teszi. A két hatás összeadódik,
de nem helyettesíti egymást.

## Negatív teszt — a grounding próbája

A tudásbázis **nem tud mindent**, és a rendszerben **sehol nincs küszöb**: a pgvector mindig visszaadja
a kért 20 darabot, akármilyen távol vannak, a reranker pedig pontoz, de nem dob el semmit — és a
pontszám a válaszoló modellhez el sem jut. A negatív teszt tehát azt méri, hogy **a `<grounding>`
prompt-szabály önmagában elég-e**.

A golden setben **két** negatív kérdés van, mert az első futás megmutatta, hogy egy nem elég.

### 8. kérdés: a SZEREP határa — *„Hogyan cseréljek téli gumit az autómon?"*

Az agent **0 tool-hívással** válaszolt (a JSONL napló szerint), tehát a tudásbázisig el sem jutott:

> Ez a kérdés kívül esik a szakterületemen! 😊 Én a **Szobakertész asszisztens** vagyok, és kizárólag növényekkel, növénygondozással, valamint a webshop katalógusával kapcsolatos kérdésekben tudok segíteni.

Ez érvényes eredmény — a szerep-határ működik —, de **nem a groundingot bizonyítja**: a
retrieval le sem futott, tehát a „ne a saját tudásodból válaszolj" szabály nem került próbára.
Ezért került a listába egy második negatív kérdés.

### 9. kérdés: a TUDÁS határa — *„Hogyan gondozzam a Vénusz légycsapóját?"*

Ez növénygondozási kérdés, tehát **átmegy a szerep-kapun**, és a napló szerint az agent ki is hívta a
`searchKnowledge` toolt. A korpuszban viszont **egyetlen cikk sem szól húsevő növényről**. A keresés
ennek ellenére öt találatot adott vissza:

1. **How to Care for a Tradescantia** #3 · dist 0.456 · rerank 0/10
2. **How to Care for a Fittonia** #4 · dist 0.485 · rerank 0/10
3. **How to Care for a Stromanthe Triostar** #4 · dist 0.487 · rerank 0/10
4. **How to Care for a Tradescantia** #4 · dist 0.492 · rerank 0/10
5. **Our Top 10 Plant Care Tips** #6 · dist 0.492 · rerank 0/10

Figyeld meg: **a reranker mind az ötre 0/10-et adott** — tehát *felismerte*, hogy egyik sem válaszol a
kérdésre. Ez a pontszám azonban nem jut el a modellhez, és nem is dob el semmit: mind az öt darab
bekerült a kontextusba. Az agent válasza szó szerint:

> Sajnálom, a bolt tudásbázisában **nem található specifikus cikk a Vénusz légycsapó (Dionaea muscipula) gondozásáról** – a keresés más növények gondozási leírásait hozta fel, amelyek nem relevánsak.
> 
> Erről a kérdésről nincs információm a tudásbázisban. 🌿
> 
> Amit tehetek helyette:
> - **Megnézem, hogy a Vénusz légycsapó szerepel-e a katalógusunkban** – ha szeretnéd, megkeresem az elérhető példányokat.
> - Ha más növény gondozásáról kérdezel, szívesen segítek!
> 
> Keressem meg a katalógusban, hogy van-e raktáron Vénusz légycsapó?

**Az eredmény tehát: kimondja, hogy nincs róla információja, és nem hivatkozik kitalált forrásra.**
A prompt-szabály önmagában elég volt — küszöböt ezért nem építettünk. Ha az agent halandzsázott
volna, a következő lépés egy rerank-küszöb lett volna (a pontszám alatt eldobni a darabot).

Ugyanez a viselkedés a **régi** tudásbázison is megvolt (`futas-regi-chunker.md`), tehát a grounding
nem a chunkolás mellékhatása.

## Régi vs. új chunker

A címsor-útvonal minden darab elé beírja, **honnan jött**:

```
How To Care for a Snake Plant › Water
```

A hatása a korpuszon, embedding nélkül mérve (a részletes indoklás:
[`docs/chunking-strategia.md`](chunking-strategia.md)):

| mutató | régi | új |
|---|---|---|
| darabszám | 2041 | **1906** |
| a darab tartalmazza a saját cikkének címét | 1157 / 2041 (**57%**) | 1906 / 1906 (**100%**) |
| legkisebb darab | **3 karakter** (`###`) | **28 karakter** |

<sub>A régi oszlop a Task 4 előtti chunkerrel újramérve (`29282e7~1`), az új oszlop a betöltött
`knowledge_chunks` táblából. A 100% a DB-ben is ellenőrizhető: `content LIKE title || '%'` mind az
1906 sorra igaz.</sub>

A keresésre gyakorolt hatás **kérdésenként eltérő, és nem egyirányú**:

- **Ahol a legtöbbet adta:** az angol kontroll-kérdés nyers találati listája (fent), és az
  átültetés-kérdés, ahol a teljes pipeline top-1-e a *How to Care for a Sago Palm* helyett a
  *Plant Care: Potting Mix 101* lett.
- **Ahol alig:** a kígyónövény-kérdés teljes pipeline-ja már a régi bázison is a helyes cikket hozta
  (0,186 → 0,162); ott az előtag a lista alját tette relevánsabbá.
- **Ahol látszólag rontott:** a monstera-kérdésnél az új futás öt általános gondozási darabot hozott
  a régi futás *Signs of Overwatering* darabjai helyett.

### Miért nem lehet ebből „a chunker rontott"-ra következtetni

A monstera-esetet külön megmértük: **ugyanaz a kérdés, ugyanaz a tudásbázis, három futás**
(a mérés a `061d44c` commit üzenetében rögzítve):

| futás | a HyDE hipotetikus válasza | top-1 |
|---|---|---|
| #1 | „Overwatering **Recovery** for Monstera…" | *Signs of Overwatering* #5 · 0,429 · 9/10 |
| #2 | „Overwatered Monstera: **Emergency Care Guide**…" | *How to Care for a Desert Rose* #7 · 0,406 · 7/10 |
| #3 | „Overwatered Monstera: **Recovery Steps**…" | *Signs of Overwatering* #4 · 0,423 · 7/10 |

A **nyers** oldal ugyanekkor stabil volt: mindhárom találat a *The Hole Truth: Monsteras* cikkből,
0,717–0,737 távolsággal.

Vagyis a szórás forrása a **HyDE**: futásonként más hipotetikus választ ír, és a
„recovery" vs. „emergency care" megfogalmazás más darabokba visz. **Egyetlen kérdés egyetlen futása
ezért nem alkalmas két chunker összehasonlítására** — csak az összkép és a determinisztikus nyers oszlop.

## Következtetések

1. **A HyDE a legnagyobb egyedi nyereség — magyar kérdésnél.** A nyers keresés a magyar kérdéseknél
   rendre témába vágó, de rossz cikkeket hoz: a kérdés vektora nagyjából egyforma távol van az összes
   növénygondozási darabtól. A HyDE angol hipotetikus válasza szünteti meg ezt a szakadékot.
2. **A rerank a bőség problémáját oldja meg.** A tág háló (top-20) után ő dönti el, melyik öt darab
   megy be a kontextusba; a kígyónövény-kérdésnél 10/10-re értékelt darab a nyers lista első ötébe
   be sem került.
3. **A címsor-útvonal ott segít, ahol a szakasz önmagában névtelen.** A hatása a nyers, angol
   keresésen mérhető legtisztábban — és ott mérhető is. A nyelvi szakadékon viszont nem segít.
4. **A grounding prompt-szabályon áll, nem küszöbön** — és ez mérve elég: a reranker 0/10-es
   pontszámai el sem jutnak a modellhez, mégis kimondja, hogy nincs információja.
5. **A rendszer nem determinisztikus.** Aki RAG-ot mér, annak ezt ki kell mondania, különben a mérés
   többet állít, mint amennyit bizonyít.

### Amit egy következő kör mérne

- **Ismételt futások átlaga** kérdésenként, a HyDE szórásának kiszűrésére.
- **Rerank-küszöb**: ma nincs; a negatív teszt szerint egyelőre nincs is rá szükség, de a
  0/10-es pontszám ma kárba vész.
- **A magyar nyelvű nyers keresés**: a HyDE ma minden kérdésnél lefut, tehát minden kérdés fizet egy
  extra modellhívást. Angol kérdésnél ez a mérés szerint kevesebbet ad — érdemes lenne mérni, mit
  veszítenénk, ha a HyDE csak a nem angol kérdéseknél futna.
