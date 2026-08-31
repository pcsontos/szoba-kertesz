**Feladó:** Csontos Péter — fejlesztés, Szoba-kertész projekt
**Címzett:** dr. Kertész Anna, jogi csapat
**Tárgy:** Válasz a megfelelési checklistre — a panaszkezelő és kompenzációs bővítés
**Dátum:** 2026. augusztus 31.

Kedves Anna!

Köszönjük a levelet és a checklistet. A jogszabályi hátteret ismerjük, és a besorolást nem nyitjuk
újra: a tervezett panaszkezelő és kompenzációs javaslattevő bővítésre a magas kockázatú
rendszerekre vonatkozó követelményekkel készülünk.

Egyetlen hatókör-észrevételünk van, és ezt érdemes írásban rögzíteni: **hogy az Annex III melyik
pontja áll rá, a modul pontos rendeltetésén múlik.** Más a helyzet, ha a javaslat összegszerű és az
azonosított ügyfélhez tapad, mint ha csak eljárási besorolást ad az ügyintézőnek. A kérdés
eldöntése a ti hatásköretek — a mérnöki felkészülés attól függetlenül indul.

Fontos keret: **az alábbi válasz a ma működő rendszer mért állapotára épül, nem ígéretekre.** Amit
nem tudunk, azt a „Nyitott tételek" szakasz mondja ki.

## A hét kötelezettség

| Cikk | Mit teszünk | Mivel bizonyítjuk auditkor |
|---|---|---|
| **9.** kockázatkezelés | kockázati regiszter a bővítés élesítése **előtt**; a kompenzációs javaslatra felső korlát, fölötte kötelező emberi jóváhagyás | verziózott regiszter felülvizsgálati ciklussal; a felső korlát **kódban rögzített konstans**, nem promptban kért önmérséklet |
| **10.** adat-governance | négy, egymástól elkülönített adatbázis-szerep; a beszélgetés-tár szerepe nem lát ügyfél- és katalógusadatot, a lekérdező szerep nem lát beszélgetést | a szerepeket **migráció** rögzíti, nem kézi beállítás; és egy teszt, amely lefuttatja, hogy a lekérdező szerep `permission denied`-et kap a `messages` táblára |
| **12.** naplózás | minden futás naplózva — **a megszakadt is** —, tokenszinten, a generált SQL-lel együtt | a futásonkénti JSONL-napló, és **három teszt**, amely kikényszeríti, hogy az elhasalt futás is naplósort írjon, mielőtt a hibát továbbdobja |
| **14.** emberi felügyelet | a jogosultság **képesség-kapcsoló**: amit a modell nem kap meg eszközként, azt nem tudja meghívni. A kompenzáció csak **javaslat**, az ügyintéző hagyja jóvá | két teszt, amely szerepenként rögzíti a modell eszközkészletét — a védelem így **ellenőrizhető**, nem szándéknyilatkozat |
| **15.** pontosság, robusztusság | nehézségi létra a valódi felületen (**11 fok, 29 eset**, az egyszerűtől a szándékos félrevezetésig); a tudásbázis külön mérése **hat metrikán** | futásonkénti gépi eredményfájl (`logs/autotest/*.json`), amely **futások között összevethető** — tehát a romlás kimutatható, nem csak érzet |
| **26.** üzembe helyezői kötelezettségek | a használati utasítás szerinti üzemeltetés, naplómegőrzés, az érintettek tájékoztatása | írott eljárásrend és a megőrzési idő rögzítése — **ez ma nincs meg**, lásd alább |
| **27.** alapjogi hatásvizsgálat | a szükségesség vizsgálata és **írásba foglalása** a bővítés előtt | a dokumentált döntés — akkor is, ha az eredmény „nem szükséges"; a hiánya utólag nem pótolható |

**A 14. cikknél érdemes megállni,** mert ez a legerősebb mérnöki állításunk. Az emberi felügyeletet
nem úgy biztosítjuk, hogy a modellnek megtiltjuk valaminek a megtételét — hanem úgy, hogy **a
képességet vesszük el tőle**. Ami nincs benne az eszközkészletében, azt nem tudja meghívni akkor
sem, ha rábeszélik. Egy promptban megfogalmazott tiltás megkerülhető és nem auditálható; egy
hiányzó eszköz nem. Ugyanez az elv adja a 10. cikk válaszát is: a korlátot az adatbázis
jogosultsági rendszere tartja, nem a kód jóindulata.

## Nyitott tételek — amit ma nem tudunk

Egy megfelelési válasz, amelyik csak erősségeket sorol, használhatatlan. Négy dolog hiányzik:

1. **A felület nem tájékoztat az MI-használatról.** Ez nem a bővítéshez kötődik: az AI Act
   50. cikk (1) bekezdése szerinti kötelezettség a **jelenlegi** rendszerre már fennáll, és nem
   teljesítjük. Javítás tervezve; a felirat szövegére külön levélben kértünk jóváhagyást.
2. **A beszélgetéseket listázó végpont hitelesítés nélküli.** Konkrétan a `GET /api/threads` és a
   `GET /api/threads/:id`: ma bárki, aki eléri a szervert, kilistázhatja és elolvashatja az összes
   beszélgetést. A bővítéssel ide **ügyfélpanasz-adat** is kerülne. Ezt **a bővítés blokkoló
   feltételének** tekintjük: amíg nincs hitelesítés és jogosultságkezelés, a kompenzációs modul
   nem élesíthető.
3. **A beszélgetés-tárnak nincs megőrzési ideje.** Nem törlünk — a tároló szerepnek jelenleg
   nincs is törlési joga. Ehhez tőletek kérünk időtartamot.
4. **A 9., 26. és 27. cikk szerinti dokumentumok még nem készültek el.** Nem tervezzük őket a
   fejlesztés után pótolni: a 27. cikk hatásvizsgálata definíció szerint előzetes.

## Határidő és kérésünk

A valódi határidő nem szorít annyira, mint elsőre látszik: az Annex III szerinti magas kockázatú
kötelezettségek — a 2026. júliusi módosítás után — **2027. december 2-től** alkalmazandók, tehát
van felkészülési idő. **De** a fenti lista első pontja ebből kilóg: az 50. cikk szerinti
tájékoztatás az általános alkalmazás alá esik, tehát **már ma esedékes**, és jelenleg lejárt
határidőben vagyunk.

Ezért három dolgot kérünk tőletek:

1. a beszélgetés-tár **megőrzési idejét**;
2. állásfoglalást arról, hogy a bővítéshez a **27. cikk szerinti alapjogi hatásvizsgálat**
   szükséges-e;
3. a kompenzációs javaslat **felső korlátjának** jóváhagyását — ezt konstansként rögzítjük, tehát
   a jóváhagyott érték auditálható lesz.

Köszönettel:
Csontos Péter
