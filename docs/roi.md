# ROI-levezetés — Szobakertész agent egy 5 fős lakberendező irodának

> Cél: megbecsülni, mennyi pénzt takarít meg havonta/évente egy 5 fős lakberendező iroda, ha a növénykatalógus- és növénygondozási kérdéseket a Szobakertész agenten keresztül intézi kézi katalógus-böngészés és utánaolvasás helyett.
>
> **Mit hihetsz el, és mit nem.** Minden bemenő szám meg van jelölve: **MÉRT** (naplófájlból vagy mérőeszköz-futásból, forrással) vagy **BECSÜLT** (indokolt házi feltételezés, külső forrásból nem verifikált). A 2026-07-03-i első változatban az üzemeltetési költség még végig becslés volt; azóta van mérésünk, és ez a változat arra épül.
>
> **Frissítve: 2026-09-01.** Az előző változat (`5f32123`, 2026-07-03) a 04. alkalom *előtti* képességhalmazt árazta — akkor a rendszer CLI-ből futó, katalógus-kereső agent volt. Azóta van tudásbázis (RAG), böngésző-chat, MCP-szerver és mérőeszköz; ez a változat ezekre vonatkozik.

## 1. A forgatókönyv

Az agent perszónája (`docs/system-prompt.md` `<role>`) egy lakberendezőnek segít növényt választani és növénycsomagot összeállítani egy webshop katalógusa alapján. A forgatókönyv: egy **5 fős lakberendező iroda**, ahol minden kolléga rendszeresen állít össze növénycsomagokat ügyfeleknek.

A munka **kétféle kérdésből** áll, és ez a megkülönböztetés a 06. alkalom óta létezik — az előző ROI-változat még nem tudta árazni:

| Kérdéstípus | Példa | Mit csinál az agent |
|---|---|---|
| **katalógus** | „Hány pozsgás van 5000 Ft alatt, ami háziállat-barát?" | természetes nyelv → SQL a `products` táblán (`runSql`, `listCategories`) |
| **gondozási** | „Hogyan gondozzam a kígyónövényt? Milyen gyakran kell öntözni?" | RAG-keresés a tudásbázisban (`searchKnowledge`: HyDE → embedding → pgvector → rerank), forrásmegjelöléssel |

**Kézi módszer ma.** Katalógus-kérdésnél: a webshop-felület vagy egy Excel-export kézi szűrése kategória/fény/öntözés/ár szerint, a készlet és az akciós ár (`COALESCE(sale_price, price)`) ellenőrzése, összevetés a szoba méretével. Gondozási kérdésnél: **utánaolvasás** — angol nyelvű gondozási cikkek keresése és átolvasása, ami más természetű munka, mint a szűrés.

**Az agenttel.** A lakberendező természetes nyelven kérdez a böngészőben (05. alkalom óta van webes chat) vagy a terminálban, és azonnal kap szűrt, indoklással ellátott választ — gondozási kérdésnél **forrásmegjelöléssel**, a 202 cikkes tudásbázisból.

## 2. Feltételezések

| # | Feltételezés | Érték | Jelleg | Indoklás |
|---|---|---|---|---|
| A1 | Létszám | 5 lakberendező | **adott** | A feladat kiírásában. |
| A2 | Növénykapcsolódó kérdés/fő/munkanap | 3 | **BECSÜLT** | Közepesen aktív irodai forgalom; nem mértük. |
| A3 | Munkanap/hónap | 20 | **BECSÜLT** | Szokásos havi munkanapszám. |
| A4 | Kérdések/hónap összesen | **300** | **számított** | A2 × A3 × A1 = 3 × 20 × 5. |
| A5 | Idő kézi módszerrel/kérdés | 25 perc | **BECSÜLT** | A leírt manuális workflow alapján. **A becslés leggyengébb láncszeme** — lásd a 6. szakaszt. |
| A6 | Idő az agenttel/kérdés | 4 perc | **BECSÜLT** | Kérdés begépelése + válasz átolvasása, esetleges utókérdéssel. |
| A7 | Lakberendező havi bruttó bére | 550 000 Ft | **BECSÜLT** | Hazai piaci becslés medior pozícióra — **külső forrásból nem verifikált**. |
| A8 | Munkáltatói költség-szorzó | 1,13× | **jogszabályi** | Szociális hozzájárulási adó (13%). |
| A9 | Munkaóra/hónap | 168 | **konvenció** | 21 nap × 8 óra. |
| A10 | Árfolyam | 380 Ft/USD | **BECSÜLT, ELLENŐRIZETLEN** | A 2026-07-03-i változatból átvéve; **nem frissítettük**, mert friss, hivatkozható árfolyamot nem ellenőriztünk. |
| A11 | Katalógus / gondozási kérdés aránya | **nem ismert** | **NEM MÉRT** | Ezért ad a 4. szakasz **sávot**, nem pontot. |

## 3. Időmegtakarítás → pénz

```
Megtakarított idő/kérdés = A5 − A6 = 25 perc − 4 perc = 21 perc
Havi megtakarított idő   = 21 perc × 300 kérdés = 6 300 perc = 105 óra
```

Órabér (munkáltatói teljes költség alapján):

```
Havi teljes bérköltség/fő = 550 000 Ft × 1,13 = 621 500 Ft
Órabér                    = 621 500 Ft / 168 óra ≈ 3 700 Ft/óra
```

Havi pénzbeli megtakarítás:

```
105 óra × 3 700 Ft/óra ≈ 388 500 Ft/hó   →   éves szinten ≈ 4 662 000 Ft/év
```

**Ez a szakasz végig BECSLÉS** (A5–A9-re épül), és tudatosan nem lett hozzáigazítva a méréshez — a mérés a *költség* oldalon történt, nem a haszon oldalán.

## 4. Üzemeltetési költség — **ez a szakasz MÉRT**

Az előző változat itt egy találgatást tartalmazott („≈ 1 510 input token"). Azóta 94 futásnapló (`logs/*.jsonl`), egy autotest-battery futás és a `tools/autotest/src/lib/cost.ts` ár-táblája áll rendelkezésre.

### 4.1 A mért alap

Árak (`tools/autotest/src/lib/cost.ts`, Anthropic listaár 2026-06-24): **Sonnet 4.6 $3 / $15**, **Haiku 4.5 $1 / $5** / 1M token. Embedding (OpenAI `text-embedding-3-small`): $0,02 / 1M token.

| Tétel | Token (be / ki) | Költség | Forrás | Mikor mérve |
|---|---|---|---|---|
| katalógus-kérdés, válasz-réteg | 3 849 / 235 | **$0,0151** | `README.md` „Költségbecslés" | 06. alkalom |
| gondozási kérdés, válasz-réteg | 8 702 / 287 | **$0,0304** | ugyanott | 06. alkalom |
| gondozási kérdés, válasz-réteg | 9 139 / 856 | **$0,0403** | `logs/autotest/2026-08-26T07-12-39-154Z-battery.json` (`rag-care-source` eset) | 2026-08-26 |
| RAG-pipeline (HyDE + rerank + embedding) | — | ≈ $0,0055 | `README.md`, **karakterszámból BECSÜLT** | 06. alkalom |

> **A harmadik sor be/ki bontása LEVEZETETT, nem tárolt.** A battery JSON két értéket őriz:
> `tokens: 9995` (összesen) és `costUsd: 0.040257`. A bontás ebből egyértelműen visszafejthető,
> mert a Sonnet 4.6 két ára ismert: `be + ki = 9995` és `be × 3 + ki × 15 = 40 257` (µUSD)
> → **be = 9 139, ki = 856**. Visszaszorozva pontosan $0,040257 jön ki, tehát a levezetés nem
> közelítés. Aki a JSON-ban a „9139"-et keresi, nem fogja megtalálni — ezért áll itt.

### 4.2 Egy mérési csapda, amit ki kell mondani

A battery `costUsd` mezője a `logs/<ts>.json` `usage`-éből számol (`tools/autotest/src/lib/server-usage.ts`), ez pedig **az agent-loop** token-használata. A HyDE, a rerank és az embedding a `packages/core/src/lib/rag/retrieve.ts`-en **belül** fut, nem a loopban — az `onStepEnd` hook nem látja őket, tehát a JSONL sem tartalmazza.

**Következmény:** a battery száma **kizárólag a válasz-réteg**, és nem vethető össze a README teljes ~3,6 centes gondozási becslésével, csak annak ~3,0 centes válasz-részével. A teljes költséghez a pipeline becsült $0,0055-ét hozzá kell adni.

### 4.3 Miért sáv, és nem pont

A két mért gondozási eset **bemenete közel azonos** (8 702 vs. 9 139 token), a **kimenete viszont háromszoros** (287 vs. 856). A battery kérdésére az agent táblázatos, tagolt választ írt. Ez **nem mérési hiba**, hanem a kérdésenkénti költség természetes szórása — a válasz *hossza* mozgatja, nem a kérdés nehézsége.

Ezért a dokumentum sávot ad:

| Kérdéstípus | Költség/kérdés | Ft (A10: 380 Ft/USD) |
|---|---|---|
| katalógus (nincs RAG-pipeline) | $0,0151 | **≈ 5,7 Ft** |
| gondozási, alsó vég | $0,0359 | **≈ 13,7 Ft** |
| gondozási, felső vég | $0,0458 | **≈ 17,4 Ft** |

### 4.4 Havi API-költség (A4: 300 kérdés)

Mivel a kérdés-összetétel nem ismert (A11), a két szélső eset:

| Összetétel | USD/hó | Ft/hó | a régi becsléshez képest |
|---|---|---|---|
| csupa katalógus-kérdés | $4,52 | **≈ 1 720 Ft** | 1,7× |
| csupa gondozási, alsó vég | $10,77 | **≈ 4 090 Ft** | 4,0× |
| csupa gondozási, felső vég | $13,73 | **≈ 5 220 Ft** | 5,1× |

**A régi anyag 1 020 Ft/hó-t becsült. A mért sáv ennek 1,7–5,1-szerese** — ez a mérés egyetlen valódi meglepetése. Két oka van: a system prompt és a séma-kontextus azóta nőtt, a RAG pedig öt tudásbázis-darabot tesz a promptba (3 849 → 8 702 input token).

*(Prompt caching továbbra sincs bekötve. Ha bekötnénk, a system prompt ismétlődő költsége kb. 90%-kal csökkenne — a fenti számok tehát felső becslések.)*

### 4.5 Egyszeri és fix költségek

- **A tudásbázis teljes felépítése** (`pnpm knowledge:ingest`): 202 dokumentum → 1 906 chunk, ~274 000 token, **≈ 0,55 cent ≈ 2 Ft**. Mért, `README.md`. Egyszeri, elhanyagolható — ezért helyes döntés a `TRUNCATE` + újratöltés az inkrementális frissítés helyett.
- **Hosting-puffer**: **~20 000 Ft/hó**. **BECSÜLT** — kis VPS + managed Postgres. Ezt a számot a go-live köre fogja valósra cserélni; ma nincs éles környezet, tehát mérni sem tudjuk.

```
Teljes üzemeltetési költség ≈ 20 000 Ft + (1 720 … 5 220 Ft) ≈ 21 700 … 25 200 Ft/hó
```

## 5. Nettó megtakarítás

```
Nettó havi megtakarítás = 388 500 Ft − (21 700 … 25 200 Ft) ≈ 363 300 … 366 800 Ft/hó
Nettó éves megtakarítás ≈ 4 359 000 … 4 401 000 Ft/év
```

**A mérés NEM borította fel a következtetést — és ezt érdemes kimondani.** Az API-költség 1,7–5,1-szeresére nőtt a korábbi becsléshez képest, a nettó megtakarítás mégis csak **367 500 Ft-ról 363 300–366 800 Ft-ra** változott: **1,2%-nál kisebb elmozdulás**. Az ok szerkezeti, nem véletlen: az API-költség a bérköltség-megtakarítás **0,4–1,3%-a**, tehát még egy ötszörös tévedés is elnyelődik benne.

Ez a megállapítás önmagában is eredmény: azt mutatja, hogy **a modell-költség optimalizálása ebben a forgatókönyvben nem éri meg a ráfordítást**. Ha spórolni akarunk, az A5/A6 időbecslésen múlik minden, nem a tokeneken.

**Megtérülés:** egy egyszeri, valós (nem kurzus-) bevezetési költséggel számolva — 1 fejlesztői hét, 40 óra × 8 000 Ft ≈ 320 000 Ft — ez **az első hónapban megtérül** (363 300 Ft > 320 000 Ft), a sáv alsó végén is.

## 6. Érzékenység — mennyire „törhető" ez a becslés

**Az A5/A6 időbecslés a leggyengébb láncszem**, nem a költség. Ha a valós megtakarítás csak a felét teszi ki a feltételezettnek (10,5 perc/kérdés a becsült 21 helyett):

```
Havi megtakarított idő   = 10,5 perc × 300 = 3 150 perc = 52,5 óra
Havi bruttó megtakarítás = 52,5 × 3 700 Ft ≈ 194 250 Ft
Nettó havi megtakarítás  ≈ 194 250 − (21 700 … 25 200) ≈ 169 000 … 172 500 Ft
```

Még a felére vágott feltételezés mellett is jelentős, pozitív a havi megtakarítás. **Az üzemeltetési költség bármelyik forgatókönyvben elhanyagolható a bérköltség-megtakarításhoz képest** — most már nem becslésre, hanem mérésre alapozva.

Ami **valóban** meg tudná dönteni a számítást: ha a lakberendezők a kézi módszerrel is 5-6 perc alatt végeznének (azaz A5 ≈ A6). Ezt csak méréssel lehet eldönteni.

## 7. Korlátok

- **A haszon-oldal továbbra is becslés.** Az A5–A9 nem külső forrásból származik; egy valós bevezetés előtt érdemes mérni (pl. 2 hetes A/B: fele csapat agenttel, fele nélkül). A mérés ebben a körben a **költség**-oldalt érintette.
- **A battery száma csak a válasz-réteg** (4.2). A RAG-pipeline három hívása nem szerepel az agent-loop `usage`-ében, ezért a pipeline költsége **becsült** marad, karakterszámból.
- **A kérdés-összetétel nincs mérve** (A11), ezért a havi API-költség sáv. Egy éles bevezetés első hónapja ezt azonnal megmondaná.
- **Az árfolyam ellenőrizetlen** (A10), 2026-07-03-i feltételezés.
- **A hosting-puffer becslés**, amit a go-live köre válthat valósra — ma nincs éles környezet.
- **A mért költségadatok nem egy időpontból valók:** a válasz-réteg tokenszámai a 06. alkalomból, a battery-futás 2026-08-26-ból. A rendszer prompja azóta nem változott lényegesen, de ez nem ellenőrzött állítás.
- **A minőség nem szerepel a képletben.** Hogy az agent válasza *jó-e*, külön mérés tárgya: a `tools/autotest` nehézségi létrája (11 fok / 29 eset) és a RAGAS-stílusú RAG-kiértékelés (hat metrika) erre való. Egy ROI-számítás, ami rossz válaszokat áraz be jónak, önmagát csalja meg — a mérőeszköz megléte ezért része az üzleti érvnek, nem csak a mérnökinek.
