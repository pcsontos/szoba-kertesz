# System prompt javítás — mit és miért változtattunk

> A kapott `docs/system-prompt.md` minőségi javítása (HF1 kötelező tétel). A javított prompt bájtra megegyezik a `packages/core/src/lib/system-prompt.ts` `SYSTEM_PROMPT` konstansával — a kettőt lockstepben tartjuk, mert az `askAgent` sémakontextusa ez a prompt. A javítások vezérelve: **kevesebb hallucináció, helyesebb SQL, őszintébb válasz**, a `docs/konvenciók.md` „Az agent promptjai (XML-szerű struktúra)" szakaszával összhangban (amely kifejezetten ajánlja az `<examples>` taget és a „ha nincs találat, mondd meg" szabályt).

## Összefoglaló táblázat

| # | Szekció | Változás | Miért javít |
|---|---|---|---|
| 1 | `<task>` | A „fordítsd SQL-re → runSql" helyett általánosabb megfogalmazás: SELECT generálása, `runSql`/`listCategories` közötti választás, és „mindig a tool tényleges eredményére támaszkodj". | A régi szöveg csak a `runSql`-t említette, így a `listCategories` tool „árva" maradt. Az explicit „a tool eredményére támaszkodj" mondat a text-to-SQL agent fő kockázatát — a kitalált adatot — célozza. |
| 2 | `<rules>` — kötött szótár | Új szabály: a `category`/`location`/`light`/`watering`/`difficulty` oszlopokra a `<schema>` pontos értékeire szűrjön (pl. `difficulty = 'kezdő'`), ne találjon ki szinonimát; bizonytalanság esetén `listCategories`. | Ezek fix, magyar, ékezetes szótárú oszlopok. Szinonima/hallucinált érték (`difficulty = 'könnyű'`) 0 találatot ad. A szabály a helyes egyenlőség-szűrésre irányít, és összeköti a `listCategories` toollal. |
| 3 | `<rules>` — `ORDER BY` | Új szabály: felsőfokú kérésnél (`legolcsóbb`, `legjobb értékelésű`, `legmagasabbra növő`) explicit `ORDER BY` a megfelelő oszlopra. | Felsőfok + `LIMIT` `ORDER BY` nélkül **nemdeterminisztikus, gyakran hibás** eredményt ad (a „3 legolcsóbb" random 3 sor lesz). Ez közvetlenül a „Működő termék" helyességét javítja. |
| 4 | `<rules>` — szűrő-oszlopok | A gondozás-sor kiegészítve: `kid_safe` (gyerekbiztos) és `air_purifying` (légtisztító) boolean szűrők. | Ezek gyakori ügyfél-szempontok, de a régi szabálylistából hiányoztak (csak `pet_safe` szerepelt), így a modellnek kellett kitalálnia a leképezést. |
| 5 | `<behavior>` — üres találat | Új szabály: ha a lekérdezés 0 sort ad, ne találjon ki terméket — mondja meg őszintén, és javasoljon lazább szűrést. | A `docs/konvenciók.md` mintája kifejezetten tartalmazza ezt; a promptból hiányzott. Enélkül a modell üres eredménynél hajlamos növényt „kitalálni". Anti-hallucináció + jobb UX. |
| 6 | `<behavior>` — összár + Ft | Csomag-összeállításnál az összár = a tételek `COALESCE(sale_price, price)` összege; az árakat forintban adja meg. | A régi „összár" nem kötötte az akciós árhoz; így a büdzsé-matek az akciót figyelmen kívül hagyhatta. A forint-egység a válasz-minőséget csiszolja. |
| 7 | `<behavior>` — ne dump-old a SQL-t | „ne nyers tábla-dump **és ne a generált SQL**". | A felhasználó lakberendező, nem SQL-t vár. A régi szöveg csak a tábla-dumpot tiltotta. |
| 8 | `<examples>` (ÚJ szekció) | 3 konkrét példa: (a) szűrés+büdzsé+felsőfok → SQL (bemutatja az `ORDER BY`-t, `COALESCE`-t, a kötött-szótár értékeket, `LIMIT`-et), (b) kategória-kérdés → `listCategories()` (tool-routing), (c) kétértelmű kérés → visszakérdezés. | A `docs/konvenciók.md` explicit ajánlása. A few-shot példák a legerősebb hallucináció-csökkentők egy text-to-SQL agentnél: egyszerre demonstrálják a helyes SQL-alakot, a tool-választást és a visszakérdező viselkedést. |

## Amit szándékosan NEM változtattunk

- A `<schema>` érintetlen — pontosan tükrözi a `products` táblát (`docs/tech-stack.md`), ez a helyes SQL alapja.
- A meglévő, kritikus SQL-szabályok (CSAK SELECT, LIMIT, ILIKE, `COALESCE(sale_price, price)`, `stock > 0`) szó szerint megmaradtak — a `system-prompt.spec.ts` regressziós tesztjei ezt ellenőrzik is.
- A `<role>` perszóna (Szobakertész / lakberendező) változatlan.

## Miért „minőségi" és nem kozmetikai

A nyolc pontból négy közvetlenül a **helyes SQL-t** célozza (kötött szótár, `ORDER BY`, összár-`COALESCE`, példák), kettő a **hallucináció** ellen hat (üres találat, „a tool eredményére támaszkodj"), kettő pedig a **válasz-minőséget** javítja (Ft, ne dump-old a SQL-t). Ezek mind mérhető, megfigyelhető viselkedésbeli különbségek — nem átfogalmazások. A javítás verifikálva: a `packages/core` teszt-szuit (a bővített `system-prompt.spec.ts`-szel) zöld, és a buildelt CLI-n élőben lefuttatott felsőfokú/szűréses kérdés helyes, rendezett választ ad.
