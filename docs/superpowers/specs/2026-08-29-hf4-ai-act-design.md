# HF4 — AI Act-besorolás és megfelelési válasz — design

> Forrás: `~/github/peteroncode/peteroncode-github-vault/Projects/ai-agensfejlesztes/10/HF4-hazifeladat.md`
> (a 9. alkalom házifeladata). **Dokumentum-alapú leadandó, kód nem készül hozzá.**
> Leadás: repo link vagy PDF az LMS-be. Terjedelem: kb. 4-7 oldal.

## Mit rögzít ez a doksi

Mit írunk meg a HF4-ből, milyen **állásponttal**, és minden döntésnél azt is, mit vetettünk el
és miért. A végrehajtási terv ebből készül; az állásfoglalásokat ott már nem kell újra kitalálni.

Egy mondatban: **a saját rendszerünket besoroljuk az AI Act szerint, és a besorolást
bizonyítékokkal — nem ígéretekkel — támasztjuk alá**, mert a projektben ott van négy kör
valódi mérése (napló, szerep-kapcsoló, autotest, RAGAS, négy DB-szerep).

És egy mondatban a lecke címére adott válasz, mert ez a kör tétje: **a felelősség nem attól
függ, mit állítunk a rendszerről, hanem attól, mit tud.** A szoba-kertész azért nem magas
kockázatú, mert nincs benne olyan képesség, ami az Annex III alá vinné — és a
határeset-elemzés pont azt mutatja meg, milyen kicsi lépés hiányzik ehhez.

## Kiindulási állapot — mérve, nem feltételezve

Minden alábbi állítás a repóból vagy megnevezett elsődleges/másodlagos jogforrásból származik,
**2026-08-29-én** ellenőrizve.

### A repó

- A `master` az `5fbd90c` merge-commiton áll (a #11 PR), a munkafa **tiszta**, `origin`-nal
  szinkronban. A munka a `docs/hf4-ai-act` branchen megy, a masterről ágaztatva.
- A `docs/`-ban **semmi HF4-hez tartozó nincs** (mérve: `ls docs/ | grep -i hf4` → üres).
- Az `docs/adr/` három fájlt tart (`0001`, `README`, `_template`) — a HF4 **nem** ADR-t szül,
  hanem leadandó dokumentumot.
- Precedens a formára: a HF3 leadandói (`ARCHITEKTURA.md`, `chunking-strategia.md`,
  `golden-set.md`) + egy végigvezető `hf3-leadas.md`.

### A rendszer, amit besorolunk — a sémából, nem emlékezetből

| Tény | Forrás | Miért számít |
|---|---|---|
| `customers`: `name`, `contactName`, `email`, `city`, `budget`, szabadszöveges `notes` | `packages/db/prisma/schema.prisma` | **személyes adat** — a `customerType` felveheti a `magánszemély` értéket |
| `threads` + `messages`: a teljes `UIMessage.parts` JSON | ugyanott | a beszélgetés tartalma tárolt személyes adat |
| `/api/threads` **hitelesítés nélkül**, nyitott `cors()` mögött | `CLAUDE.md`, „Accepted limitation" | GDPR 32. cikk — a saját doksink kimondja |
| Négy DB-szerep, a `_chat` **append-only** migrációval | `<ts>_messages_append_only` | bizonyíték a 10. cikkhez |
| JSONL-napló, a **megszakadt** futás is | `packages/core/src/lib/logger.ts`, `agent-loop.ts` | bizonyíték a 12. cikkhez |
| `role` mint **képesség-kapcsoló** (a tool be sem kerül a készletbe) | `user-role.ts`, `query-agent.ts` | bizonyíték a 14. cikkhez |
| autotest-létra (11 fok / 29 eset) + RAGAS hat metrika | `tools/autotest/` | bizonyíték a 15. cikkhez |
| A prompt az Anthropichoz, az embedding az OpenAI-hoz megy | `config.ts`, `rag/embed.ts` | GDPR harmadik országbeli továbbítás |

**Mért hiányosság — ez a dokumentum egyik valódi találata:** a web UI fejléce
`<h1>Szobakertész</h1>` (`apps/web/src/App.tsx:193`), az üres állapot szövege „Kérdezz a
növénykatalógusról…" (`:207`). **Sehol nem közli, hogy a felhasználó AI-rendszerrel beszél.**
Grep-pel ellenőrizve: az `apps/web/src` egyetlen `.tsx`-ében sincs erre utaló látható szöveg.

### A jogforrások — 2026-08-29-én ellenőrizve

| Hivatkozás | Amit mond | Ellenőrizve |
|---|---|---|
| AI Act 6. cikk (3) (a)-(d) | derogáció: szűk eljárási feladat / korábbi emberi tevékenység javítása / mintázat-észlelés / **előkészítő feladat** | `artificialintelligenceact.eu/article/6` |
| AI Act 6. cikk (3) utolsó albekezdés | „**mindig** magas kockázatú, ha a rendszer természetes személyek **profilalkotását** végzi" | ugyanott |
| AI Act 25. cikk (1) (a) | aki **saját nevét/védjegyét** teszi rá → szolgáltatóvá válik | `artificialintelligenceact.eu/article/25` |
| AI Act 25. cikk (1) (b), (c) | lényeges módosítás / a rendeltetés megváltoztatása | ugyanott |
| Annex III 5(b) | „természetes személyek **hitelképességének** értékelése vagy hitelpontszám megállapítása" (kivéve csalásfelderítés) | `artificialintelligenceact.eu/annex/3` |
| Annex III 5(a), 5(c), 5(d) | közszolgáltatási jogosultság / élet- és egészségbiztosítási árazás / segélyhívás-rangsorolás | ugyanott |
| AI Act 5. cikk (1) (a), (b) | tudatalatti/manipulatív technikák · **életkorból, fogyatékosságból vagy társadalmi-gazdasági helyzetből** fakadó sebezhetőség kihasználása | `artificialintelligenceact.eu/article/5` |
| AI Act 5. cikk (1) (f) | érzelemfelismerés **tilos** munkahelyen és oktatási intézményben (orvosi/biztonsági célt kivéve) | ugyanott |
| AI Act 3. cikk 39. pont | „érzelemfelismerő rendszer" = **biometrikus adat** alapján következtet érzelmekre | `artificialintelligenceact.eu/article/3` |
| AI Act 3. cikk 34. pont | „biometrikus adat" = fizikai, fiziológiai vagy **viselkedési** jellemzőkből eredő személyes adat | ugyanott |
| AI Act 50. cikk (1) | tájékoztatni kell, hogy AI-jal beszél — **kivéve ha ez nyilvánvaló** egy észszerűen tájékozott személynek | `artificialintelligenceact.eu/article/50` |
| AI Act 50. cikk (5) | „legkésőbb az **első interakció** idején", akadálymentesen | ugyanott |
| AI Act 113. cikk | általános alkalmazás: **2026. augusztus 2.** | `artificialintelligenceact.eu/article/113` |
| **Digital Omnibus (AI)** | HL-ben **2026-07-24**, hatályba **2026-07-27**: az Annex III magas kockázatú kötelezettségek → **2027. december 2.**, az Annex I-esek → 2028. augusztus 2. Az **50. cikk marad** az eredeti menetrenden. | webkeresés, több ügyvédi forrás egybehangzóan |
| **AI felelősségi irányelv** | **VISSZAVONVA** — a HL-ben 2025-10-06-án véglegesítve | webkeresés (IAPP, Bird & Bird, EAPIL) |

**Nyitott ellenőrzési feladat a megírásra:** a Digital Omnibus **pontos HL-hivatkozását**
(rendeletszám + HL-szám) elsődleges forrásból (EUR-Lex) kell kiszedni, mielőtt bekerül a
dokumentumba. Másodlagos forrásokból tudjuk a tartalmat és a dátumot, a hivatalos számot nem.
Ugyanez a szigor vonatkozik minden GDPR-/irányelv-cikkszámra: **egyet sem írunk le emlékezetből.**

## Döntések

| # | Döntés | Amit elvetettünk, és miért |
|---|---|---|
| 1 | **1.A opció**: a szoba-kertész a use case, új use case-t nem találunk ki | 1.B (új fintech/medtech use case) — van HF1 és HF3, és a saját rendszerről **mért** bizonyítékunk van, kitaláltról nem lenne |
| 2 | **Az 5. ponthoz a QueueGenius** (fintech) | VitalBuddy: gazdagabb átfedő-szabályozás, de szegényebb szerepkérdés · ÜgyfélTárs: túl egyértelmű, kevés tere a „több szint melletti érvelésnek" · TenantLens: a magánbérlet nem szerepel tételesen az Annex III-ban, gyengébb hivatkozások |
| 3 | **A 6. pont levele a szoba-kertész tervezett bővítése** | Külön hipotetikus rendszer: tisztább olvasat, de minden intézkedés „így tennénk" maradna · Hibrid: a doksi két rendszer közt ingázna |
| 4 | **Az 5.2 LLM-tesztet a felhasználó futtatja**, más gyártó modelljén, friss chatben | Subagent Claude-on: azonnali és reprodukálható, de (a) a Claude Code rendszer-promptja szennyezi, (b) ha én írom az elemzést ÉS én futtatom a tesztet, triviális egyetértés a valószínű, és nem lenne mit dokumentálni |
| 5 | **Egy fődokumentum + két különálló levélfájl** | Egyetlen fájl: a levelek „elküldhetősége" nem látszana · HF3-minta (index + 3 fájl): 4-7 oldalra túl sok navigáció |
| 6 | **Szoba-kertész = nem magas kockázatú, 50. cikk (1) alá eső** | Magas kockázat: egyik Annex III terület sem áll rá · Tiltott (5. cikk): nincs manipuláció/sebezhetőség-kihasználás — **mindkettőt kifejtjük, nem csak kimondjuk** |
| 7 | **Fő határeset: részletfizetés → Annex III 5(b)** | Érzelemfelismerés: az Annex III 1(c) csak munkahelyre/oktatásra szól, ügyfélre nem — **ezt a csapdát külön kiírjuk**, mert könnyű elrontani |
| 8 | **A 6. pontban elfogadjuk a jogi csapat besorolását**, és mérnöki választ adunk | A besorolás újratárgyalása: a levél kimondja, hogy „a jogszabályi hátteret ismerjük" — egy rövid hatókör-észrevétel belefér, a vita nem |
| 9 | **A saját hiányosságainkat kiírjuk** (nincs 50. cikkes tájékoztatás, `/api/threads` nyitott) | Szépítés: a kiírás kifejezetten az őszinteséget pontozza, és a gyengeség megnevezése tesz hitelessé minden más állítást |
| 10 | **Magyar nyelvű dokumentum**, a cikkhivatkozások eredeti számozással | Angol: a kurzus magyar, a jogi csapat magyar |

## Szerkezet

```
docs/
  hf4-ai-act.md                      ← fődokumentum: 1., 2., 3. és 5. pont
  hf4/
    level-jogi-csapatnak.md          ← 4. pont — max 1 oldal, elküldhető
    valasz-jogi-csapatnak.md         ← 6. pont — 1-2 oldal, kötelezettségenként mérés
```

A fődokumentum a két levélre **hivatkozik**, nem duplikálja őket. A leadás a repo linkje.

## A hat leadandó tartalmi váza

### 1. A kiindulási use case

Nincs külön leírás (1.A opció) — a use case bemutatása a 4. pont emailjében történik, ahogy a
kiírás előírja. A fődokumentum egy bekezdésben rögzíti, hogy melyik házira épül és miért.

### 2. Besorolás, indoklással

Három lépcső, mindegyik **kizárással**, nem kijelentéssel:

1. **Nem tiltott** (5. cikk) — végigvesszük a releváns tilalmakat, és megmondjuk, miért nem áll:
   nincs tudatalatti befolyásolás, nincs sebezhetőség-kihasználás, nincs társadalmi pontozás.
2. **Nem magas kockázatú** — nem Annex I termékbiztonsági komponens, és az Annex III **mind a
   nyolc** területén kívül van. Az 5. területet tételesen bontjuk (5(a)-(d)), mert az áll a
   legközelebb, és mert a határeset onnan jön.
3. **Ami marad: 50. cikk (1)** — közvetlenül természetes személyekkel interakcióba lépő rendszer.
   Kitárgyaljuk a „nyilvánvaló"-kivételt is: egy márkanév-fejléc önmagában nem teszi nyilvánvalóvá.
   Az (5) szerinti időzítés: az első interakcióig. **Alkalmazandó 2026. augusztus 2. óta**, tehát
   a mért hiányosságunk nem jövőbeli feladat, hanem lejárt határidő.
   A megírás során megvizsgáljuk az 50. cikk (2) szintetikus-tartalom-jelölés alkalmazhatóságát is,
   és ha nem áll rá, azt **indokoljuk** — nem hallgatjuk el.

**Szerep:** szolgáltató (3. cikk 3. pont) — saját néven fejlesztjük és helyezzük üzembe.
Egyúttal **downstream szolgáltató**, mert GPAI-modellt integrálunk (Claude; plusz az OpenAI
embedding-modell). Az átcsúszás: ha egy bolt átveszi és saját márkanéven futtatja, a **25. cikk
(1)(a)** szerint ő válik szolgáltatóvá — ugyanaz a fordulat, mint a QueueGeniusnál a banknál.

**Határeset-elemzés** (a kiírás külön kéri, „milyen apró változtatástól ugrana feljebb"):

- **Fő eset — részletfizetés.** Ha bevezetnénk a részletre vásárlást, és a `customers.budget` +
  `notes` alapján értékelnénk a vevő fizetőképességét → **Annex III 5(b)**, azonnal magas
  kockázat. Az élesség itt van: **az adat már most a táblában van**, csak nem erre használjuk.
  A besorolás tehát nem az adaton múlik, hanem a rendeltetésen.
- **Két szinttel feljebb — 5. cikk.** Ha a lakberendező-perszóna célzottan idős vagy magányos
  vevők sebezhetőségére építene rávásárlást.
- **Csapda, amit kiírunk — és ami a definíción múlik.** Ha a chat szövegéből a vevő hangulatára
  következtetnénk, az **nem** „érzelemfelismerő rendszer" az AI Act értelmében: a 3. cikk 39.
  pontja szerint az a fogalom **biometrikus adatból** való következtetést jelent, a 34. pont
  szerint pedig a biometrikus adat fizikai, fiziológiai vagy viselkedési jellemzőkből ered —
  a beírt szöveg tartalma nem az. Tehát sem az **5. cikk (1)(f)** tilalma (ami amúgy is csak
  munkahelyre és oktatási intézményre szól), sem az **Annex III 1(c)** nem áll rá. Ha viszont
  arcképet vagy hangot dolgoznánk fel, azonnal átfordul. **A besorolás itt egyetlen szón múlik**,
  és pont ezért írjuk ki: ez az a fajta hiba, amit könnyű elkövetni.
- **A harmadik eset a 6. ponthoz vezet:** a panasz → kompenzációs javaslat bővítés.

### 3. Átfedő szabályozások

Mindegyik **a mi rendszerünkhöz kötve**, nem általánosságban:

- **GDPR** — a konkrét mezőkhöz kötve (`name`, `email`, `city`, `budget`, `notes`, a teljes
  beszélgetés-tár). Jogalap, adattakarékosság, korlátozott tárolhatóság, tájékoztatás. És a
  **mért hiányosság**: a `/api/threads` hitelesítés nélkül olvassa az összes beszélgetést → a
  biztonsági követelmény sérül. Plusz **harmadik országbeli továbbítás**: a promptok és az
  embedding-szövegek az Anthropichoz és az OpenAI-hoz mennek.
- **Termékfelelősségi irányelv (EU) 2024/2853** — a szoftver mint termék; hibás növénygondozási
  tanács → kár. **És itt mondjuk ki, hogy az AI felelősségi irányelvet visszavonták** — ez az
  őszinteség-pont, és egyben az önálló kutatás bizonyítéka.
- **Általános termékbiztonsági rendelet (EU) 2023/988** — a `pet_safe` / `kid_safe` jelzések:
  téves válasz valódi testi kárhoz vezethet.
- **Fogyasztóvédelem** — a tisztességtelen kereskedelmi gyakorlatokról szóló irányelv: a
  rangsorolás és az ajánlás átláthatósága, rejtett reklám tilalma.
- **ePrivacy** — a webes felület sütijei/tárolása.

**Indoklással NEM érintett:** DORA (nem pénzügyi szervezet), MDR (nem orvosi rendeltetés — de
lásd a határesetet), NIS2 (nem esik az érintett szervezeti körbe). A kiírás kifejezetten kéri,
hogy a nemleges választ is indokoljuk.

### 4. Email a jogi csapatnak — `docs/hf4/level-jogi-csapatnak.md`

Max 1 oldal, valódi levélforma. Tartalma a kiírás szerint kötelezően: ki használja, milyen
adatokat kezel, milyen döntést hoz vagy befolyásol, mi történik, ha téved → majd a **javasolt
besorolás** és indokai → és **konkrét kérdésekkel zárul**, amikre megerősítést kérünk.
A zárás nem lehet „várom a visszajelzést": számozott, eldöntendő kérdések.

### 5. A kapott use case — QueueGenius

**5.1 Saját elemzés.** Érvek több szint mellett:

- **A derogáció mellett:** 6. cikk (3)(a) szűk eljárási feladat és (d) előkészítő feladat — a
  teljességi pontszám nem hitelképesség-értékelés, a döntést végig ember hozza.
- **A magas kockázat mellett:** a sorrend befolyásolja, kinek az ügye ragad be; a „gördülékeny"
  ügyek előresorolása rendszerszinten hátrányba hozhatja a rendezetlenebb dossziéjú — jellemzően
  kiszolgáltatottabb — kérelmezőket.
- **A döntő pont:** a 6. cikk (3) utolsó albekezdése — profilalkotásnál **mindig** magas kockázat.

**Feltételekhez kötött állásfoglalás:** ha a pontszám az **azonosított kérelmezőhöz** tapad és
így rendezi a sort, az profilalkotás → magas kockázat. Ha tisztán dokumentum-szintű, a személytől
elválasztott, és nem mutatható ki rendszeres hátrány, kifér a derogáció alá — de a 6. cikk (4)
szerint az értékelést **dokumentálni kell** a forgalomba hozatal előtt. Megírjuk azt is, **milyen
méréssel dönthető el** a kérdés (a várakozási idő eloszlása védett tulajdonságok mentén).

**Szerepek:** az amerikai SaaS a szolgáltató; a bank az üzembe helyező — **de** mivel saját
márkanéven futtatja, a **25. cikk (1)(a)** szerint szolgáltatóvá is válik. A „mi csak a promptokat
és a szabályokat konfiguráljuk" pedig a (1)(b)-(c) felé mutat: ha ez megváltoztatja a rendeltetést,
az önmagában szolgáltatói státuszt keletkeztet. Kitérünk arra is, hogy EU-n kívüli szolgáltatónál
meghatalmazott képviselő kell.

**5.2 LLM-teszt.** A brief **szó szerinti** szövegével, friss chatben, más gyártó modelljén.
Dokumentáljuk: a modell nevét és verzióját, a **pontos promptot**, a teljes átiratot, és az
eltéréseket a saját elemzésünktől — **elsimítás nélkül**. Ha a modell egyetért velünk, azt is
kiírjuk, és megnézzük, ugyanazon az érvelésen keresztül jutott-e oda.

### 6. Válasz a jogi csapatnak — `docs/hf4/valasz-jogi-csapatnak.md`

1-2 oldal, kétnyelvű a szó azon értelmében, hogy **a jogász megérti, a mérnök backlogot csinál
belőle**. A levél mind a hét megnevezett kötelezettségre válaszol, kötelezettségenként
**intézkedés + mérés/bizonyíték** párral. A mérés az, ami auditkor megmutatható:

| Cikk | Intézkedés (részben már működik) | Bizonyíték |
|---|---|---|
| 9. — kockázatkezelés | kockázati regiszter, a bővítés előtti hatásvizsgálat | verziózott dokumentum, felülvizsgálati ciklus |
| 10. — adat-governance | négy DB-szerep, jogosultság-szétválasztás | a `_chat` **append-only** migráció + két spec, ami méri |
| 12. — naplózás | JSONL + Trace, a **megszakadt** futás is naplózva | `logs/`, és a három spec, ami ezt kikényszeríti |
| 14. — emberi felügyelet | a `role` mint **képesség-kapcsoló**, nem prompt-tiltás; a kompenzáció csak javaslat | a két pinning-spec a toolkészletekre |
| 15. — pontosság, robusztusság | autotest-létra (11 fok / 29 eset), RAGAS hat metrika | `logs/autotest/*.json` — gépi igazságforrás, futásonként |
| 26. — üzembe helyezői kötelezettségek | használati utasítás szerinti üzemeltetés, naplómegőrzés, tájékoztatás | eljárásrend + a napló-megőrzési idő |
| 27. — alapjogi hatásvizsgálat | a szükségesség vizsgálata és rögzítése | dokumentált FRIA-döntés |

A levél kimondja a **valódi határidőt** (Annex III magas kockázat: 2027. december 2., a Digital
Omnibus után), és nevesíti a **jelenlegi hiányosságokat** is — mert egy megfelelési válasz, ami
csak erősségeket sorol, használhatatlan.

## Külső függőség: az LLM-teszt átirata

Az 5.2 az **egyetlen** blokk, ami nem készülhet el önállóan. A végrehajtási terv ezt úgy
ütemezi, hogy a prompt megírása korán megtörténik, a beépítés pedig a végén — így a felhasználóra
váró idő nem blokkolja a másik öt pontot. Ha az átirat nem érkezik meg, a dokumentum
**hiányos, és ezt ki kell mondani** — nem pótoljuk kitalált átirattal.

## Amit szándékosan NEM csinálunk

- **Nem írunk kódot.** Az 50. cikkes hiányosság javítása (tájékoztató szöveg a UI-ban) és a
  `/api/threads` hitelesítése **valódi feladat, de nem ez a kör** — a dokumentumban javaslatként
  és nyitott tételként szerepelnek. Ha a felhasználó kéri, külön körben megcsináljuk.
- **Nem gyártunk PDF-et**, hacsak nem kéri: a leadás repo-linkkel is elfogadott.
- **Nem írunk ADR-t.** Az ADR ismétlődő, köröken átívelő döntéseké; ez egy leadandó.
- **Nem tárgyaljuk újra** a jogi csapat besorolását a 6. pontban.
- **Nem adunk jogi tanácsot** a dokumentum hangnemében: mérnöki állásfoglalást adunk, és a
  4. pont épp azért kér megerősítést, mert a végső szó a jogászé.

## Sikerkritériumok — megfigyelhető viselkedés

Nem az, hogy „a fájl tartalmazza X-et", hanem hogy egy **értékelő mit tud ellenőrizni**:

1. **Minden cikk-/Annex-hivatkozás visszakereshető és stimmel.** Aki megnyitja a hivatkozott
   cikket, azt találja, amit a dokumentum állít róla. Egyetlen hivatkozás sem emlékezetből való.
2. **A besorolás levezetve van, nem kimondva.** Az Annex III mind a nyolc területére van egy
   mondat arról, miért nem áll rá — a legközelebbi (5.) tételesen kibontva.
3. **A dátumok a 2026. júliusi módosítás utáni állapotot tükrözik.** A dokumentumban 2026.
   augusztus 2. **kizárólag** az 50. cikk alkalmazási időpontjaként szerepel; az Annex III
   szerinti magas kockázatú kötelezettségek határidejeként sehol — ott 2027. december 2. áll.
4. **A két levél önmagában elolvasva is működik.** A `level-jogi-csapatnak.md` kontextus nélkül
   is érthető, és számozott kérdésekkel zárul; a `valasz-jogi-csapatnak.md` mind a hét
   kötelezettségre ad intézkedést **és** mérést.
5. **Az LLM-teszt megismételhető.** A prompt, a modell neve és az átirat alapján bárki
   újrafuttathatja, és az eltérések ott állnak elsimítás nélkül.
6. **A QueueGenius-állásfoglalás feltételes.** Kiderül belőle, mely tény ismeretében billenne
   át, és milyen méréssel lehetne eldönteni.
7. **A saját gyengeségeink benne vannak.** Az 50. cikkes tájékoztatás hiánya és a nyitott
   `/api/threads` néven van nevezve, nem eufemizmusban.
8. **A terjedelem 4-7 oldal**, a két levél a saját korlátján belül (1, illetve 1-2 oldal).
