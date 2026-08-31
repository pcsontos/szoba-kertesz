# HF4 — A Szoba-kertész AI-asszisztens AI Act-besorolása

> A vizsgált rendszer a **saját, működő** projektem (`szoba-kertesz`), nem kitalált use case.
> Minden cikk-, Annex- és rendeletszám a `docs/hf4/hivatkozasok.md` ellenőrzött jegyzékéből
> származik, egyetlen hivatkozás sem emlékezetből. A jogi állapot a **(EU) 2026/1744** („Digital
> Omnibus on AI", hatály: 2026. július 27.) **utáni**. A 4. és a 6. pont levele külön fájlban él,
> hogy önmagában is elküldhető legyen.

## 1. A kiindulási use case

Az 1.**A** opciót választottam: van futó rendszerem, ezért nem találok ki újat. A szoba-kertész
lakberendező-perszónájú MI-asszisztens: magyar kérdésekből csak olvasó SQL-t generál egy
növénykatalógus fölé, és egy 202 cikkes gondozási tudásbázisból válaszol (RAG). A vásárló a
böngészőben chatel vele, a bolt munkatársai ugyanezt és egy CLI-t használják; a katalógus írása
külön, korlátozott jogosultságú ágensen fut. **A besorolás a ma működő állapotra vonatkozik, nem
tervekre** — ahol egy bővítés megváltoztatná, azt a 2.5 tárgyalja. A laikusnak szóló bemutatás a
jogi csapatnak írt levélben van, ahogy a feladat előírja.

## 2. Besorolás az AI Act szerint

A besorolást **kizárással** vezetem le, mert az AI Act is így épül fel: előbb a tilalmak, aztán a
magas kockázat két útvonala, és ami marad, az az átláthatósági réteg.

### 2.1 Nem tiltott gyakorlat

Az **5. cikk (1) a)** a tudatalatti, illetve célzottan manipulatív vagy megtévesztő technikát
tiltja. A rendszer meggyőző hangnemben ajánl, de nem a tudatosság alatt hat: a válasz és a mögötte
futó SQL is naplózva van.

Az **5. cikk (1) b)** az életkorból, fogyatékosságból vagy sajátos társadalmi-gazdasági helyzetből
fakadó sebezhetőség kihasználását tiltja. Itt kell őszintének lenni: a perszóna **meggyőzésre van
hangolva**. A tilalom viszont nem a meggyőzésre szól, hanem arra, hogy a rendszer a felsorolt
**védett tulajdonságokra** építsen — az ajánlás bemenete ma a fényviszony, a keret, a gondozási
igény és a gyerek-/állatbiztonsági szűrő, nem az életkor vagy a vagyoni helyzet. Ez termékdöntés,
nem elvi korlát (2.5/2).

Az **5. cikk (1) f)** (érzelemfelismerés munkahelyen és oktatásban) fogalmilag nem áll ránk; az
indoklás a 2.5/3-nál van, mert ott a *definíción* múlik.

### 2.2 Nem magas kockázatú

**Első útvonal — 6. cikk (1), Annex I.** A rendszer nem biztonsági alkatrésze egyetlen Annex I-es
uniós harmonizációs jog alá tartozó terméknek sem (gépek, orvostechnikai eszközök, járművek), és
maga sem ilyen termék. A két feltétel konjunktív, már az első sem áll; harmadik fél általi
megfelelőségértékelés fel sem merül.

**Második útvonal — 6. cikk (2), Annex III.** Végigvettem **mind a nyolc területet**, és egyik sem
áll ránk: nem dolgozunk fel biometrikus adatot, nem irányítunk kritikus infrastruktúrát, nem
döntünk oktatásról, nem toborzunk és nem szűrünk pályázatot (**Annex III 4(a)**), és nincs
bűnüldözési, migrációs vagy igazságszolgáltatási rendeltetésünk. A területenkénti indoklás a
jegyzék **A. mellékletében** van.

Az **5. terület** tételesen, mert ez a legközelebbi: **5(a)** hatósági jogosultság-értékelés
közszolgáltatási juttatásokra — nem vagyunk hatóság, és nem juttatásról döntünk. **5(b)**
hitelképesség vagy hitelpontszám — ma nem értékelünk fizetőképességet: a `customers.budget` a
*vásárló által megadott keret*, szűrési szempont, nem a fizetési képességre vont következtetés
(**de lásd 2.5/1, a legélesebb határesetet**). **5(c)** élet- és egészségbiztosítás árazása —
nincs ilyen tevékenység. **5(d)** segélyhívás-osztályozás — nincs.

Mivel a rendszer **egyik Annex III-as ponthoz sem tartozik**, a **6. cikk (3)** derogációjára nem
kell hivatkoznunk — és ez több stílusnál. A derogáció ugyanis **nem mentesség**: aki rá hivatkozik,
annak a **6. cikk (4)** szerint a forgalomba hozatal előtt dokumentálnia kell az értékelését, és a
**49. cikk (2)** szerint regisztrálnia kell magát és a rendszert a **71. cikk** szerinti uniós
adatbázisban. A „kívül esik a listán" kontra „a listán van, de derogált" különbség pontosan az,
amit az 5. pontban vizsgált LLM elrontott.

### 2.3 Ami marad: az 50. cikk

Az **50. cikk (1)** ránk áll: a rendszer közvetlenül természetes személyekkel lép interakcióba,
ezért tájékoztatni kell a felhasználót, hogy MI-rendszerrel beszél. A rendelkezés kivételt enged,
ha ez **„nyilvánvaló egy észszerűen tájékozott, figyelmes és körültekintő természetes személy
szempontjából"** — erre a kivételre **nem hivatkozom**. Egy márkanév-fejléc és egy chatbuborék nem
teszi nyilvánvalóvá, hogy a válaszokat modell generálja: a felhasználó ugyanezt a felületet
láthatná emberi ügyintézővel is. A kivétel arra való, ha a kontextus önmagában árulkodik — nem
arra, hogy a szolgáltató a saját UI-jának hiányát mentse.

**A mért hiányosság, néven nevezve.** Az `apps/web/src/App.tsx:193` fejléce mindössze
`Szobakertész`, a `:207` üres állapota „Kérdezz a növénykatalógusról…". Végigkerestem az
`apps/web/src` megjelenített szövegeit: **egyetlen MI-re utaló felirat sincs** — a két találat egy
`import` sor és egy kódkomment, egyik sem jelenik meg a képernyőn. Az **50. cikk (5)** szerint a
tájékoztatásnak világosan, **legkésőbb az első interakció idején** meg kell történnie; nálunk soha
nem történik meg. A **113. cikk** szerint az általános alkalmazás — és vele az 50. cikk —
**2026. augusztus 2-án** megkezdődött, amit a Digital Omnibus kifejezetten **nem** tolt ki. Ez
tehát nem jövőbeli feladat, hanem **lejárt határidő**. A javítás olcsó: állandó, az első interakció
előtt látható felirat a fejlécben („Ez egy MI-asszisztens — a válaszokat nyelvi modell generálja").

**Az 50. cikk (2)-t sem hallgatom el.** A rendszer szintetikus **szöveget** generál, tehát az
ellenőrzött szöveg alapján a gépi olvashatóságú jelölés hatálya alá esik; ma semmilyen jelölést
nem teszünk a kimenetre. Azt, hogy ez egy chat-válasznál a gyakorlatban mit követel, hivatkozással
nem tudom megválaszolni, ezért **nyitott tételként** viszem tovább, nem döntöm el magamtól.

### 2.4 A szerepünk a láncban

**Szolgáltató vagyunk** (**3. cikk 3. pont**): mi fejlesztjük és saját néven helyezzük üzembe.
Egyúttal **downstream szolgáltató** (**3. cikk 68. pont**), mert általános célú MI-modelleket
integrálunk (válasz: `claude-sonnet-4-6`; HyDE és rerank: `claude-haiku-4-5`; vektorizálás: OpenAI
`text-embedding-3-small`). Az upstream modellszolgáltatókat az **53. cikk**, rendszerszintű
kockázat esetén az **55. cikk** terheli — minket a *rendszer* szolgáltatójáéi. A kettő nem
cserélhető: a modell képességeiért nem mi felelünk, a rendszerbe épített rendeltetésért igen.

**Az átcsúszás mindkét irányban.** Ha egy bolt átveszi és pusztán használja, ő az **üzembe
helyező** (**3. cikk 4. pont**), mi maradunk a szolgáltató. Ha **saját márkanév alatt** futtatja, a
**25. cikk (1) a)** szerint ő is szolgáltatóvá válna — **de a 25. cikk (1) felütése kifejezetten
magas kockázatú rendszerekről szól**, tehát a mi jelenlegi rendszerünknél ez a szabály **nem
aktiválódik**. Akkor élesedik, ha a 2.5 határesetei bekövetkeznek. A QueueGeniusnál viszont igenis
él (5. pont), és ez a különbség köti össze a két elemzést.

### 2.5 Határeset-elemzés

**1. Fő eset: részletfizetés → Annex III 5(b).** Ha bevezetnénk a részletre vásárlást, és a
`customers.budget` meg a szabadszöveges `customers.notes` alapján értékelnénk a vevő
fizetőképességét, a rendszer azonnal **magas kockázatúvá** válna — az Annex III 5(b) pontosan a
hitelképesség értékelését nevezi meg. **Az élessége itt van: az adat már ma a táblában van, csak
nem erre használjuk.** A besorolás nem az adaton múlik, hanem a **rendeltetésen**, azt pedig
egyetlen termékdöntés megváltoztathatja — akár kódírás nélkül, pusztán a prompt átírásával.
Ilyenkor lépne be a **9., 10., 12., 14., 15. cikk** teljes követelménysora és a 25. cikk (1)
átcsúszása.

**2. Két szinttel feljebb: 5. cikk (1) b).** Ha a perszóna célzottan idős, magányos vagy nehéz
anyagi helyzetű vásárlók sebezhetőségére építene rávásárlást, az nem magas kockázatú, hanem
**tiltott** gyakorlat. A távolság kisebb, mint kényelmes volna: a `notes` ma is tartalmazhat ilyen
kontextust, és a modell látja.

**3. A definíción múló csapda: érzelemfelismerés.** Ha a chat szövegéből a vevő hangulatára
következtetnénk, az **nem** „érzelemfelismerő rendszer": a **3. cikk 39. pontja** kifejezetten
**biometrikus adatot** követel, a **34. pont** szerint pedig a biometrikus adat fizikai,
fiziológiai vagy viselkedési jellemzők egyedi technikai feldolgozásából ered — a beírt szöveg
tartalma nem az. Így sem az **5. cikk (1) f)** (ami amúgy is csak munkahelyre és oktatásra szól),
sem az **Annex III 1(c)** nem áll rá. **Arckép vagy hang feldolgozásánál viszont azonnal
átfordul.** A besorolás itt egyetlen szón múlik — ezért nem elég egy „érzelmeket elemez" szintű
leírás egy megfelelési döntéshez.

**4. Panasz → kompenzációs javaslat.** A tervezett bővítés, amelyről a jogi csapat levele szól, és
amelyre a 6. pont válaszol.

## 3. Átfedő szabályozások

**GDPR — (EU) 2016/679.** Két helyen kezelünk személyes adatot: a `customers` táblában név,
kapcsolattartó, email, város, keret és **szabadszöveges `notes`** — a `customerType` felveheti a
`magánszemély` értéket, és a seedben **öt ilyen ügyfél van** —, a `threads`/`messages` táblákban
pedig a **teljes beszélgetés-tartalom**. A **GDPR 6. cikk (1)** szerinti jogalapot ma nem
rögzítettük írásban. A **GDPR 5. cikk (1) c)** adattakarékossága a `notes`-nál a legélesebb:
bármit tartalmazhat, amit a felhasználó beír — akár egészségre utalót, ami már a **GDPR 9. cikk**
hatálya. A **GDPR 5. cikk (1) e)** ma nem teljesül: **a beszélgetéseknek nincs megőrzési ideje** —
mérve, a `threads` modulban nincs törlés, és a `szoba-kertesz_chat` szerepnek **nincs is DELETE
joga**, tehát ez hiányzó képesség, nem elmaradt funkció. A **GDPR 13. cikk** tájékoztatása
ugyanúgy hiányzik, mint a 2.3-ban.

**A mért hiányosság, néven nevezve (GDPR 32. cikk).** A `GET /api/threads` és a
`/api/threads/:id` **hitelesítés nélkül** adja vissza az **összes** beszélgetést, a bennük tárolt
`runSql`-kimenetekkel együtt. Mérve: az `apps/server/src/app.ts:142` origin-korlátozás nélküli
`cors()`-t hív, a `:154` köti be az útvonalakat, és a `threads.ts`-ben egyetlen hitelesítésre utaló
sor sincs. Az UUID a felderítést nehezíti, a hozzáférést nem. A DB-szintű szétválasztás valódi — a
`_ro` szerep REVOKE-olva van a `threads` és `messages` tábláról —, de **ezt a felületet nem védi**:
a támadó nem SQL-en jön be, hanem a bejáraton.

**Harmadik országbeli továbbítás (GDPR V. fejezet).** A promptok az Anthropichoz, az embeddelendő
szövegek az OpenAI-hoz mennek — mindkettő egyesült államokbeli szolgáltató. Ez adattovábbítás,
aminek jogalapot és garanciákat kell rendelni.

**Termékfelelősség — (EU) 2024/2853.** Az irányelv a **szoftvert kifejezetten terméknek** minősíti,
és az MI-szolgáltatót gyártói minőségben kezeli: nálunk egy téves gondozási tanács elpusztult
növényt, mérgező fajnál testi kárt okozhat. **És itt kell kimondani, hogy az MI-felelősségi
irányelvet visszavonták** — a COM(2022) 496 javaslatot a C/2025/5423 közlemény vonta vissza,
HL 2025. október 6. —, tehát az MI-specifikus bizonyítási könnyítések **nem jöttek létre**: a
felelősség az általános termékfelelősségi és polgári jogi kereteken belül marad. Aki elavult
forrásból dolgozik, itt fog elbukni.

| További szabályozás | Miért érint minket konkrétan |
|---|---|
| **Általános termékbiztonság — (EU) 2023/988** | a `products.pet_safe` és `kid_safe` mező: egy téves jelzés gyerekre vagy háziállatra nézve valódi veszély |
| **Tisztességtelen kereskedelmi gyakorlatok — 2005/29/EK** | az ajánlás sorrendje és az árazás (a prompt `COALESCE(sale_price, price)` szabálya) nem lehet megtévesztő (az irányelv 6–7. cikke), és fizetett kiemelés nem adható el semleges tanácsként |
| **ePrivacy — 2002/58/EK** | az irányelv 5. cikk (3) bekezdése a webes felület böngészőbeli tárolására áll |

**Amit indoklással kizárok:** a **DORA (EU) 2022/2554**, az **MDR (EU) 2017/745** és a **NIS2
(EU) 2022/2555**. A tételes indoklás — és az MDR egy határesete, amely visszamutat a 2.5-re — a
jegyzék **B. mellékletében** van.

## 4. Email a jogi csapatnak

## 5. A kapott use case: QueueGenius

### 5.1 Saját elemzés

### 5.2 LLM-teszt és összevetés

## 6. Válasz a jogi csapatnak
