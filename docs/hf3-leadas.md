# HF3 — mit kért a kiírás, és hol teljesül

> A 3. házi feladat (**6. óra — „Honnan tudja az agent, amit tud?"**) végigvezetése: pontról pontra, mit
> kért a kiírás, mit csináltunk, és **mi bizonyítja**. Ez a dokumentum **mutató és indoklás** — a részletek
> a hivatkozott doksikban vannak, nem itt megismételve.
>
> A repo a HF1 továbbvitele: a RAG-réteg a meglévő ágensre épült, ahogy a kiírás engedi.

## 1. Use case és tudásbázis — **B opció**

A **Plantbase továbbvitele**: a tudásbázis a kurzus 202 angol nyelvű növénygondozási cikke
(`seed/knowledge/*.md`, ~193 800 szó, öt kategóriában).

**Miért B, tudatosan:** az A opció (saját, 20-30 dokumentumos korpusz összeállítása) a *gyűjtésre* vitte
volna az energiát. A kiírás kimondja, hogy a két út egyenrangú, de **a B-nél az indoklások és az elemzés
súlya nagyobb** — mi ezt vállaltuk el: a chunking-továbbfejlesztést, a golden setet és az elemzéseket.

**A domaint ismerjük**, mert a katalógus-ágens ugyanerről a témáról szól (szobanövények, gondozás,
fény- és vízigény) — a találatok minőségét tehát meg tudjuk ítélni.

## 2. Chunking-stratégia — és az indoklás

**Teljes leírás: [`chunking-strategia.md`](chunking-strategia.md).** Dióhéjban:

A korpuszon mérve **54 cikkben** van külön „Water" szakasz-címsor, 56-ban „Humidity" — és a **növény neve
egyikben sincs benne**, csak a cikk címében, ami egy másik darabba került. A régi darabolással a 2041
darabból csak **1157 (57%)** tartalmazta a saját cikkének kulcsszavát.

A megoldás: **címsor-útvonal minden darab elé**, a darab saját szövegében.

```
How To Care for a Snake Plant › Water

## Water

Water every 2-8 weeks, allowing the soil to dry out completely…
```

Az útvonal a `content`-be kerül, **nem külön oszlopba** — amit embeddelünk, az a `content`; külön oszlopban
a vektor nem tudna róla, és pont a megoldandó probléma maradna. Járulékos haszon: nincs migráció, és a
modell is látja, melyik szakaszból idéz.

Ezt a döntés **kikényszerítette** a törzs nélküli darabok eldobását (az előtag az üres címke-darabokat
nem semlegesítené, hanem felerősítené), ami viszont először **túl sokat vitt el** — lásd lentebb, „Amit a
mérés felülírt".

| mutató | régi | új |
|---|---|---|
| darabszám | 2041 | **1906** |
| tartalmazza a saját cikkének címét | 1157 (**57%**) | 1906 (**100%**) |
| medián darabhossz | 429 karakter | **547** |
| 200 karakter alatti darab | 462 (23%) | **190 (10%)** |
| legkisebb darab | 3 karakter | **28** |

**Unit tesztek** (a kiírás kéri): `packages/core/src/lib/rag/chunk.spec.ts`, **13 eset** — köztük hogy
`docTitle` nélkül a kimenet karakterre változatlan, hogy a folytatás-darab a beágyazó szakaszt kapja, és
hogy a h2 → h5 ugrás nem lyukasztja ki az útvonalat.

**Amit tudatosan NEM csináltunk** (a kiírás szerint „a felesleges túlbonyolítás sem érdem"): törpe-darabok
összevonása (az előtag magától megoldotta: 462 → 190), a szakaszhatár h1–h3-ra szűkítése (204 darab menne
1000 karakter fölé), modell-alapú szemantikus darabolás. Mindegyikhez mért indok a doksiban.

## 3. A keresési pipeline

| kötelező elem | hol | megjegyzés |
|---|---|---|
| **Embedding + vektor-tárolás** | `rag/embed.ts`, `rag/knowledge-store.ts` | **pgvector** (a kiírás ezt ajánlja), `knowledge_chunks` tábla, 1536 dimenzió, koszinusz-távolság (`<=>`) |
| **HyDE** | `rag/hyde.ts` | a kérdésre kitalált hipotetikus válasz **angolul**, mert a korpusz angol — ezt embeddeljük a kérdés helyett |
| **Rerank** | `rag/rerank.ts` | a pgvector top-20-át Claude Haiku rangsorolja át `generateObject`-tel, 0-10 pont |
| **Grounding** | `query-prompt.ts` `<grounding>` blokk + `tools/search-knowledge/` | a válasz **forrás-hivatkozással** jön (cikk címe + URL), és ha nincs találat, az ágens kimondja |

A pipeline egy helyen, lépésenként olvashatóan: `rag/retrieve.ts`. A **két pool** szétválasztása is itt
számít: a keresés a `szoba-kertesz_ro` szerepen fut, a betöltés adminon.

**Láthatóság** (a kiírás tanácsa: „ha rossz a válasz, először a retrievalt nézd"): `apps/server/src/debug-knowledge.ts` —
`GET /debug/knowledge/sources`, `/sources/:id` (egy dokumentum a chunkjaival: **látszik, hol vágtunk**) és
`/chunks?search=…&pipeline=full`. Élesben nincs mountolva, és egy spec pinneli a 404-et.

### Multi-provider routing

A kiírás **legalább két provider** modelljét kéri. A szereposztás és az indoklás a
[README „Multi-provider szereposztás"](../README.md#multi-provider-szereposztás) szakaszában:

- **OpenAI `text-embedding-3-small`** — embedding. **Kényszer, nem választás:** az Anthropic nem ad
  embedding-modellt. Ez a projekt egyetlen nem-Anthropic hívása.
- **Claude Haiku 4.5** — HyDE + rerank. Sok hívás, sablonos feladat, alacsony minőségi plafon.
- **Claude Sonnet 4.6** — a végső válasz. Itt a megfogalmazás, a magyar nyelv és a grounding-fegyelem számít.

Egy mondatban: **a drága modell válaszol, az olcsó válogat.**

## 4. Golden set

**Teljes elemzés: [`golden-set.md`](golden-set.md)** · nyers mérési adat: [`golden/`](golden/).

**9 kérdés** (a kiírás 5-10-et kér): 5 magyar tematikus + 2 angol kontroll + **2 negatív**. Mindegyik
**kétszer** fut, **ugyanazon** a `retrieveKnowledge`-en — nyers (se HyDE, se rerank) és teljes —, és a
mérés **két tudásbázis-állapoton** is lefutott: a régi és az új chunkerrel.

Futtatás: `pnpm golden:run --label <név>` → `docs/golden/futas-<név>.md`.

**A rerank átrendezése, konkrétan** (a kiírás ezt kifejezetten kéri): a *„Milyen gyakran öntözzem a
kígyónövényt?"* kérdés nyers top-5-jében **egyetlen kígyónövény-darab sincs** (páfrány, fűszernövény,
monstera). A teljes pipeline után a *How To Care for a Snake Plant* öntözési szakasza áll az élen,
**10/10** rerank-pontszámmal. Miért jobb: a kérdés egy **konkrét növény** öntözéséről szól, a nyers lista
viszont a *téma* (öntözés) szerint talált, a növény szerint nem.

### Negatív teszt

**Két** negatív kérdés van, és ez mérés eredménye, nem alaposkodás:

| kérdés | tool-hívás | mit bizonyít |
|---|---|---|
| „Hogyan cseréljek téli gumit az autómon?" | **0** | a **szerep** határát — a keresésig el sem jut, tehát a groundingot nem próbálja |
| „Hogyan gondozzam a Vénusz légycsapóját?" | **1** (`searchKnowledge`) | a **grounding**-ot: lefut a keresés, 5 találatot ad, de a korpuszban **0 cikk** szól húsevő növényről |

A második válasza szó szerint: *„Sajnálom, a tudásbázisban nem található specifikus cikk a Vénusz
légycsapó (Dionaea muscipula) gondozásáról. A keresés más növényekre vonatkozó cikkeket hozott vissza,
amelyek nem relevánsak ehhez a kérdéshez. **Erről nincs információm a tudásbázisban.**"* — forráskitalálás
nélkül.

Külön tanulságos: a **reranker mind az 5 találatra 0/10-et adott**, tehát *felismerte* az érdektelenséget —
de ez a pontszám ma nem jut el a modellhez, és nem is dob el semmit. **A grounding tehát tisztán a
prompt-szabályon áll, és mérve elég** — küszöböt ezért nem építettünk.

## 5. Architektúra-spec: a tudásbázis karbantartása

**[`ARCHITEKTURA.md`](ARCHITEKTURA.md)** — terv, nem implementáció, ahogy a kiírás kéri. A négy kérdésre
konkrét mechanizmussal felel: tartalom-hash a **megtisztított** törzsön (különben a letöltés dátuma is
újravektorizálna), `knowledge_documents` tábla, halmazkülönbség a törléshez, és **egyetlen tranzakció** a
törlés + beírás + hash-frissítés hármasára.

Két kockázatot nevén nevez: a részleges beolvasás **hamis törlést** okozhat (ezért a törlés-ág csak
hiánytalan beolvasás után fut, és 20% fölötti eltűnésnél megáll), és a hash külön frissítése egy bukott
beírás után **véglegesen elrejtené** a dokumentumot az újraindexelés elől.

**Ábra:** [`img/tudasbazis-adatfolyam.svg`](img/tudasbazis-adatfolyam.svg) — a teljes adatfolyam a
hash-elágazással és **a törlés útjával**. A mermaid-forrás a doksiban marad, hogy verziókövethető legyen.

## 6. Költségbecslés

[README „Költségbecslés"](../README.md#költségbecslés). A három szám:

| tétel | ár |
|---|---|
| a teljes tudásbázis vektorizálása (274 000 token) | **~0,55 cent** |
| egy gondozási kérdés (HyDE + embedding + rerank + válasz) | **~3,6 cent** |
| egy katalógus-kérdés (csak SQL) | **~1,5 cent** |

A becslés **megmondja, mi mért és mi becsült**: a válasz-oldal tokenszámai valódi JSONL-naplósorok, a
HyDE/rerank/embedding viszont a `retrieve.ts`-en belül fut, **nem az agent-loopban**, ezért a napló nem
tartalmazza őket — azokra a mért karakterszámokból adunk becslést.

## Amit a mérés felülírt — négy eset

A kiírás azt értékeli, hogy a döntések **a tudásbázisból következnek**. Négy helyen a mérés a saját
tervünket cáfolta meg, és mind a négy dokumentálva van:

1. **A tervezéskor rögzített korpusz-számok háromszor megdőltek.** Nem 23, hanem **54** cikkben van „Water"
   címsor; a leggyakoribb címsorszint nem a h2, hanem az **h5** (607 db); a régi chunker nem 61%-on, hanem
   **57%**-on állt. Mindenhol a mért érték került a doksiba.
2. **A negatív teszt kettévált**, mert kiderült, hogy az autós kérdést az ágens 0 tool-hívással utasítja el.
3. **A törzs nélküli darabok szabálya túl sokat vitt el:** 184 darabot a várt ~75 helyett. A többletből
   **49 valódi tartalom** volt — a cikkek bevezetője gyakran `######`-tal formázott mondat. Ezért kapott
   kivételt: 60 karakter fölött egy címsor már mondat, nem címke.
4. **Egy látszólagos romlás nem regresszió volt.** A monstera-kérdésnél az új mérés rosszabb találatot
   hozott; háromszor lefuttatva viszont három különböző top-1 jött (kétszer a helyes cikk), miközben a
   nyers, determinisztikus oldal stabil maradt. **A szórás a HyDE-ban van** — ezért egyetlen futás nem
   alkalmas két chunker összevetésére, és ezt a golden-set elemzés ki is mondja.

## Futtatás — a minimum, ami kell

```bash
docker compose up -d                       # Postgres + pgvector
pnpm exec prisma migrate deploy            # séma (a pgvector és a DB-szerepek is migrációban)
pnpm exec prisma db seed                   # ~30 növény a katalógusba
pnpm knowledge:ingest                      # a tudásbázis: 202 cikk → 1906 chunk (FIZETŐS: OpenAI)
pnpm cli ask "Milyen gyakran öntözzem a kígyónövényt?"
```

A böngészős chathez: `pnpm serve:api` + `pnpm serve:web`. A részletes leírás, a környezeti változók és a
debug-végpontok a [README](../README.md)-ben.
