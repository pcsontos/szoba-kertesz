# Golden set — futás: `uj-chunker`

> Generált fájl, a `pnpm golden:run --label uj-chunker` írta. Ne szerkeszd kézzel.
> Futás ideje: 2026-08-21T20:58:19.280Z

## Összefoglaló

| # | kérdés | nyelv | nyers top-1 | teljes top-1 | top-1 változott |
|---|---|---|---|---|---|
| 1 | Miért sárgulnak a szobanövényem levelei? | hu | Bird of Paradise Care Guide | 5 Causes For Your Plant’s Yellow Leaves | IGEN |
| 2 | Milyen gyakran öntözzem a kígyónövényt? | hu | Bird’s Nest Fern | How To Care for a Snake Plant | IGEN |
| 3 | Túlöntöztem a monsterámat, mit tegyek? | hu | The Hole Truth: Monsteras | How to Care for a Banana Plant | IGEN |
| 4 | Milyen növény bírja a sötét fürdőszobát? | hu | The Plant That Loves a Humid Bathroom | 10 Best Low Light Indoor Plants for Your Home or Office | IGEN |
| 5 | Milyen földet használjak átültetéskor? | hu | Between Two Ferns | Plant Care: Potting Mix 101 | IGEN |
| 6 | why are the leaves on my houseplant turning yellow? | en | 5 Causes For Your Plant’s Yellow Leaves | 5 Causes For Your Plant’s Yellow Leaves | IGEN |
| 7 | how often should I water a snake plant? | en | How To Care for a Snake Plant | How To Care for a Snake Plant | nem |
| 8 | Hogyan cseréljek téli gumit az autómon? | hu | A Gardener's Guide to Growing Evergreen Trees and Shrubs | Our Top 7 Winter Plant Care Tips | IGEN |
| 9 | Hogyan gondozzam a Vénusz légycsapóját? | hu | Fiddle Me This: Caring for a Fiddle Leaf Fig | How to Care for a Tradescantia | IGEN |

---

## Miért sárgulnak a szobanövényem levelei?

`sargulo-level` · nyelv: hu · típus: thematic

**Miért van a listában:** A leggyakoribb gondozási kérdés. Sok cikk érinti, tehát a RETRIEVAL bősége a kihívás, nem a hiánya.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **Bird of Paradise Care Guide** #14 · dist 0.629
2. **Bird of Paradise Care Guide** #15 · dist 0.630
3. **Bird of Paradise Care Guide** #1 · dist 0.675
4. **Bird’s Nest Fern** #1 · dist 0.683
5. **Plants 101: Epiphytes and Air Plants** #17 · dist 0.685

### Teljes pipeline (HyDE + rerank)

1. **5 Causes For Your Plant’s Yellow Leaves** #5 · dist 0.248 · rerank 9/10
2. **5 Causes For Your Plant’s Yellow Leaves** #3 · dist 0.256 · rerank 9/10
3. **5 Causes For Your Plant’s Yellow Leaves** #2 · dist 0.283 · rerank 9/10
4. **5 Causes For Your Plant’s Yellow Leaves** #1 · dist 0.251 · rerank 8/10
5. **5 Causes For Your Plant’s Yellow Leaves** #4 · dist 0.289 · rerank 8/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

---

## Milyen gyakran öntözzem a kígyónövényt?

`kigyonoveny-ontozes` · nyelv: hu · típus: thematic

**Miért van a listában:** A CÍMSOR-ÚTVONAL próbája: mérve 54 cikkben van külön 'Water' szakasz-címsor, és a növény neve egyikben sincs benne. Ha valahol, itt kell javulnia a találatnak.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **Bird’s Nest Fern** #3 · dist 0.618
2. **Herb Care and Botanical Cocktail Making** #5 · dist 0.635
3. **How to Care for Bird’s Nest Fern** #2 · dist 0.640
4. **How To Care for a Monstera Deliciosa** #9 · dist 0.647
5. **Bird of Paradise Care Guide** #9 · dist 0.653

### Teljes pipeline (HyDE + rerank)

1. **How To Care for a Snake Plant** #6 · dist 0.160 · rerank 10/10
2. **Fall Plant Care Tips For Houseplants** #4 · dist 0.270 · rerank 9/10
3. **The Essential Low Maintenance Plant for Busy Schedules** #3 · dist 0.396 · rerank 8/10
4. **Our Top 10 Plant Care Tips** #6 · dist 0.379 · rerank 5/10
5. **How Often & How Much You Should Water Houseplants** #9 · dist 0.379 · rerank 4/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

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

1. **How to Care for a Banana Plant** #7 · dist 0.441 · rerank 5/10
2. **How to Care for a Stromanthe Triostar** #7 · dist 0.440 · rerank 4/10
3. **How To Care for a Monstera Deliciosa** #5 · dist 0.308 · rerank 3/10
4. **How To Care for a Monstera Deliciosa** #13 · dist 0.301 · rerank 2/10
5. **How To Care for a Monstera Deliciosa** #8 · dist 0.307 · rerank 1/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

---

## Milyen növény bírja a sötét fürdőszobát?

`sotet-furdoszoba` · nyelv: hu · típus: thematic

**Miért van a listában:** Két tudásforrás határa: a fény- és páraigény a cikkekben van, a konkrét termék a katalógusban. A retrieval-mérés csak a cikk-oldalt nézi.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **The Plant That Loves a Humid Bathroom** #0 · dist 0.527
2. **The Plant That Loves a Humid Bathroom** #2 · dist 0.536
3. **The Best Plant for a Sunny Space** #2 · dist 0.544
4. **The Plant That Loves a Humid Bathroom** #1 · dist 0.544
5. **The Plant That Loves a Humid Bathroom** #3 · dist 0.545

### Teljes pipeline (HyDE + rerank)

1. **10 Best Low Light Indoor Plants for Your Home or Office** #2 · dist 0.382 · rerank 9/10
2. **10 Best Low Light Indoor Plants for Your Home or Office** #1 · dist 0.340 · rerank 8/10
3. **Easy Indoor Plants That Can Survive Low Light** #10 · dist 0.379 · rerank 8/10
4. **10 Best Low Light Indoor Plants for Your Home or Office** #3 · dist 0.380 · rerank 8/10
5. **10 Best Low Light Indoor Plants for Your Home or Office** #4 · dist 0.397 · rerank 8/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

---

## Milyen földet használjak átültetéskor?

`atulteteshez-fold` · nyelv: hu · típus: thematic

**Miért van a listában:** Több cikk 'Soil' szakasza felel rá (mérve 28 cikkben van ilyen). A HyDE-nak itt kell eldöntenie, melyik kontextusban kérdezünk.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **Between Two Ferns** #16 · dist 0.765
2. **How to Reuse Coffee Grounds to Fertilize Houseplants** #5 · dist 0.788
3. **How to Reuse Coffee Grounds to Fertilize Houseplants** #6 · dist 0.792
4. **Silver Satin** #3 · dist 0.795
5. **How to Reuse Coffee Grounds to Fertilize Houseplants** #9 · dist 0.796

### Teljes pipeline (HyDE + rerank)

1. **Plant Care: Potting Mix 101** #8 · dist 0.287 · rerank 9/10
2. **Plant Care: Potting Mix 101** #7 · dist 0.322 · rerank 9/10
3. **How To Repot Your Houseplant** #7 · dist 0.343 · rerank 9/10
4. **Plant Care: Potting Mix 101** #6 · dist 0.356 · rerank 9/10
5. **Patio Gardening 101: Growing in Containers** #7 · dist 0.363 · rerank 9/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

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

1. **5 Causes For Your Plant’s Yellow Leaves** #3 · dist 0.238 · rerank 10/10
2. **5 Causes For Your Plant’s Yellow Leaves** #2 · dist 0.251 · rerank 10/10
3. **5 Causes For Your Plant’s Yellow Leaves** #1 · dist 0.255 · rerank 9/10
4. **5 Causes For Your Plant’s Yellow Leaves** #5 · dist 0.257 · rerank 9/10
5. **Signs of Overwatering Your Plants** #5 · dist 0.310 · rerank 9/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

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

1. **How To Care for a Snake Plant** #6 · dist 0.194 · rerank 10/10
2. **Fall Plant Care Tips For Houseplants** #4 · dist 0.291 · rerank 9/10
3. **The Essential Low Maintenance Plant for Busy Schedules** #3 · dist 0.352 · rerank 8/10
4. **How to Care for Succulents: Plant Care 101** #7 · dist 0.368 · rerank 5/10
5. **How Often & How Much You Should Water Houseplants** #9 · dist 0.347 · rerank 4/10

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

1. **Our Top 7 Winter Plant Care Tips** #0 · dist 0.493 · rerank 0/10
2. **Understanding Lighting in Your Home and How It Affects Your Plants** #0 · dist 0.502 · rerank 0/10
3. **Ask the Experts: Spring Gardening Tips from The Sill® + NYBG** #0 · dist 0.502 · rerank 0/10
4. **Our Top 7 Winter Plant Care Tips** #7 · dist 0.506 · rerank 0/10
5. **Fall Plant Care Tips For Houseplants** #1 · dist 0.506 · rerank 0/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

### Az agent válasza (a grounding próbája)

> Ez egy növénygondozási asszisztens vagyok, és kizárólag növényekkel, növénygondozással és a webshop katalógusával kapcsolatos kérdésekben tudok segíteni. 🌿
> 
> Az autós gumicsere sajnos nem tartozik a szakterületemre — ahhoz érdemes autószerelőhöz fordulni, vagy egy erre specializált weboldalt felkeresni.
> 
> Ha van bármilyen kérdésed **növényekkel, szobanövény-választással vagy gondozással** kapcsolatban, szívesen segítek! 😊

---

## NEGATÍV TESZT — Hogyan gondozzam a Vénusz légycsapóját?

`negativ-legycsapo` · nyelv: hu · típus: negative

**Miért van a listában:** NEGATÍV TESZT — a TUDÁS határa, és a grounding valódi próbája. Növénygondozási kérdés, tehát átmegy a szerep-kapun és LEFUT a keresés — de a korpuszban egyetlen cikk sem szól húsevő növényről (mérve: 0 találat a 'Venus flytrap'-re). A pgvector ettől függetlenül visszaad 20 darabot: a kérdés az, kimondja-e az agent, hogy nincs róla információja, forráskitalálás helyett.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **Fiddle Me This: Caring for a Fiddle Leaf Fig** #6 · dist 0.764
2. **Fiddle Me This: Caring for a Fiddle Leaf Fig** #4 · dist 0.771
3. **Christmas Cactus Care Guide: How to Care for a Christmas Cactus** #3 · dist 0.772
4. **Fiddle Me This: Caring for a Fiddle Leaf Fig** #1 · dist 0.776
5. **How to Care for a Fiddle Leaf Fig or Ficus Lyrata** #3 · dist 0.780

### Teljes pipeline (HyDE + rerank)

1. **How to Care for a Tradescantia** #3 · dist 0.463 · rerank 0/10
2. **Our Top 10 Plant Care Tips** #7 · dist 0.483 · rerank 0/10
3. **How To Care for a Spider Plant** #4 · dist 0.486 · rerank 0/10
4. **Our Top 10 Plant Care Tips** #6 · dist 0.487 · rerank 0/10
5. **How To Care for a Spider Plant** #7 · dist 0.495 · rerank 0/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

### Az agent válasza (a grounding próbája)

> Sajnálom, a tudásbázisban **nem található specifikus cikk a Vénusz légycsapó (Dionaea muscipula) gondozásáról**. A keresés más növényekre vonatkozó cikkeket hozott vissza, amelyek nem relevánsak ehhez a kérdéshez.
> 
> Erről nincs információm a tudásbázisban. 🌿
> 
> ---
> 
> Ha szeretnéd, tudok segíteni az alábbiakban:
> - **Megkeresem a katalógusban**, hogy kapható-e nálunk Vénusz légycsapó.
> - **Más, rokon témájú kérdésekben** (pl. húsevő növények általános igényei) szívesen keresek a tudásbázisban, ha más formában teszed fel a kérdést.
