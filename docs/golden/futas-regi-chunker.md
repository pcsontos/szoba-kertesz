# Golden set — futás: `regi-chunker`

> Generált fájl, a `pnpm golden:run --label regi-chunker` írta. Ne szerkeszd kézzel.
> Futás ideje: 2026-08-20T21:11:15.011Z

## Összefoglaló

| # | kérdés | nyelv | nyers top-1 | teljes top-1 | top-1 változott |
|---|---|---|---|---|---|
| 1 | Miért sárgulnak a szobanövényem levelei? | hu | Bird of Paradise Care Guide | 5 Causes For Your Plant’s Yellow Leaves | IGEN |
| 2 | Milyen gyakran öntözzem a kígyónövényt? | hu | How To Care for a Monstera Deliciosa | How To Care for a Snake Plant | IGEN |
| 3 | Túlöntöztem a monsterámat, mit tegyek? | hu | How To Care for a Monstera Deliciosa | How To Care for a Monstera Deliciosa | IGEN |
| 4 | Milyen növény bírja a sötét fürdőszobát? | hu | The Plant That Loves a Humid Bathroom | 10 Best Low Light Indoor Plants for Your Home or Office | IGEN |
| 5 | Milyen földet használjak átültetéskor? | hu | Gardening 101: How to Water Your Garden | How to Care for a Sago Palm | IGEN |
| 6 | why are the leaves on my houseplant turning yellow? | en | Bird of Paradise Care Guide | 5 Causes For Your Plant’s Yellow Leaves | IGEN |
| 7 | how often should I water a snake plant? | en | How To Care for a Snake Plant | How To Care for a Snake Plant | nem |
| 8 | Hogyan cseréljek téli gumit az autómon? | hu | A Gardener's Guide to Growing Evergreen Trees and Shrubs | A Gardener's Guide to Growing Evergreen Trees and Shrubs | nem |
| 9 | Hogyan gondozzam a Vénusz légycsapóját? | hu | How to Care for Begonias | How to Care for a Fittonia | IGEN |

---

## Miért sárgulnak a szobanövényem levelei?

`sargulo-level` · nyelv: hu · típus: thematic

**Miért van a listában:** A leggyakoribb gondozási kérdés. Sok cikk érinti, tehát a RETRIEVAL bősége a kihívás, nem a hiánya.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **Bird of Paradise Care Guide** #15 · dist 0.626
2. **Bird of Paradise Care Guide** #16 · dist 0.644
3. **Plants 101: Epiphytes and Air Plants** #16 · dist 0.660
4. **Plants 101: Epiphytes and Air Plants** #17 · dist 0.672
5. **Bird’s Nest Fern** #1 · dist 0.672

### Teljes pipeline (HyDE + rerank)

1. **5 Causes For Your Plant’s Yellow Leaves** #3 · dist 0.299 · rerank 9/10
2. **5 Causes For Your Plant’s Yellow Leaves** #2 · dist 0.315 · rerank 9/10
3. **5 Causes For Your Plant’s Yellow Leaves** #1 · dist 0.262 · rerank 8/10
4. **5 Causes For Your Plant’s Yellow Leaves** #5 · dist 0.295 · rerank 8/10
5. **5 Causes For Your Plant’s Yellow Leaves** #4 · dist 0.302 · rerank 8/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

---

## Milyen gyakran öntözzem a kígyónövényt?

`kigyonoveny-ontozes` · nyelv: hu · típus: thematic

**Miért van a listában:** A CÍMSOR-ÚTVONAL próbája: 23 cikkben van '## Water' szakasz, és a növény neve egyikben sincs benne. Ha valahol, itt kell javulnia a találatnak.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **How To Care for a Monstera Deliciosa** #9 · dist 0.612
2. **Moon Valley Pilea (Pilea Mollis)** #4 · dist 0.624
3. **How to Care for Bird’s Nest Fern** #3 · dist 0.629
4. **Bird’s Nest Fern** #4 · dist 0.631
5. **How to Care for Anthurium** #4 · dist 0.633

### Teljes pipeline (HyDE + rerank)

1. **How To Care for a Snake Plant** #6 · dist 0.186 · rerank 10/10
2. **Fall Plant Care Tips For Houseplants** #4 · dist 0.271 · rerank 9/10
3. **10 Best Low Light Indoor Plants for Your Home or Office** #2 · dist 0.366 · rerank 8/10
4. **How To Keep Your Plants Alive While On Vacation** #14 · dist 0.360 · rerank 3/10
5. **How Often & How Much You Should Water Houseplants** #9 · dist 0.349 · rerank 2/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

---

## Túlöntöztem a monsterámat, mit tegyek?

`tulontozott-monstera` · nyelv: hu · típus: thematic

**Miért van a listában:** A RERANK próbája: a 'monstera öntözése' chunk vektorban közel van, de a valódi válasz a gyökérrothadásról szóló szakaszban van, ami más szavakkal beszél ugyanarról.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **How To Care for a Monstera Deliciosa** #8 · dist 0.732
2. **The Hole Truth: Monsteras** #6 · dist 0.740
3. **How To Care for a Monstera Deliciosa** #15 · dist 0.740
4. **The Hole Truth: Monsteras** #2 · dist 0.748
5. **The Hole Truth: Monsteras** #5 · dist 0.753

### Teljes pipeline (HyDE + rerank)

1. **How To Care for a Monstera Deliciosa** #13 · dist 0.285 · rerank 9/10
2. **Signs of Overwatering Your Plants** #5 · dist 0.386 · rerank 8/10
3. **Signs of Overwatering Your Plants** #4 · dist 0.411 · rerank 7/10
4. **How To Care for a Monstera Deliciosa** #5 · dist 0.336 · rerank 6/10
5. **Signs of Overwatering Your Plants** #3 · dist 0.438 · rerank 5/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

---

## Milyen növény bírja a sötét fürdőszobát?

`sotet-furdoszoba` · nyelv: hu · típus: thematic

**Miért van a listában:** Két tudásforrás határa: a fény- és páraigény a cikkekben van, a konkrét termék a katalógusban. A retrieval-mérés csak a cikk-oldalt nézi.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **The Plant That Loves a Humid Bathroom** #0 · dist 0.516
2. **The Best Plant for a Sunny Space** #2 · dist 0.528
3. **The Plant That Loves a Humid Bathroom** #2 · dist 0.535
4. **Everything You Need To Know About Lighting** #8 · dist 0.551
5. **Between Two Ferns** #18 · dist 0.556

### Teljes pipeline (HyDE + rerank)

1. **10 Best Low Light Indoor Plants for Your Home or Office** #1 · dist 0.333 · rerank 9/10
2. **10 Best Low Light Indoor Plants for Your Home or Office** #2 · dist 0.394 · rerank 9/10
3. **10 Best Low Light Indoor Plants for Your Home or Office** #4 · dist 0.404 · rerank 9/10
4. **Our 6 Most Popular Houseplants for Fall** #2 · dist 0.430 · rerank 9/10
5. **The Ultimate Low Light Plant** #3 · dist 0.433 · rerank 9/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

---

## Milyen földet használjak átültetéskor?

`atulteteshez-fold` · nyelv: hu · típus: thematic

**Miért van a listában:** Több cikk '## Soil' szakasza felel rá (23 cikkben van ilyen). A HyDE-nak itt kell eldöntenie, melyik kontextusban kérdezünk.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **Gardening 101: How to Water Your Garden** #8 · dist 0.758
2. **How to Care for an Arrowhead Plant** #5 · dist 0.771
3. **Bird of Paradise Care Guide** #9 · dist 0.774
4. **Prayer Plant Care Guide** #3 · dist 0.774
5. **How to Reuse Coffee Grounds to Fertilize Houseplants** #2 · dist 0.774

### Teljes pipeline (HyDE + rerank)

1. **How to Care for a Sago Palm** #5 · dist 0.258 · rerank 10/10
2. **Patio Gardening 101: Growing in Containers** #7 · dist 0.292 · rerank 10/10
3. **Bird of Paradise Care Guide** #8 · dist 0.295 · rerank 10/10
4. **How to Care for a Rubber Tree or Ficus Elastica** #8 · dist 0.296 · rerank 10/10
5. **How to Care for a Pothos Plant** #7 · dist 0.299 · rerank 10/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

---

## why are the leaves on my houseplant turning yellow?

`yellow-leaves-en` · nyelv: en · típus: control

**Miért van a listában:** ANGOL KONTROLL az 1. kérdéshez. A nyelvi szakadék nulla, tehát a nyers és a teljes pipeline különbsége itt tisztán a HyDE és a rerank számlájára megy.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **Bird of Paradise Care Guide** #15 · dist 0.289
2. **5 Causes For Your Plant’s Yellow Leaves** #1 · dist 0.323
3. **5 Causes For Your Plant’s Yellow Leaves** #5 · dist 0.343
4. **5 Causes For Your Plant’s Yellow Leaves** #4 · dist 0.357
5. **5 Causes For Your Plant’s Yellow Leaves** #3 · dist 0.368

### Teljes pipeline (HyDE + rerank)

1. **5 Causes For Your Plant’s Yellow Leaves** #1 · dist 0.231 · rerank 9/10
2. **5 Causes For Your Plant’s Yellow Leaves** #5 · dist 0.283 · rerank 9/10
3. **5 Causes For Your Plant’s Yellow Leaves** #3 · dist 0.284 · rerank 9/10
4. **5 Causes For Your Plant’s Yellow Leaves** #2 · dist 0.312 · rerank 9/10
5. **5 Causes For Your Plant’s Yellow Leaves** #4 · dist 0.278 · rerank 8/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

---

## how often should I water a snake plant?

`snake-plant-water-en` · nyelv: en · típus: control

**Miért van a listában:** ANGOL KONTROLL a 2. kérdéshez. Ugyanaz a mérés nyelvi szakadék nélkül — így elválik, mennyit adott a címsor-útvonal és mennyit a fordítás.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **How To Care for a Snake Plant** #6 · dist 0.245
2. **Fall Plant Care Tips For Houseplants** #4 · dist 0.350
3. **Moon Valley Pilea (Pilea Mollis)** #4 · dist 0.387
4. **A is for Aroids** #7 · dist 0.395
5. **Oxalis** #6 · dist 0.399

### Teljes pipeline (HyDE + rerank)

1. **How To Care for a Snake Plant** #6 · dist 0.148 · rerank 10/10
2. **Fall Plant Care Tips For Houseplants** #4 · dist 0.251 · rerank 9/10
3. **10 Best Low Light Indoor Plants for Your Home or Office** #2 · dist 0.368 · rerank 8/10
4. **How To Keep Your Plants Alive While On Vacation** #14 · dist 0.363 · rerank 6/10
5. **How Often & How Much You Should Water Houseplants** #9 · dist 0.374 · rerank 5/10

_A top-1 találat nem változott._

---

## NEGATÍV TESZT — Hogyan cseréljek téli gumit az autómon?

`negativ-auto` · nyelv: hu · típus: negative

**Miért van a listában:** NEGATÍV TESZT — a SZEREP határa. A korpusz növénygondozási cikkekből áll, erről egy szó sincs benne. Mérve: az agent ezt a kérdést 0 tool-hívással utasítja el, tehát a keresésig el sem jut — ezért kell mellé a légycsapós kérdés is.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **A Gardener's Guide to Growing Evergreen Trees and Shrubs** #10 · dist 0.688
2. **How to Care for Outdoor Plants Until They’re Ready for Spring Planting** #5 · dist 0.704
3. **Japanese Maple Care Guide** #12 · dist 0.714
4. **The Ultimate Guide to Planting and Caring for Bulbs** #12 · dist 0.723
5. **Our Top 10 Tips and Tricks To Beat the Winter Blues** #7 · dist 0.725

### Teljes pipeline (HyDE + rerank)

1. **A Gardener's Guide to Growing Evergreen Trees and Shrubs** #10 · dist 0.661 · rerank 0/10
2. **Japanese Maple Care Guide** #12 · dist 0.666 · rerank 0/10
3. **Our Top 7 Winter Plant Care Tips** #2 · dist 0.697 · rerank 0/10
4. **Our Top 7 Winter Plant Care Tips** #0 · dist 0.703 · rerank 0/10
5. **The Ultimate Guide to Planting and Caring for Bulbs** #12 · dist 0.705 · rerank 0/10

_A top-1 találat nem változott._

### Az agent válasza (a grounding próbája)

> Ez egy növényekkel kapcsolatos asszisztens vagyok – az autógumi-csere sajnos kívül esik a szakterületemen! 🌿
> 
> Ha **növényekkel, szobanövényekkel, kerti növényekkel, gondozási tanácsokkal vagy növényvásárlással** kapcsolatban van kérdésed, szívesen segítek! Például:
> 
> - 🌱 Növényajánlás adott helyiségbe vagy feltételek alapján
> - 💧 Öntözési, fényszükségleti, gondozási tanácsok
> - 🛒 Növénycsomagok összeállítása büdzsé szerint
> - 🐛 Kártevők, betegségek felismerése és kezelése
> 
> Miben segíthetek? 😊

---

## NEGATÍV TESZT — Hogyan gondozzam a Vénusz légycsapóját?

`negativ-legycsapo` · nyelv: hu · típus: negative

**Miért van a listában:** NEGATÍV TESZT — a TUDÁS határa, és a grounding valódi próbája. Növénygondozási kérdés, tehát átmegy a szerep-kapun és LEFUT a keresés — de a korpuszban egyetlen cikk sem szól húsevő növényről (mérve: 0 találat a 'Venus flytrap'-re). A pgvector ettől függetlenül visszaad 20 darabot: a kérdés az, kimondja-e az agent, hogy nincs róla információja, forráskitalálás helyett.

### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)

1. **How to Care for Begonias** #2 · dist 0.761
2. **How to Care for a Christmas Cactus or Schlumbergera** #5 · dist 0.775
3. **Christmas Cactus Care Guide: How to Care for a Christmas Cactus** #4 · dist 0.776
4. **How to Grow and Care for Your Own Chocolate (Cacao) Tree** #7 · dist 0.780
5. **How To Repot an Orchid** #10 · dist 0.787

### Teljes pipeline (HyDE + rerank)

1. **How to Care for a Fittonia** #4 · dist 0.447 · rerank 0/10
2. **How to Care for a Tradescantia** #3 · dist 0.449 · rerank 0/10
3. **How to Care for a Tradescantia** #4 · dist 0.460 · rerank 0/10
4. **How to Care for Begonias** #5 · dist 0.478 · rerank 0/10
5. **Dino Plant** #10 · dist 0.481 · rerank 0/10

**A teljes pipeline MÁS darabot tett az élre** — a két lista top-1 találata különbözik. A 2–5. hely eltérését ez a jelzés nem méri.

### Az agent válasza (a grounding próbája)

> Sajnálom, de **erről nincs információm a tudásbázisban.** A bolt gondozási cikkei között nem található specifikus útmutató a Vénusz légycsapó (*Dionaea muscipula*) gondozásáról – a keresés csak más, nem kapcsolódó növények gondozási leírásait hozta fel.
> 
> Ha szeretnéd, tudok segíteni az alábbiakban:
> 
> - 🌿 **Megnézem, hogy kapható-e a Vénusz légycsapó a katalógusban** (ár, készlet, méret)
> - 🔍 **Más gondozási kérdésedet** megválaszolom, ha a tudásbázisban szerepel
> - 🌱 **Hasonló különleges növényeket ajánlok** a katalógusból
> 
> Mit tegyek?
