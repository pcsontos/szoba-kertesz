# 5.2 — LLM-teszt: nyers átirat

> Ez a fájl a **nyers bizonyíték**: a használt modell, a szó szerinti prompt és a kapott
> válasz, változtatás nélkül. Az összevetés és az eltérések elemzése a fődokumentumban
> (`docs/hf4-ai-act.md`, 5.2) áll — ide nem kerül értékelés.

## Metaadatok

| | |
|---|---|
| **Modell** | Gemini 3.7 Flash *(a futtató által megadott megnevezés; a verziót nem tudtuk függetlenül ellenőrizni)* |
| **Futtatta** | a projekt szerzője, friss beszélgetésben, a webes felületen |
| **Dátum** | 2026-08-30 |
| **Fordulók száma** | 1 (egyetlen kérdés, egyetlen válasz, visszakérdezés nélkül) |
| **Rendszer-prompt** | nincs (a szolgáltató alapértelmezett beállítása) |

**Miért más gyártó modellje?** Mert a saját elemzést Claude írta. Ha ugyanaz a modellcsalád
adná az elemzést és a kontrollt is, a triviális egyetértés lenne a valószínű kimenet, és a
teszt nem mérne semmit. A kiírás az **eltérések** dokumentálását pontozza.

## A prompt — szó szerint

```
Az alábbi rendszerleírás egy termékmenedzseri brief. Sorold be az EU AI Act
(az (EU) 2024/1689 rendelet) szerint: melyik kockázati szintre esik, és miért?
Hivatkozz konkrét cikkre vagy Annex III pontra. Térj ki arra is, hogy ki
minősül szolgáltatónak és ki üzembe helyezőnek.

Fintech — „QueueGenius": Az agent nem hoz hiteldöntést, hozzá sem ér a
scoringhoz. Csak beolvassa a beérkező hitelkérelmek dokumentumait, teljességi
pontszámot ad (megvan-e minden irat), és ez alapján okosan sorba rendezi az
ügyintézők munkalistáját, hogy a „gördülékeny" ügyek ne ragadjanak be. Az
ügyintéző minden döntést maga hoz. A rendszer egy amerikai SaaS-ra épül, mi
csak a promptokat és a szabályokat konfiguráljuk, és a bank saját belső
márkaneve alatt fut.
```

A brief szövege a HF4-kiírás 5. pontjának fintech use case-e, szó szerint. A kérdés
szándékosan **nem sugalmazó**: nem említi sem a 6. cikk (3) derogációját, sem a
profilalkotási albekezdést, sem a 25. cikket.

## A válasz — vágatlanul

### 1. Kockázati besorolás az EU AI Act szerint

**Besorolás:** **Nem magas kockázatú (minimális / korlátozott kockázat)**

#### Részletes jogi indoklás:

* **Mi minősülne magas kockázatnak?**
Az AI Act **III. melléklet (Annex III) 5. pontjának (a) alpontja** szerint magas kockázatúnak minősülnek azok a mesterségesintelligencia-rendszerek, amelyeket *„természetes személyek hitelképességének értékelésére (credit scoring) vagy hitelpontszámuk megállapítására”* használnak.
* **Miért nem esik bele a QueueGenius?**
A leírás alapján a rendszer:
* nem hoz hiteldöntést,
* nem vesz részt a hitelképesség vagy a törlesztési kockázat értékelésében (*creditworthiness assessment*),
* kizárólag adminisztratív/eljárási feladatot lát el: dokumentum-teljességet ellenőriz, és a feldolgozási sorrendet (priorizálást) optimalizálja.


* **Az 6. cikk (3) bekezdés szerinti kivétel (ha határesetként merülne fel):**
Még ha valaki úgy érvelne is, hogy a rendszer közvetve érinti a hitelbírálati folyamatot, az **6. cikk (3) bekezdése** kifejezetten kimondja, hogy egy Annex III hatálya alá tartozó rendszer **nem minősül magas kockázatúnak**, ha nem jelent jelentős kockázatot az egészségre, biztonságra vagy alapvető jogokra, és az alábbi feltételek valamelyike teljesül:
* kizárólag szűk, eljárási feladatot lát el (*6. cikk (3) a)*,
* csupán egy korábban lefolytatott emberi tevékenység eredményét készíti elő/javítja, vagy
* pusztán előkészítő feladatot végez egy emberi döntéshez (*6. cikk (3) c)*.



---

### 2. Szerepkörök meghatározása (Ki a Szolgáltató és ki az Üzembe helyező?)

A leírás alapján két entitás van: a háttérben működő amerikai SaaS szolgáltató és a bank/fejlesztő csapat („mi”).

| Szerepkör | Entitás | Jogi alap |
| --- | --- | --- |
| **Szolgáltató (*Provider*)** | **A Bank / „Mi”** *(átminősülve)* | Az **50. cikk (1) bekezdése** (illetve a **25. cikk (1) bekezdésének a) pontja**) alapján, ha egy entitás a saját neve vagy védjegye alatt hoz forgalomba / vezet be egy MI-rendszert, **átveszi a szolgáltatói státuszt**. Mivel a bank saját belső márkaneve alatt futtatja a megoldást és maga definiálja a promptokat/üzleti logikát, az AI Act értelmében ő válik szolgáltatóvá. |
| **Beszállító (*Upstream AI Provider*)** | **Amerikai SaaS cég** | Alapmodell- vagy általános célú MI-komponens beszállítója (General Purpose AI / upstream vendor), aki a technológiai réteget biztosítja. |
| **Üzembe helyező (*Deployer*)** | **A Bank belső szervezeti egységei / a Bank maga** | A **3. cikk 4. pontja** szerint az az entitás, amely saját felügyelete alatt használja az MI-rendszert szakmai tevékenysége során. |

> **Gyakorlati konklúzió:** Mivel a bank saját márkaneve alatt integrálja és futtatja a rendszert belső használatra, a bank egyszerre minősül **szolgáltatónak** (mert saját név alatt saját célra „fejleszti/konfigurálja”) és **üzembe helyezőnek** (*Deployer*) is.

---

### 3. Fő kötelezettségek ebben a kategóriában

Mivel a rendszer nem magas kockázatú:

1. **Nincs szükség** előzetes megfelelőségértékelésre, EU-adatbázisba történő regisztrációra vagy formális kockázatkezelési rendszerre (mint az Annex III-as rendszereknél).
2. **AI-műveltség (4. cikk):** A banknak gondoskodnia kell arról, hogy az ügyintézők és a rendszert működtető személyzet megfelelő képzést kapjon a promptolt MI működéséről és korlátairól.
3. **GDPR és adatbiztonság:** Kiemelt figyelmet igényel, hogy a hiteldokumentumok (amelyek személyes és pénzügyi adatokat tartalmaznak) továbbításra kerülnek-e az amerikai SaaS szervereire (EU–US Data Privacy Framework megfelelőség, titkosítás, adatfeldolgozói szerződések).
