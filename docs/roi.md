# ROI-levezetés — Szobakertész agent egy 5 fős lakberendező irodának

> Cél: megbecsülni, mennyi pénzt takarít meg havonta/évente egy 5 fős lakberendező iroda, ha a növénykatalógus-kérdéseket (ajánlás, csomag-összeállítás, kategória-/ár-/készlet-keresés) a Szobakertész CLI agenten keresztül intézi kézi katalógus-böngészés helyett. Minden bemenő szám **explicit feltételezés** — külön jelölve, hogy honnan jön, hogy a végeredmény átlátható és vitatható maradjon.

## 1. A forgatókönyv

Az agent perszónája (`docs/system-prompt.md` `<role>`) egy lakberendezőnek segít növényt választani és növénycsomagot összeállítani egy webshop katalógusa alapján. A forgatókönyv tehát: egy **5 fős lakberendező iroda**, ahol minden kolléga rendszeresen állít össze növénycsomagokat ügyfeleknek (fényigény, öntözés, méret, háziállat-biztonság, büdzsé szerint szűrve).

**Kézi módszer ma:** a lakberendező megnyitja a webshop/katalógus felületet vagy egy Excel-exportot, kézzel szűr kategória/fény/öntözés/ár szerint, ellenőrzi a készletet és az esetleges akciós árat (`COALESCE(sale_price, price)`), összeveti a szoba méretével (`current_height_cm`, `current_pot_cm`), és jegyzetel.

**Az agenttel:** a lakberendező természetes nyelven kérdez (`ask "..."`), az agent SQL-t generál a `products` táblán, lefuttatja a `runSql` / `listCategories` tool-lal, és azonnal kész, szűrt, indoklással ellátott választ ad.

## 2. Feltételezések

| # | Feltételezés | Érték | Indoklás |
|---|---|---|---|
| A1 | Létszám | 5 lakberendező | Adott a feladat kiírásában. |
| A2 | Növénykapcsolódó kérdés/fő/munkanap | 3 | Egy közepesen aktív irodában ennyi ügyféligény/konzultáció fut be naponta, ami növényes csomagot vagy ajánlást igényel (nem minden projekt tartalmaz növényt minden nap, de sok igen). |
| A3 | Munkanap/hónap | 20 | Szokásos teljes munkaidős havi munkanapszám. |
| A4 | Kérdések/hónap összesen | **300** | A2 × A3 × A1 = 3 × 20 × 5. |
| A5 | Idő kézi módszerrel/kérdés | 25 perc | Katalógus-böngészés + szűrés fény/öntözés/ár/készlet szerint + jegyzetelés — becslés a leírt manuális workflow alapján. |
| A6 | Idő az agenttel/kérdés | 4 perc | Kérdés begépelése + a kapott válasz átolvasása/kis finomítása (pl. utókérdés, ha az agent pontosít — lásd `<behavior>`: kétértelmű kérésnél visszakérdez). |
| A7 | Lakberendező havi bruttó bére | 550 000 Ft | Hazai piaci becslés medior lakberendezői pozícióra — **nem külső forrásból verifikált**, konzervatív középérték. |
| A8 | Munkáltatói teljes költség szorzó | 1,13× | Szociális hozzájárulási adó (13%) a bruttó bérre — a bruttó bér feletti tényleges munkáltatói kiadás közelítése. |
| A9 | Munkaóra/hónap | 168 | 21 nap × 8 óra (kerekített szokásos érték A3-hoz közeli, de a bér-óradíj számításhoz a szabvány 21 napos éves átlagot használjuk). |

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
105 óra × 3 700 Ft/óra ≈ 388 500 Ft/hó
```

Éves szinten:

```
388 500 Ft × 12 ≈ 4 662 000 Ft/év
```

## 4. Üzemeltetési költség (amit a megtakarításból le kell vonni)

Az agent LLM-hívásai (Anthropic API, jelenleg `claude-sonnet-4-6`, ár: **$3,00 / 1M input token, $15,00 / 1M output token** — Anthropic hivatalos árlistája, 2026-06-24-i állapot) kérdésenként nagyjából:

| Komponens | Becsült token |
|---|---|
| System prompt (`docs/system-prompt.md` `<role>`–`<tools>`) | ~550 |
| Felhasználói kérdés | ~30 |
| Tool-hívás (`runSql`/`listCategories`) + tool-eredmény (sorok JSON-ban) | ~350 |
| Végső természetes nyelvű válasz (output) | ~250 |

```
Input token/kérdés  ≈ 550 + 30 + 550 + 30 + 350 ≈ 1 510   (2 kör: első hívás + tool-eredménnyel megismételt hívás)
Output token/kérdés ≈  50 (tool_use) + 250 (végső válasz) ≈ 300

Költség/kérdés ≈ 1 510 × ($3 / 1 000 000) + 300 × ($15 / 1 000 000)
              ≈ $0,0045 + $0,0045 ≈ $0,009 ≈ 1 Ft/USD ≈ 380 Ft árfolyamon: ~3,4 Ft/kérdés
```

*(A jelenlegi kódban még nincs bekötve prompt caching a system promptra — ha bekötnénk, a system prompt token ismétlődő költsége kb. 90%-kal csökkenne, tehát ez inkább felső becslés.)*

```
Havi API-költség ≈ 300 kérdés × 3,4 Ft ≈ 1 020 Ft/hó
```

Ehhez hozzáadva egy becsült üzemeltetési puffer (kis VPS/DB-hosting, karbantartás — a helyi OrbStack/docker-compose fejlesztői környezet éles bevezetésnél egy olcsó managed Postgres-re válthat): **~20 000 Ft/hó**.

```
Teljes üzemeltetési költség ≈ 21 000 Ft/hó
```

## 5. Nettó megtakarítás

```
Nettó havi megtakarítás = 388 500 Ft − 21 000 Ft ≈ 367 500 Ft/hó
Nettó éves megtakarítás ≈ 4 410 000 Ft/év
```

**Megtérülés:** még ha egy egyszeri, valós (nem kurzus-) bevezetési fejlesztési költséggel is számolunk — mondjuk 1 fejlesztői hét (40 óra × 8 000 Ft/óra ≈ 320 000 Ft) —, ez az összeg **az első hónapban megtérül** (367 500 Ft > 320 000 Ft).

## 6. Érzékenység — mennyire "törhető" ez a becslés

Az A5/A6 időbecslés a leggyengébb láncszem. Ha a valós megtakarítás csak a felét teszi ki a feltételezettnek (10,5 perc/kérdés a becsült 21 helyett):

```
Havi megtakarított idő = 10,5 perc × 300 = 3 150 perc = 52,5 óra
Havi bruttó megtakarítás = 52,5 × 3 700 Ft ≈ 194 250 Ft
Nettó havi megtakarítás ≈ 194 250 − 21 000 ≈ 173 250 Ft
```

Vagyis még a felére vágott feltételezés mellett is jelentős, pozitív havi megtakarítás marad — az üzemeltetési költség (API + hosting) elhanyagolható a bérköltség-megtakarításhoz képest bármelyik forgatókönyvben.

## 7. Korlátok

- A bér- és időbecslések (A5–A8) nem külső, verifikált forrásból származnak — házi, indokolt becslések, egy valós bevezetés előtt érdemes lenne mérni (pl. 2 hetes A/B: fele csapat agenttel, fele nélkül).
- A token/kérdés becslés a jelenlegi rendszerprompt méretén és egy tipikus 1 tool-körös kérdésen alapul; összetettebb, több tool-kört igénylő kérdéseknél (`MAX_TOOL_ITERATIONS = 5`) a költség arányosan nő, de még ekkor is elhanyagolható a bérmegtakarításhoz képest.
