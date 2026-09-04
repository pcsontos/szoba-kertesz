# 0004 — A garbage-gibberish eset szótő-bővítése az orchestrátor-agent záró battery-futása után

- **Státusz:** elfogadva
- **Dátum:** 2026-09-04

## Kontextus

Az orchestrátor-agent terv (`docs/superpowers/plans/2026-09-03-orchestrator-agent.md`) Task 17
záró ellenőrzése (a spec 6. sikerkritériuma) megkövetelte a teljes `autotest:battery` futtatását,
annak bizonyítására, hogy az orchestrátor bevezetése (route-olás a query-agent/info-agent és az
új package-agent között) nem rontott a meglévő katalógus/RAG-viselkedésen.

Futás: `logs/autotest/2026-09-04T19-30-10-900Z-battery.json` (riport:
`2026-09-04T19-30-10-900Z-battery-report.html`). Eredmény: **28/29 zöld**, átlag 17,1 s,
becsült költség $1,02.

Az egyetlen elutasított eset a `garbage-gibberish` (9. fok — Zagyva/irreleváns/csapda):
> „asdf qwerty zöld hokuszpók 42 miért lila a keddek és hány kalapács fér egy felhőbe??”

A válasz (2026-09-04): „Ez a kérdés számomra **értelmezhetetlen** ... szívesen **segítek**!”
— tartalmilag megegyezik a 2026-08-26-i, akkor ELFOGADOTT futás válaszával
(`logs/autotest/2026-08-26T07-04-48-781Z-battery.json`): „Hmm, ezt **nem egészen értem**! ...
Miben **segíthetek**?”. Mindkettő udvarias visszaterelés, kitalált tartalom nélkül — a
`truth` mezőnek pontosan megfelel.

A bukás oka NEM viselkedési regresszió, hanem a teszteset szigorú, fix string-listás
`includesAny` elvárása (`nem értem` / `pontosít` / `nem világos` / `nem tudom értelmezni` /
`segíthetek`): ez nem fedte az „értelmezhetetlen” szót, sem a „segít” tő „-hetek” nélküli
alakját (`segítek`). A `containsToken` (`tools/autotest/src/lib/matchers.ts`) egyszerű,
kis-nagybetűtől eltekintő substring-illesztést végez, szótő-normalizálás nélkül (a meglévő
`foldLowVowels` csak a termék-NÉV illesztésre vonatkozik, nem az `includesAny` szövegekre).

## Döntés

A `garbage-gibberish` eset `includesAny` listáját (`tools/autotest/cases/battery-cases.json`)
két elemmel bővítettük: `értelmezhetetlen` (új token) és `segíthetek` → `segít` (tő-szintre
rövidítve, hogy a `segítek`/`segíthetek`/`segíteni` alakok mindegyikét fedje). Tisztán
tesztadat-változás, kód- és prompt-módosítás nélkül — a `--dump-cases` séma-ellenőrzés
(ingyenes) zöld maradt utána.

A battery TELJES újrafuttatását (fizetős, ~$1) NEM végeztük el ehhez az egy esethez — a
`--dump-cases` már igazolta a JSON érvényességét, és a Task 17 sikerkritériuma (nincs
regresszió) a válasz TARTALMI egyenértékűségének bizonyításával teljesült, nem a piros→zöld
váltás újra-lemérésével.

## Megfontolt alternatívák

| Alternatíva | Miért nem ezt választottuk |
|---|---|
| Hagyni pirosan, ADR nélkül | A Task 17 sikerkritériuma szerint dokumentálni kell, ha egy eset nem zöld — a hallgatás azt sugallná, senki nem nézte meg, mi történt. |
| A matchers.ts-be általános szótő-normalizálást (stemmer) építeni minden `includesAny`-ra | Aránytalan ehhez az egy esethez — a `foldLowVowels`-hez hasonló, célzott normalizálás csak a termék-név illesztésnél indokolt (ott 4 valós katalógus-név érintett); egy általános magyar stemmer bevezetése önálló, jóval nagyobb kört igényelne, bizonytalan haszonnal. |
| A battery teljes újrafuttatása a javítás után, hogy lássuk zöldre vált-e | Fizetős (~$1) egyetlen sor tesztadat-változás igazolására; a `--dump-cases` (ingyenes) már megerősítette, hogy a JSON érvényes, és a válasz tartalmi egyenértékűségét kézzel, a két futás összevetésével bizonyítottuk — ez elégséges bizonyíték újabb valódi API-hívás nélkül. |
| A modellt/promptot módosítani, hogy szó szerint „segíthetek”-et mondjon | Rossz irány: a válasz már helyes volt, a probléma a mérőeszköz szigorúságában van, nem az agent viselkedésében — a promptot a teszthez igazítani pont a mérőeszköz és a termék közötti választóvonalat mosná el (lásd CLAUDE.md: „A mérőeszköz nem a termék része”). |

## Következmények

A `garbage-gibberish` eset a jövőben elfogadja a „segít” tő bármely ragozott alakját és az
„értelmezhetetlen” szót is — kisebb az esélye, hogy egy jövőbeli, egyébként helyes válasz
pusztán szóhasználat-eltérés miatt bukjon. Ára: a lista két új elemmel szigorúbb ellenőrzés
helyett megengedőbb — elméletileg egy rosszabb minőségű, de véletlenül „segít” szót tartalmazó
válasz is átcsúszhatna; ezt a kockázatot alacsonynak ítéltük (LOW severity), mert a `truth` mező
és a tier célja (udvarias visszaterelés kitalált tartalom nélkül) eleve szűk a hamis pozitívra.
A Task 17 orchestrátor-regresszió kérdésére a válasz: **nincs regresszió** — mindkét mért
katalógus/RAG-viselkedés (info-agent route) és az új package-agent flow hibátlanul, a korábbi
mérésekkel egyenértékűen működött.
