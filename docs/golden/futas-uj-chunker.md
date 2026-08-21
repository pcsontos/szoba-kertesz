# Golden set — futás: `uj-chunker`

> Generált fájl, a `pnpm golden:run --label uj-chunker` írta. Ne szerkeszd kézzel.
> Futás ideje: 2026-08-21T10:32:39.680Z

## Összefoglaló

| # | kérdés | nyelv | nyers top-1 | teljes top-1 | átrendezett |
|---|---|---|---|---|---|
| 1 | Miért sárgulnak a szobanövényem levelei? | hu | Bird of Paradise Care Guide | 5 Causes For Your Plant’s Yellow Leaves | IGEN — átrendezte |
| 2 | Milyen gyakran öntözzem a kígyónövényt? | hu | Bird’s Nest Fern | How To Care for a Snake Plant | IGEN — átrendezte |
| 3 | Túlöntöztem a monsterámat, mit tegyek? | hu | The Hole Truth: Monsteras | How to Care for a Desert Rose | IGEN — átrendezte |
| 4 | Milyen növény bírja a sötét fürdőszobát? | hu | The Plant That Loves a Humid Bathroom | 10 Best Low Light Indoor Plants for Your Home or Office | IGEN — átrendezte |
| 5 | Milyen földet használjak átültetéskor? | hu | How to Reuse Coffee Grounds to Fertilize Houseplants | Plant Care: Potting Mix 101 | IGEN — átrendezte |
| 6 | why are the leaves on my houseplant turning yellow? | en | 5 Causes For Your Plant’s Yellow Leaves | 5 Causes For Your Plant’s Yellow Leaves | IGEN — átrendezte |
| 7 | how often should I water a snake plant? | en | How To Care for a Snake Plant | How To Care for a Snake Plant | nem |
| 8 | Hogyan cseréljek téli gumit az autómon? | hu | A Gardener's Guide to Growing Evergreen Trees and Shrubs | Japanese Maple Care Guide | IGEN — átrendezte |
| 9 | Hogyan gondozzam a Vénusz légycsapóját? | hu | Fiddle Me This: Caring for a Fiddle Leaf Fig | How to Care for a Tradescantia | IGEN — átrendezte |

---

## Miért sárgulnak a szobanövényem levelei?

`sargulo-level` · nyelv: hu · típus: thematic

**Miért van a listában:** A leggyakoribb gondozási kérdés. Sok cikk érinti, tehát a RETRIEVAL bősége a kihívás, nem a hiánya.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **Bird of Paradise Care Guide** #14 · dist 0.629
2. **Bird of Paradise Care Guide** #15 · dist 0.660
3. **What is Plant Toxicity?** #5 · dist 0.673
4. **Bird of Paradise Care Guide** #1 · dist 0.674
5. **Bird’s Nest Fern** #1 · dist 0.683

### Teljes pipeline (HyDE + rerank)

1. **5 Causes For Your Plant’s Yellow Leaves** #1 · dist 0.236 · rerank 9/10
2. **5 Causes For Your Plant’s Yellow Leaves** #3 · dist 0.242 · rerank 9/10
3. **5 Causes For Your Plant’s Yellow Leaves** #2 · dist 0.261 · rerank 9/10
4. **Signs of Overwatering Your Plants** #5 · dist 0.331 · rerank 9/10
5. **Signs of Overwatering Your Plants** #4 · dist 0.356 · rerank 9/10

**A rerank átrendezte a sorrendet** — a két lista top-1 találata különbözik.

---

## Milyen gyakran öntözzem a kígyónövényt?

`kigyonoveny-ontozes` · nyelv: hu · típus: thematic

**Miért van a listában:** A CÍMSOR-ÚTVONAL próbája: 23 cikkben van '## Water' szakasz, és a növény neve egyikben sincs benne. Ha valahol, itt kell javulnia a találatnak.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **Bird’s Nest Fern** #3 · dist 0.618
2. **Herb Care and Botanical Cocktail Making** #5 · dist 0.635
3. **How to Care for Bird’s Nest Fern** #2 · dist 0.640
4. **How To Care for a Monstera Deliciosa** #9 · dist 0.647
5. **Bird of Paradise Care Guide** #9 · dist 0.653

### Teljes pipeline (HyDE + rerank)

1. **How To Care for a Snake Plant** #6 · dist 0.162 · rerank 10/10
2. **Fall Plant Care Tips For Houseplants** #4 · dist 0.289 · rerank 9/10
3. **How Often & How Much You Should Water Houseplants** #9 · dist 0.363 · rerank 4/10
4. **How Often & How Much You Should Water Houseplants** #4 · dist 0.361 · rerank 3/10
5. **How Often & How Much You Should Water Houseplants** #3 · dist 0.382 · rerank 3/10

**A rerank átrendezte a sorrendet** — a két lista top-1 találata különbözik.

---

## Túlöntöztem a monsterámat, mit tegyek?

`tulontozott-monstera` · nyelv: hu · típus: thematic

**Miért van a listában:** A RERANK próbája: a 'monstera öntözése' chunk vektorban közel van, de a valódi válasz a gyökérrothadásról szóló szakaszban van, ami más szavakkal beszél ugyanarról.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **The Hole Truth: Monsteras** #5 · dist 0.717
2. **The Hole Truth: Monsteras** #6 · dist 0.717
3. **The Hole Truth: Monsteras** #4 · dist 0.737
4. **The Hole Truth: Monsteras** #3 · dist 0.747
5. **How To Care for a Monstera Deliciosa** #8 · dist 0.755

### Teljes pipeline (HyDE + rerank)

1. **How to Care for a Desert Rose** #7 · dist 0.449 · rerank 9/10
2. **How to Care for a Stromanthe Triostar** #7 · dist 0.414 · rerank 8/10
3. **How to Care for Maranta** #6 · dist 0.434 · rerank 8/10
4. **How to Care for a Banana Plant** #7 · dist 0.415 · rerank 7/10
5. **Parlor Palm Plant Care Guide** #7 · dist 0.448 · rerank 7/10

**A rerank átrendezte a sorrendet** — a két lista top-1 találata különbözik.

---

## Milyen növény bírja a sötét fürdőszobát?

`sotet-furdoszoba` · nyelv: hu · típus: thematic

**Miért van a listában:** Két tudásforrás határa: a fény- és páraigény a cikkekben van, a konkrét termék a katalógusban. A retrieval-mérés csak a cikk-oldalt nézi.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **The Plant That Loves a Humid Bathroom** #3 · dist 0.487
2. **Everything You Need To Know About Lighting** #8 · dist 0.523
3. **The Plant That Loves a Humid Bathroom** #0 · dist 0.527
4. **The Plant That Loves a Humid Bathroom** #2 · dist 0.533
5. **The Best Plant for a Sunny Space** #2 · dist 0.534

### Teljes pipeline (HyDE + rerank)

1. **10 Best Low Light Indoor Plants for Your Home or Office** #2 · dist 0.368 · rerank 9/10
2. **Easy Indoor Plants That Can Survive Low Light** #10 · dist 0.385 · rerank 9/10
3. **10 Best Low Light Indoor Plants for Your Home or Office** #3 · dist 0.350 · rerank 8/10
4. **Easy Indoor Plants That Can Survive Low Light** #12 · dist 0.377 · rerank 8/10
5. **Easy Indoor Plants That Can Survive Low Light** #11 · dist 0.395 · rerank 8/10

**A rerank átrendezte a sorrendet** — a két lista top-1 találata különbözik.

---

## Milyen földet használjak átültetéskor?

`atulteteshez-fold` · nyelv: hu · típus: thematic

**Miért van a listában:** Több cikk '## Soil' szakasza felel rá (23 cikkben van ilyen). A HyDE-nak itt kell eldöntenie, melyik kontextusban kérdezünk.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **How to Reuse Coffee Grounds to Fertilize Houseplants** #5 · dist 0.782
2. **How to Reuse Coffee Grounds to Fertilize Houseplants** #6 · dist 0.783
3. **Silver Satin** #3 · dist 0.795
4. **How to Reuse Coffee Grounds to Fertilize Houseplants** #9 · dist 0.796
5. **How to Reuse Coffee Grounds to Fertilize Houseplants** #4 · dist 0.797

### Teljes pipeline (HyDE + rerank)

1. **Plant Care: Potting Mix 101** #8 · dist 0.294 · rerank 9/10
2. **Plant Care: Potting Mix 101** #9 · dist 0.359 · rerank 9/10
3. **Patio Gardening 101: Growing in Containers** #7 · dist 0.388 · rerank 9/10
4. **Plant Care: Potting Mix 101** #7 · dist 0.300 · rerank 8/10
5. **Plant Care: Potting Mix 101** #6 · dist 0.329 · rerank 8/10

**A rerank átrendezte a sorrendet** — a két lista top-1 találata különbözik.

---

## why are the leaves on my houseplant turning yellow?

`yellow-leaves-en` · nyelv: en · típus: control

**Miért van a listában:** ANGOL KONTROLL az 1. kérdéshez. A nyelvi szakadék nulla, tehát a nyers és a teljes pipeline különbsége itt tisztán a HyDE és a rerank számlájára megy.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **5 Causes For Your Plant’s Yellow Leaves** #4 · dist 0.327
2. **5 Causes For Your Plant’s Yellow Leaves** #5 · dist 0.330
3. **5 Causes For Your Plant’s Yellow Leaves** #1 · dist 0.340
4. **5 Causes For Your Plant’s Yellow Leaves** #3 · dist 0.342
5. **Bird of Paradise Care Guide** #14 · dist 0.344

### Teljes pipeline (HyDE + rerank)

1. **5 Causes For Your Plant’s Yellow Leaves** #3 · dist 0.261 · rerank 9/10
2. **Signs of Overwatering Your Plants** #5 · dist 0.335 · rerank 9/10
3. **5 Causes For Your Plant’s Yellow Leaves** #1 · dist 0.273 · rerank 8/10
4. **5 Causes For Your Plant’s Yellow Leaves** #2 · dist 0.298 · rerank 8/10
5. **Signs of Overwatering Your Plants** #4 · dist 0.345 · rerank 8/10

**A rerank átrendezte a sorrendet** — a két lista top-1 találata különbözik.

---

## how often should I water a snake plant?

`snake-plant-water-en` · nyelv: en · típus: control

**Miért van a listában:** ANGOL KONTROLL a 2. kérdéshez. Ugyanaz a mérés nyelvi szakadék nélkül — így elválik, mennyit adott a címsor-útvonal és mennyit a fordítás.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **How To Care for a Snake Plant** #6 · dist 0.254
2. **Philodendron** #3 · dist 0.373
3. **Jade Plant** #3 · dist 0.374
4. **How Often & How Much You Should Water Houseplants** #4 · dist 0.387
5. **How Often & How Much You Should Water Houseplants** #3 · dist 0.393

### Teljes pipeline (HyDE + rerank)

1. **How To Care for a Snake Plant** #6 · dist 0.163 · rerank 10/10
2. **Fall Plant Care Tips For Houseplants** #4 · dist 0.291 · rerank 9/10
3. **How Often & How Much You Should Water Houseplants** #9 · dist 0.360 · rerank 6/10
4. **Our Top 10 Plant Care Tips** #6 · dist 0.368 · rerank 5/10
5. **How Often & How Much You Should Water Houseplants** #4 · dist 0.336 · rerank 4/10

_A top-1 találat nem változott._

---

## NEGATÍV TESZT — Hogyan cseréljek téli gumit az autómon?

`negativ-auto` · nyelv: hu · típus: negative

**Miért van a listában:** NEGATÍV TESZT — a SZEREP határa. A korpusz növénygondozási cikkekből áll, erről egy szó sincs benne. Mérve: az agent ezt a kérdést 0 tool-hívással utasítja el, tehát a keresésig el sem jut — ezért kell mellé a légycsapós kérdés is.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **A Gardener's Guide to Growing Evergreen Trees and Shrubs** #10 · dist 0.707
2. **How to Care for Outdoor Plants Until They’re Ready for Spring Planting** #6 · dist 0.713
3. **How to Care for Outdoor Plants Until They’re Ready for Spring Planting** #5 · dist 0.716
4. **Rubber Tree** #7 · dist 0.726
5. **How We Ship Plants Safely in Winter** #0 · dist 0.737

### Teljes pipeline (HyDE + rerank)

1. **Japanese Maple Care Guide** #11 · dist 0.666 · rerank 0/10
2. **A Gardener's Guide to Growing Evergreen Trees and Shrubs** #10 · dist 0.693 · rerank 0/10
3. **Our Top 7 Winter Plant Care Tips** #2 · dist 0.720 · rerank 0/10
4. **Our Top 7 Winter Plant Care Tips** #0 · dist 0.721 · rerank 0/10
5. **Our Top 7 Winter Plant Care Tips** #6 · dist 0.725 · rerank 0/10

**A rerank átrendezte a sorrendet** — a két lista top-1 találata különbözik.

### Az agent válasza (a grounding próbája)

> Ez a kérdés kívül esik a szakterületemen! 😊 Én a **Szobakertész asszisztens** vagyok, és kizárólag növényekkel, növénygondozással, valamint a webshop katalógusával kapcsolatos kérdésekben tudok segíteni.
> 
> Ha van kérdésed például:
> - 🌿 **Növényválasztásról** (melyik illik a lakásodba, irodádba)
> - 🪴 **Növénygondozásról** (öntözés, fény, átültetés, kártevők)
> - 🛒 **A katalógus termékeiről** (ár, készlet, akciók)
> - 🎁 **Növénycsomagok összeállításáról**
> 
> ...akkor szívesen segítek! Mit tehetek érted a növények terén? 🌱

---

## NEGATÍV TESZT — Hogyan gondozzam a Vénusz légycsapóját?

`negativ-legycsapo` · nyelv: hu · típus: negative

**Miért van a listában:** NEGATÍV TESZT — a TUDÁS határa, és a grounding valódi próbája. Növénygondozási kérdés, tehát átmegy a szerep-kapun és LEFUT a keresés — de a korpuszban egyetlen cikk sem szól húsevő növényről (mérve: 0 találat a 'Venus flytrap'-re). A pgvector ettől függetlenül visszaad 20 darabot: a kérdés az, kimondja-e az agent, hogy nincs róla információja, forráskitalálás helyett.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **Fiddle Me This: Caring for a Fiddle Leaf Fig** #6 · dist 0.764
2. **Fiddle Me This: Caring for a Fiddle Leaf Fig** #4 · dist 0.771
3. **Christmas Cactus Care Guide: How to Care for a Christmas Cactus** #3 · dist 0.772
4. **How to Care for a Fiddle Leaf Fig or Ficus Lyrata** #3 · dist 0.780
5. **How to Care for a Pothos Plant** #4 · dist 0.783

### Teljes pipeline (HyDE + rerank)

1. **How to Care for a Tradescantia** #3 · dist 0.456 · rerank 0/10
2. **How to Care for a Fittonia** #4 · dist 0.485 · rerank 0/10
3. **How to Care for a Stromanthe Triostar** #4 · dist 0.487 · rerank 0/10
4. **How to Care for a Tradescantia** #4 · dist 0.492 · rerank 0/10
5. **Our Top 10 Plant Care Tips** #6 · dist 0.492 · rerank 0/10

**A rerank átrendezte a sorrendet** — a két lista top-1 találata különbözik.

### Az agent válasza (a grounding próbája)

> Sajnálom, a bolt tudásbázisában **nem található specifikus cikk a Vénusz légycsapó (Dionaea muscipula) gondozásáról** – a keresés más növények gondozási leírásait hozta fel, amelyek nem relevánsak.
> 
> Erről a kérdésről nincs információm a tudásbázisban. 🌿
> 
> Amit tehetek helyette:
> - **Megnézem, hogy a Vénusz légycsapó szerepel-e a katalógusunkban** – ha szeretnéd, megkeresem az elérhető példányokat.
> - Ha más növény gondozásáról kérdezel, szívesen segítek!
> 
> Keressem meg a katalógusban, hogy van-e raktáron Vénusz légycsapó?
