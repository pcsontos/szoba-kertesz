# HF4 — Ellenőrzött hivatkozás-jegyzék

Ez a jegyzék a HF4 összes szövegének **egyetlen hivatkozási forrása**. A `docs/hf4-ai-act.md`,
a `docs/hf4/level-jogi-csapatnak.md` és a `docs/hf4/valasz-jogi-csapatnak.md` kizárólag innen
vesz cikk-, Annex- és rendeletszámot. Ha egy szöveghez olyan hivatkozás kell, ami itt nem
szerepel, **előbb ezt a jegyzéket kell bővíteni** — ellenőrzéssel —, és csak utána szabad
leírni. Így a cikkszámok egy helyen hitelesek, és egy hiba egy helyen javítható.

Az ellenőrzés napja: **2026. augusztus 30.** Minden alábbi sort ezen a napon néztem meg a
megnevezett forrásban; ahol szó szerinti idézet szerepel, azt onnan másoltam, nem emlékezetből
írtam.

## Módszertan — mit jelent az „Ellenőrizve" oszlop

A jegyzék négy forrást használ, és megkülönbözteti őket, mert **nem egyforma a súlyuk**:

| Kód | Forrás | Mit jelent |
|---|---|---|
| `EUR-Lex` | `eur-lex.europa.eu`, ELI-hivatkozással | **Elsődleges forrás**: az Európai Unió Hivatalos Lapjának hiteles közlése. A rendelet- és irányelvszámok, a hivatalos címek és a HL-hivatkozások innen valók |
| `SD` | `ai-act-service-desk.ec.europa.eu` | Az **Európai Bizottság** hivatalos AI Act Service Deskje. Hiteles, de lásd a lenti figyelmeztetést |
| `AIA` | `artificialintelligenceact.eu/article/<n>/` | Az AI Act cikkenkénti, betűhű közlése (Future of Life Institute). **Nem hivatalos kiadó**, de a szöveget változtatás nélkül közli, és cikkenként navigálható — ezért használható munkaeszközként. Ahol a rendelkezés a besorolás szempontjából döntő (6., 49., 50. cikk), ott a `SD`-vel is összevetettem |
| `GDPR-INFO` | `gdpr-info.eu` | A (EU) 2016/679 szövegének betűhű, cikkenkénti közlése. **Nem hivatalos kiadó**; a rendelet azonosítóját és címét az `EUR-Lex` adja |

**Figyelmeztetés, amit ki kell mondani:** a Bizottság saját Service Deskje 2026. augusztus 30-án
több érintett cikknél (6., 50., 113.) kiírja, hogy *„this provision has been amended by the
Digital Omnibus on AI"*, és hogy **az oldalon megjelenített szöveg még nem tükrözi ezeket a
módosításokat**. Ezért az időbeli hatály sorait nem a cikkoldalakról, hanem magából a módosító
rendeletből — (EU) 2026/1744, `EUR-Lex` — ellenőriztem. Ez a jegyzék legkockázatosabb pontja:
aki 2026 augusztusában a cikkoldalak szövegéből dolgozik, **elavult határidőket fog leírni**.

---

## 1. AI Act — (EU) 2024/1689, a (EU) 2026/1744 módosításával

| Hivatkozás | Amit mond | Ellenőrizve |
|---|---|---|
| 3. cikk 3. pont | „szolgáltató": aki MI-rendszert fejleszt vagy fejlesztet, és azt **saját neve vagy védjegye alatt** hozza forgalomba vagy helyezi üzembe | `AIA` |
| 3. cikk 4. pont | „üzembe helyező": aki a saját felügyelete alatt MI-rendszert használ, kivéve a személyes, nem szakmai tevékenységet | `AIA` |
| 3. cikk 34. pont | „biometrikus adat": olyan személyes adat, amely **fizikai, fiziológiai vagy viselkedési** jellemzőkre vonatkozó egyedi technikai feldolgozásból ered (pl. arckép, ujjnyomat) | `AIA` |
| 3. cikk 39. pont | „érzelemfelismerő rendszer": olyan MI-rendszer, amely **biometrikus adat alapján** azonosít vagy következtet érzelmekre, szándékokra | `AIA` |
| 3. cikk 68. pont | „downstream szolgáltató": olyan MI-rendszer szolgáltatója, amely **MI-modellt integrál**, függetlenül attól, hogy a modell saját vagy szerződés alapján másé | `AIA` |
| 4. cikk — MI-jártasság | A **szolgáltatók és az üzembe helyezők** kötelesek intézkedni a személyzetük és a nevükben eljárók MI-jártasságának megfelelő szintjéért. **Kockázati szinttől független kötelezettség** | `AIA` |
| 5. cikk (1) a) | Tilos a **tudatalatti**, illetve célzottan **manipulatív vagy megtévesztő** technikát alkalmazó rendszer, ha jelentősen torzítja a magatartást és jelentős kárt okoz vagy okozhat | `AIA` |
| 5. cikk (1) b) | Tilos az **életkorból, fogyatékosságból vagy sajátos társadalmi-gazdasági helyzetből** fakadó sebezhetőség kihasználása, ha jelentősen torzítja a magatartást és jelentős kárt okoz vagy okozhat | `AIA` |
| 5. cikk (1) f) | Tilos érzelmekre következtetni **munkahelyen és oktatási intézményben** — orvosi vagy biztonsági célú alkalmazás kivételével | `AIA` |
| 6. cikk (1) | Magas kockázatú a rendszer, ha **együtt** teljesül: az Annex I-es uniós harmonizációs jog hatálya alá tartozó termék **biztonsági alkatrésze** (vagy maga a termék), **és** a termék harmadik fél általi megfelelőségértékelést igényel | `SD` |
| 6. cikk (2) | Az (1)-en felül magas kockázatú az **Annex III-ban** felsorolt rendszer | `SD` |
| 6. cikk (3) felütés | A (2)-től eltérően **nem** magas kockázatú az Annex III-as rendszer, ha nem jelent jelentős kockázatot az egészségre, biztonságra vagy alapjogokra — **így akkor sem, ha érdemben nem befolyásolja a döntéshozatal kimenetelét** | `AIA` |
| 6. cikk (3) a) | „szűk eljárási feladat" ellátására szánt rendszer | `AIA` |
| 6. cikk (3) b) | **korábban lezárt emberi tevékenység** eredményének javítására szánt rendszer | `AIA` |
| 6. cikk (3) c) | döntési mintázatok vagy azoktól való eltérések **észlelése**, ami nem hivatott felváltani vagy befolyásolni a korábbi emberi értékelést megfelelő emberi felülvizsgálat nélkül | `AIA` |
| 6. cikk (3) d) | **előkészítő feladat** egy Annex III-as felhasználáshoz kapcsolódó értékeléshez | `AIA` |
| 6. cikk (3) utolsó albekezdés | „az első albekezdéstől eltérően az Annex III-ban említett MI-rendszer **mindig** magas kockázatúnak minősül, ha természetes személyek **profilalkotását** végzi" | `AIA` + `SD` |
| 6. cikk (4) | Aki a (3)-ra hivatkozik, az értékelését **a forgalomba hozatal vagy üzembe helyezés előtt dokumentálni köteles**, a **49. cikk (2)** szerinti regisztráció alá esik, és kérésre be kell mutatnia a dokumentációt. **A derogáció tehát nem mentesség** | `SD` |
| 9. cikk | „Kockázatkezelési rendszer": magas kockázatú rendszerhez kockázatkezelési rendszert kell **létrehozni, bevezetni, dokumentálni és fenntartani** | `AIA` |
| 10. cikk | „Adatok és adatkormányzás": a tanító, validáló és tesztelő adathalmazoknak minőségi kritériumoknak kell megfelelniük | `AIA` |
| 12. cikk | „Nyilvántartás": a magas kockázatú rendszernek technikailag lehetővé kell tennie az események (naplók) **automatikus rögzítését** a rendszer teljes életciklusa alatt | `AIA` |
| 14. cikk | „Emberi felügyelet": a rendszert úgy kell tervezni — megfelelő ember–gép interfészekkel —, hogy természetes személyek a használat ideje alatt **ténylegesen felügyelni tudják** | `AIA` |
| 15. cikk | „Pontosság, robusztusság és kiberbiztonság": a rendszernek megfelelő szintet kell elérnie e háromban, és **következetesen kell teljesítenie** az életciklusa során | `AIA` |
| 22. cikk | „A harmadik országbeli szolgáltatók meghatalmazott képviselői": a **harmadik országban letelepedett** szolgáltató a magas kockázatú rendszer uniós forgalomba hozatala előtt **írásbeli meghatalmazással** uniós képviselőt köteles kijelölni | `AIA` |
| 25. cikk (1) felütés | „Bármely forgalmazó, importőr, üzembe helyező vagy egyéb harmadik fél **a magas kockázatú MI-rendszer szolgáltatójának** minősül…" — **a szabály magas kockázatú rendszerekre szól** | `AIA` |
| 25. cikk (1) a) | …ha a **saját nevét vagy védjegyét** teszi egy már forgalomba hozott vagy üzembe helyezett magas kockázatú rendszerre | `AIA` |
| 25. cikk (1) b) | …ha a forgalomba hozatal után **lényeges módosítást** hajt végre, amit az eredeti megfelelőségértékelés nem irányzott elő | `AIA` |
| 25. cikk (1) c) | …ha úgy **módosítja a rendeltetést** — általános célú MI-rendszerét is —, hogy az érintett rendszer magas kockázatúvá válik | `AIA` |
| 26. cikk | „A magas kockázatú MI-rendszerek üzembe helyezőinek kötelezettségei": megfelelő technikai és szervezési intézkedések, hogy a rendszert a **használati utasítás szerint** használják. **Az üzembe helyezőt köti, nem a szolgáltatót** | `AIA` |
| 27. cikk | „Alapjogi hatásvizsgálat magas kockázatú MI-rendszerekhez": közjogi szervek, közszolgáltatást nyújtó magánszereplők, valamint az **Annex III 5(b) és 5(c)** szerinti rendszerek üzembe helyezői kötelesek elvégezni | `AIA` |
| 49. cikk (2) | „Mielőtt forgalomba hozna vagy üzembe helyezne olyan MI-rendszert, amelyről a szolgáltató a **6. cikk (3)** alapján úgy döntött, hogy nem magas kockázatú, a szolgáltató vagy a meghatalmazott képviselő **magát és a rendszert regisztrálja** a 71. cikk szerinti uniós adatbázisban" | `SD` |
| 50. cikk (1) | A szolgáltatóknak biztosítaniuk kell, hogy a természetes személyekkel **közvetlenül interakcióba lépő** rendszer esetén az érintettek **tájékoztatást kapjanak arról, hogy MI-rendszerrel lépnek interakcióba** — „**kivéve, ha ez nyilvánvaló** egy észszerűen tájékozott, figyelmes és körültekintő természetes személy szempontjából, a körülményekre és a használat kontextusára tekintettel" | `SD` + `AIA` |
| 50. cikk (2) | A szintetikus hang-, kép-, videó- vagy szövegtartalmat generáló rendszer kimenetét **géppel olvasható formátumban jelölni kell** | `AIA` |
| 50. cikk (5) | A tájékoztatást „világos és megkülönböztethető módon, **legkésőbb az első interakció** vagy kitettség idején" kell megadni, és meg kell felelnie az akadálymentességi követelményeknek | `SD` + `AIA` |
| 53. cikk | „Az általános célú MI-modellek szolgáltatóinak kötelezettségei": műszaki dokumentáció, a downstream fejlesztők tájékoztatása, szerzői jogi megfelelés, a tanítóadatokról szóló összefoglaló nyilvánosságra hozatala | `AIA` |
| 55. cikk | „A rendszerszintű kockázatot jelentő általános célú MI-modellek szolgáltatóinak kötelezettségei": modellértékelés, a rendszerszintű kockázat felmérése és mérséklése, súlyos incidensek bejelentése, kiberbiztonsági védelem | `AIA` |
| 71. cikk | „Uniós adatbázis az Annex III-ban felsorolt magas kockázatú MI-rendszerekhez" — a 49. cikk szerinti regisztráció ebbe történik | `AIA` |
| 113. cikk | Hatálybalépés és alkalmazás — a dátumokat lásd a **4. táblázatban** | `SD` + `EUR-Lex` |
| Annex I | „Az uniós harmonizációs jogszabályok jegyzéke" — A. szakasz (új jogszabályi keret, 12 tétel) és B. szakasz (egyéb, 9 tétel); pl. 2006/42/EK gépek, (EU) 2017/745 orvostechnikai eszközök, (EU) 2018/858 gépjárművek, (EU) 2023/1230 gépek | `AIA` |
| Annex III — a nyolc terület | 1. biometrikus azonosítás · 2. kritikus infrastruktúra · 3. oktatás és szakképzés · 4. foglalkoztatás, munkavállalók irányítása, önfoglalkoztatáshoz való hozzáférés · 5. alapvető magán- és közszolgáltatásokhoz és juttatásokhoz való hozzáférés · 6. bűnüldözés · 7. migráció, menekültügy, határigazgatás · 8. igazságszolgáltatás és demokratikus folyamatok | `AIA` |
| Annex III 1(c) | „Érzelemfelismerésre szánt MI-rendszerek" | `AIA` |
| Annex III 4(a) | Természetes személyek **toborzására vagy kiválasztására** szánt rendszerek — különösen célzott álláshirdetés, pályázatok elemzése és szűrése, jelöltek értékelése | `AIA` |
| Annex III 5(a) | **Hatóság által vagy nevében** használt rendszerek, amelyek természetes személyek **alapvető közszolgáltatási juttatásokra és szolgáltatásokra való jogosultságát** értékelik, illetve ilyet nyújtanak, csökkentenek, visszavonnak vagy visszakövetelnek | `AIA` |
| Annex III 5(b) | Természetes személyek **hitelképességének értékelésére vagy hitelpontszámuk megállapítására** szánt rendszerek — **kivéve a pénzügyi csalás felderítését** | `AIA` |
| Annex III 5(c) | **Élet- és egészségbiztosítás** kockázatértékelésére és árazására szánt rendszerek | `AIA` |
| Annex III 5(d) | Segélyhívások értékelése és osztályozása, illetve a sürgősségi kivonulás rangsorolása, ideértve a sürgősségi betegosztályozó rendszereket | `AIA` |

---

## 2. GDPR — (EU) 2016/679

Hivatalos cím: *az Európai Parlament és a Tanács (EU) 2016/679 rendelete (2016. április 27.) a
természetes személyeknek a személyes adatok kezelése tekintetében történő védelméről és az
ilyen adatok szabad áramlásáról, valamint a 95/46/EK irányelv hatályon kívül helyezéséről*.

| Hivatkozás | Amit mond | Ellenőrizve |
|---|---|---|
| 5. cikk (1) c) — **adattakarékosság** | a személyes adat „az adatkezelés céljai szempontjából megfelelő és releváns, és a szükségesre korlátozódik" | `GDPR-INFO` |
| 5. cikk (1) e) — **korlátozott tárolhatóság** | „olyan formában tárolják, amely az érintettek azonosítását csak az adatkezelés céljainak eléréséhez szükséges ideig teszi lehetővé" | `GDPR-INFO` |
| 6. cikk (1) | „Az adatkezelés jogszerűsége" — hat jogalap: a) hozzájárulás · b) szerződés teljesítése · c) jogi kötelezettség · d) létfontosságú érdek · e) közérdekű feladat · f) jogos érdek (kivéve, ha azt az érintett érdekei vagy alapjogai felülírják) | `GDPR-INFO` |
| 9. cikk (1) | „A személyes adatok különleges kategóriáinak kezelése" — **tilos** a faji/etnikai származásra, politikai véleményre, vallási vagy világnézeti meggyőződésre, szakszervezeti tagságra utaló adat, a genetikai adat, az egyedi azonosítás céljából kezelt **biometrikus adat**, az egészségügyi adat, valamint a szexuális életre vagy irányultságra vonatkozó adat kezelése | `GDPR-INFO` |
| 13. cikk | „Rendelkezésre bocsátandó információk, ha a személyes adatokat az érintettől gyűjtik" — az adatkezelő az adatszerzés időpontjában tájékoztat (kilét, elérhetőség, célok, jogalap, címzettek) | `GDPR-INFO` |
| 22. cikk (1) | „Automatizált döntéshozatal egyedi ügyekben, beleértve a profilalkotást" — „Az érintett jogosult arra, hogy ne terjedjen ki rá az olyan, **kizárólag automatizált adatkezelésen** — ideértve a profilalkotást — alapuló döntés hatálya, amely rá nézve joghatással járna vagy őt hasonlóképpen jelentős mértékben érintené." | `GDPR-INFO` |
| 32. cikk (1) | „Az adatkezelés biztonsága" — a kockázathoz igazodó **technikai és szervezési intézkedések**; a b) pont kifejezetten nevesíti a bizalmas jelleg, sértetlenség, rendelkezésre állás és ellenálló képesség folyamatos biztosítását | `GDPR-INFO` |
| V. fejezet (44–50. cikk) | „A személyes adatok harmadik országokba vagy nemzetközi szervezetek részére történő továbbítása" — 44. általános elv · 45. megfelelőségi határozat · 46. megfelelő garanciák · 49. különös helyzetekben biztosított eltérések | `GDPR-INFO` |

---

## 3. Egyéb uniós jog

| Jogszabály | Hivatalos cím és amit mond | Ellenőrizve |
|---|---|---|
| **(EU) 2026/1744** — „Digital Omnibus on AI" | *Az Európai Parlament és a Tanács (EU) 2026/1744 rendelete (2026. július 8.) a (EU) 2024/1689, a (EU) 2018/1139 és a (EU) 2023/1230 rendelet módosításáról a mesterséges intelligenciára vonatkozó harmonizált szabályok végrehajtásának egyszerűsítése tekintetében.* **HL-hivatkozás: OJ L, 2026/1744, 2026. 7. 24.** Hatálybalépés a kihirdetést követő harmadik napon (**2026. július 27.**). Módosítja többek között az AI Act 6. és 113. cikkét, új tilalmakat illeszt az 5. cikkbe (NCII/CSAM), és **kitolja a magas kockázatú kötelezettségek határidejét** | `EUR-Lex` |
| **(EU) 2024/2853** — termékfelelősségi irányelv | *Az Európai Parlament és a Tanács (EU) 2024/2853 irányelve (2024. október 23.) a hibás termékekért való felelősségről és a 85/374/EGK tanácsi irányelv hatályon kívül helyezéséről.* A „termék" fogalma **kifejezetten kiterjed a szoftverre**; a preambulum szerint az MI-rendszerek szolgáltatói is gyártói minőségben járnak el, és a szoftver felelősségi szempontból attól függetlenül termék, hogy eszközön tárolják, hálózaton érik el vagy SaaS-ként nyújtják | `EUR-Lex` |
| **COM(2022) 496 visszavonása** — MI-felelősségi irányelv | A Bizottság **visszavonta** a *„Javaslat: az Európai Parlament és a Tanács irányelve a szerződésen kívüli polgári jogi felelősségre vonatkozó szabályoknak a mesterséges intelligenciához való hozzáigazításáról (MI-felelősség)"* javaslatot; eljárásszám 2022/0303 (COD). A visszavonási közlemény: **C/2025/5423**, kihirdetve **2025. október 6-án**. Következmény: az MI-specifikus bizonyítási könnyítések **nem jöttek létre** | `EUR-Lex` |
| **(EU) 2023/988** — általános termékbiztonsági rendelet (GPSR) | *Az Európai Parlament és a Tanács (EU) 2023/988 rendelete (2023. május 10.) az általános termékbiztonságról, az (EU) 1025/2012 rendelet és az (EU) 2020/1828 irányelv módosításáról, valamint a 2001/95/EK irányelv és a 87/357/EGK tanácsi irányelv hatályon kívül helyezéséről.* A gazdasági szereplők **csak biztonságos terméket hozhatnak forgalomba**; a biztonságot elsődlegesen a termék kialakítása adja, amit figyelmeztetések és használati utasítások egészítenek ki | `EUR-Lex` |
| **2005/29/EK** — tisztességtelen kereskedelmi gyakorlatok irányelve (UCPD) | *Az Európai Parlament és a Tanács 2005/29/EK irányelve (2005. május 11.) a belső piacon az üzleti vállalkozások fogyasztókkal szemben folytatott tisztességtelen kereskedelmi gyakorlatairól.* 5. cikk: általános tilalom (szakmai gondosság megsértése + a gazdasági magatartás lényeges torzítása) · 6. cikk: **megtévesztő tevékenység** · 7. cikk: **megtévesztő mulasztás** (lényeges információ elhallgatása) | `EUR-Lex` |
| **2002/58/EK** — ePrivacy irányelv | *Az Európai Parlament és a Tanács 2002/58/EK irányelve (2002. július 12.) az elektronikus hírközlési ágazatban a személyes adatok kezeléséről, feldolgozásáról és a magánélet védelméről.* 5. cikk (3): az előfizető vagy felhasználó **végberendezésén történő tárolás vagy az ott tárolt adathoz való hozzáférés** világos és teljes körű tájékoztatáshoz kötött, visszautasítási joggal; kivétel a közlés továbbításához, illetve a kifejezetten kért szolgáltatás nyújtásához **feltétlenül szükséges** tárolás/hozzáférés | `EUR-Lex` |
| **(EU) 2022/2554** — DORA | *Az Európai Parlament és a Tanács (EU) 2022/2554 rendelete (2022. december 14.) a pénzügyi ágazat digitális működési rezilienciájáról…* (HL L 333, 2022. 12. 27.). Hatálya **pénzügyi szervezetekre** terjed ki (hitelintézetek, pénzforgalmi szolgáltatók, befektetési vállalkozások, biztosítók, kereskedési helyszínek stb.), valamint az őket kiszolgáló IKT-szolgáltatókra | `EUR-Lex` |
| **(EU) 2017/745** — orvostechnikai eszközökről szóló rendelet (MDR) | *Az Európai Parlament és a Tanács (EU) 2017/745 rendelete (2017. április 5.) az orvostechnikai eszközökről…* A 2. cikk (1) definíciója a **szoftvert kifejezetten nevesíti**, de csak akkor eszköz, ha a gyártó **orvosi rendeltetéssel** szánja (diagnózis, megelőzés, megfigyelés, kezelés) | `EUR-Lex` |
| **(EU) 2022/2555** — NIS2 irányelv | *Az Európai Parlament és a Tanács (EU) 2022/2555 irányelve (2022. december 14.) az Unió egész területén a kiberbiztonság egységesen magas szintjét biztosító intézkedésekről…* (HL L 333, 2022. 12. 27.). Hatálya **méret- és ágazati küszöbhöz** kötött: a felsorolt ágazatokban működő, legalább középvállalkozás méretű szervezetek („alapvető" és „fontos" szervezetek); kisebbeket a tagállam külön kijelölhet | `EUR-Lex` |

---

## 4. Időbeli hatály — az AI Act alkalmazási dátumai

Ez a jegyzék legkényesebb táblázata, ezért áll külön. A **2026. augusztus 2.** és a **2027.
december 2.** összekeverése a leggyakoribb hiba a 2026-os szakirodalomban: az előbbi az
általános alkalmazás (és vele az 50. cikk), az utóbbi az Annex III szerinti magas kockázatú
kötelezettségeké **a (EU) 2026/1744 módosítása után**.

| Mikortól | Mire | Ellenőrizve |
|---|---|---|
| 2024. augusztus 1. | Az AI Act hatálybalépése (a kihirdetést követő 20. nap) | `SD` |
| 2025. február 2. | **I. és II. fejezet** — általános rendelkezések, a **4. cikk** szerinti MI-jártasság és az **5. cikk** szerinti tilalmak | `SD` |
| 2025. augusztus 2. | III. fejezet 4. szakasz, **V. fejezet (GPAI-modellek)**, VII. és XII. fejezet, 78. cikk (a 101. cikk kivételével) | `SD` |
| **2026. augusztus 2.** | **Általános alkalmazás — „It shall apply from 2 August 2026" —, ideértve az 50. cikk átláthatósági kötelezettségeit.** A (EU) 2026/1744 ezt a dátumot **nem** tolta ki | `SD` + `EUR-Lex` |
| 2026. december 2. | Az **50. cikk (2)** szerinti gépi olvashatóságú jelölés azoknál a rendszereknél, amelyeket **2026. augusztus 2. előtt** hoztak forgalomba — a (EU) 2026/1744 (38) preambulumbekezdése szerinti **négyhónapos átmeneti időszak** | `EUR-Lex` |
| 2027. augusztus 2. | **6. cikk (1)** és a hozzá kapcsolódó kötelezettségek | `SD` |
| **2027. december 2.** | **III. fejezet 1–3. szakasz a 6. cikk (2) / Annex III szerinti magas kockázatú rendszerekre** — a (EU) 2026/1744 által beillesztett határidő (korábban 2026. augusztus 2.) | `EUR-Lex` |
| 2028. augusztus 2. | III. fejezet 1–3. szakasz a **6. cikk (1) / Annex I** szerinti (termékbe ágyazott) magas kockázatú rendszerekre — szintén a (EU) 2026/1744 által beillesztve | `EUR-Lex` |

### Egy sor, aminek a forrása gyengébb — kimondva

| Mikortól | Mire | Ellenőrizve |
|---|---|---|
| 2026. december 2. | A (EU) 2026/1744 által az **5. cikkbe** illesztett új tilalmak — 5. cikk (1) ba) és bb) pont, valamint (1a) és (1b) bekezdés (NCII/CSAM) | `AIA` (a 113. cikk módosított szövegét megjelenítő oldal). **Az `EUR-Lex`-ből kinyert szövegrészlet ezt a dátumot nem igazolta vissza** |

**Ezért erre a sorra a HF4 egyetlen szövege sem hivatkozhat.** A szoba-kertész és a QueueGenius
elemzése szempontjából amúgy sem releváns: egyik rendszer sem generál intim vagy gyermekekről
készült szexuális tartalmat. A sor azért marad benne, hogy az időbeli hatály képe teljes legyen,
és hogy a forrás gyengesége látható maradjon — ne pedig azért, hogy fel lehessen használni.

---

## 5. Nyitott tételek

1. **A Digital Omnibus hivatalos száma megvan.** A terv Task 1 / Step 1 tartalék-mondatára
   („a hivatalos HL-szám elsődleges forrásból nem volt kiszedhető") **nincs szükség**: a
   rendelet **(EU) 2026/1744**, HL-hivatkozása **OJ L, 2026/1744, 2026. 7. 24.**, elsődleges
   forrásból, ELI-alapon ellenőrizve.
2. **A cikkoldalak szövege több helyen elavult.** A 6., 50. és 113. cikknél a Bizottság Service
   Deskje maga jelzi, hogy a megjelenített szöveg még nem tükrözi a Digital Omnibus
   módosításait. Ahol ez a besorolást érinti, a módosító rendeletből ellenőriztem — de aki ezt a
   jegyzéket később bővíti, **számítson rá, hogy a cikkoldal és a hatályos szöveg eltérhet**.
3. **A 49. cikk (2) hatályban van, egyszerűsítve.** A (EU) 2026/1744 (22) preambulumbekezdése
   szerint az Annex VIII tartalmának egyszerűsítésével a 6. cikk (3)-as rendszerek regisztrációja
   arányosabbá válik, de **a kötelezettség maga megmarad**. A „derogáció = mentesség" tévedés
   tehát a módosítás után is tévedés.
4. **Két forrás nem hivatalos kiadó** (`AIA`, `GDPR-INFO`). A szövegüket betűhűnek találtam ott,
   ahol a Bizottság Service Deskjével összevetettem (6., 50. cikk), de aki jogi tanácsadásra
   használná ezt a jegyzéket, a hiteles szöveget az `EUR-Lex`-en ellenőrizze.

---

## A. melléklet — az Annex III nyolc területének tételes kizárása

Ez a melléklet **nem hivatkozás-jegyzék**, hanem a `docs/hf4-ai-act.md` 2.2 pontjának levezetése:
a jobb oldali oszlop **érvelés**, nem forrás. A hivatkozott Annex III-pontok forrása a fenti
1. táblázatban van. Azért itt áll és nem a fődokumentumban, mert a fődokumentum terjedelmi
korlátja kötött, a levezetés teljességét viszont nem akartam feláldozni érte.

A vizsgált rendszer: a szoba-kertész MI-asszisztens a **ma működő** állapotában.

| Annex III terület | Miért nem áll rá a szoba-kertész |
|---|---|
| 1. Biometrikus azonosítás | nem dolgoz fel biometrikus adatot; a bemenet a felhasználó által beírt szöveg. A határeset (érzelemfelismerés) a fődokumentum 2.5/3. pontjában |
| 2. Kritikus infrastruktúra | nem irányít és nem felügyel közlekedést, vízellátást, energiaellátást vagy digitális infrastruktúrát |
| 3. Oktatás és szakképzés | nem dönt felvételről, nem oszt be képzésre, nem értékel tanulmányi eredményt és nem felügyel vizsgát |
| 4. Foglalkoztatás, munkavállalók irányítása | nem toboroz és nem szűr pályázatot (**Annex III 4(a)**); a bolt munkatársai eszközként használják, de a rendszer nem hoz és nem készít elő róluk munkaviszonyt érintő döntést |
| 5. Alapvető magán- és közszolgáltatások | a négy alpont tételesen a fődokumentum 2.2 pontjában — ez a legközelebbi terület, ezért ott marad |
| 6. Bűnüldözés | nincs bűnüldözési rendeltetés; nem értékel bizonyítékot, nem profiloz gyanúsítottat |
| 7. Migráció, menekültügy, határigazgatás | nincs ilyen rendeltetés; nem vizsgál kérelmet és nem értékel kockázatot személyekre |
| 8. Igazságszolgáltatás és demokratikus folyamatok | nem segít jogértelmezésben vagy tényállás megállapításában, és nem befolyásol választási magatartást |
