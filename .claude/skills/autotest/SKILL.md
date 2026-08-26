---
name: autotest
description: Lefuttatja a Szoba-kertész Playwright nehézségi-létra batteryjét (single-step → multi-turn → komplex → stressz → trollkodás → jailbreak → RAG-grounding), kiértékeli az eredményt egy önálló HTML-riportba javaslatokkal, megkérdezi a felhasználót, mely javaslatokat ültesse át, és a döntést (elfogadott ÉS elvetett) egy ADR-be logolja. Használd, amikor a webes agentet end-to-end mérni kell — pl. „futtasd le az autotestet", „/autotest", „nézd meg, hogy bírja a nehéz kérdéseket".
---

# autotest — mérés → riport → döntés → ADR

Egy zárt hurok: **futtat → kiértékel → kérdez → logol**.

> **A felhasználó csak a slash-parancsot írja be.** MINDEN parancsot (infra, futtatás,
> riport-megnyitás) az AGENT hajt végre Bash-en keresztül.

> **FIZETŐS.** Minden mód valódi modell-hívásokat indít. A futtatás ELŐTT írd ki a becsült
> költséget, és **várd meg a felhasználó jóváhagyását**.

| Parancs | Mit csinál | Mért / becsült költség |
|---|---|---|
| `/autotest` vagy `/autotest battery` | teljes battery (29 eset), riport, ADR | **~$1,5–2,5** |
| `/autotest rag` | RAGAS-mérés (7 eset) + RAG-riport | **$0,38** (mérve) |
| `/autotest all` | előbb battery, majd RAG | **~$2–3** |
| `/autotest quick` | rövid demó: `--only "Single-step,Buktató,Multi-turn"` | **~$0,4** |

**Mért fogódzók a becsléshez** (2026-08-25): egy egyszerű katalógus-kérdés ≈ **$0,029**
(8300 token), egy kétkörös beszélgetés ≈ **$0,055**.

A `--consistency` **alapból KI van kapcsolva** (a kurzussal ellentétben): nálunk minden futás
valódi pénz, tehát az alapértelmezés az olcsó. Csak kifejezett kérésre kapcsold be — háromszoros
futás háromszoros költség.

## 0. Infra — az AGENT hozza fel

```bash
# Docker/OrbStack: ha a daemon nem fut → `open -a OrbStack`, majd várni `docker info`-ra.
docker start szoba-kertesz-adatbazis 2>/dev/null || docker compose up -d

# Szerver (3000) és web (4200) háttérben.
# A `env -u OPENAI_API_KEY` a SZERVEREN IS KELL, nem csak a battery-n: a searchKnowledge
# embedding-hívása a SZERVER folyamatában fut, és a `process.loadEnvFile()` NEM írja felül a
# shellből örökölt (rossz) kulcsot. Mérve 2026-08-26-án: enélkül a teljes RAG-grounding fok
# „Incorrect API key"-jel futott, és KÉT eset HAMIS ZÖLDET adott.
env -u OPENAI_API_KEY pnpm serve:api > logs/autotest-server.log 2>&1 &
pnpm serve:web > logs/autotest-web.log 2>&1 &
```

**A futás után ellenőrizd a szerver logját**, mielőtt a riportnak hinnél:

```bash
grep -ciE "incorrect api key|invalid_api_key|authentication_error" logs/autotest-server.log   # 0
```

A minta **szándékosan szűk**: egy `401`-re illesztő grep a trace `dist=0.401` értékeire is
ráugrik, és hamis riasztást ad — mérve.

Várakozás, amíg **mindkettő** válaszol (~15 s):

```bash
curl -sf http://localhost:3000/api/threads >/dev/null && curl -sf http://localhost:4200 >/dev/null
```

**RAG-módnál** ellenőrizd, hogy a `knowledge_chunks` nem üres (mérve: 1906 sor). Ha üres, a
feltöltés (`pnpm knowledge:ingest`) **fizetős és percekig tart** — mondd ki, ne csendben indítsd.

**Fizetős parancsot mindig `env -u OPENAI_API_KEY` előtaggal** indíts: a shell-környezet
árnyékolhatja a `.env` kulcsát.

### PORT-ÜTKÖZÉS — ha a `/api/threads` váratlanul 404-et ad

Mérve a fejlesztői gépen: a 3000-es porton az **Obsidian** is figyel (REST-plugin), a
`127.0.0.1:3000`-en. A mi szerverünk `::`-re köt, ezért elférnek egymás mellett, és a
`localhost` feloldása dönti el, ki válaszol:

| Cím | Ki válaszol |
|---|---|
| `http://127.0.0.1:3000` | **az Obsidian → 404** |
| `http://[::1]:3000` · `http://localhost:3000` | a mi szerverünk → 200 |

A Chrome `::1`-re old fel, tehát **normál esetben működik**. Diagnózis: `lsof -nP -i :3000`.
Kiút, **csak ütközés esetén**:

```bash
# gyökér .env-be:     PORT=3100
# apps/web/.env-be:   VITE_API_URL=http://localhost:3100
```

A két változó külön fájlba megy: a szerver a gyökér `.env`-et tölti (`process.loadEnvFile()`),
a Vite az `apps/web/.env`-et (`envDir` = `root`). Ne állítsd át alapból — a 3000 be van égetve
a `CLAUDE.md`-be és a `docs/`-ba.

## 1. Futtatás

```bash
env -u OPENAI_API_KEY pnpm autotest:battery
```

Két fájl keletkezik a `logs/autotest/`-ben: `<ts>-battery.json` (**ebből dolgozunk**) és
`<ts>-battery.md` (emberi olvasat). A böngésző látható, a jobb alsó sarokban a HUD mutatja,
épp melyik eset fut.

A battery a **saját** thread-jeit a végén törli (admin kapcsolaton, mert a `_chat` szerep nem
tud törölni). A `--keep-threads` meghagyja őket — a **négy demó-beszélgetés soha nem érintett**.

Szűrők: `--only "<fok-név-részlet>[,…]"` · `--no-hud` · `--consistency` · `--keep-threads` ·
`--dump-cases` (ingyenes séma-igazolás).

## 2. Kiértékelés — ezt TE csinálod, az agent

Olvasd be a `<ts>-battery.json`-t, és keresd:

- **bukott esetek** (`flags` nem üres) — mi a mintázat?
- **latency-kiugrások** — melyik kérdés-típus lassú, és miért?
- **`ttfcMs: null`** — hol nem érkezett szöveges válasz egyáltalán?
- **`verdict.reason`, ami azt mondja, „nincs determinisztikus elvárás"** — hol NEM mérünk?
  Ez a leggyakrabban átsiklott jel: az az eset zöldnek látszik, pedig senki nem ellenőrizte.
- **konzisztencia**, ha futott: ami `INGADOZIK`, az flaky agent-viselkedés, nem kód-hiba.

Írj egy `logs/autotest/<ts>-suggestions.json`-t:

```json
{ "suggestions": [
  { "id": "S1", "title": "rövid, cselekvő cím", "severity": "HIGH",
    "area": "prompt", "rationale": "miért — a bizonyítékra hivatkozva",
    "evidence": "eset-azonosító (pl. trap-avg-price)" }
] }
```

A séma **validált**: `severity` ∈ HIGH|MEDIUM|LOW, `area` ∈ prompt|tool|ux|infra, és az
`evidence` **nem lehet üres** — bizonyíték nélkül a javaslat nem visszakereshető.

## 3. Riport

```bash
pnpm autotest:report logs/autotest/<ts>-battery.json logs/autotest/<ts>-suggestions.json
```

Magától megnyílik a böngészőben (`--no-open` kikapcsolja). A bukott esetek **alapból nyitva**,
az elfogadottak összecsukva. Add át a felhasználónak `SendUserFile`-lal is,
`display: "render"`-rel.

## 4. Kérdés a felhasználónak

`AskUserQuestion`, `multiSelect: true`. A javaslatok az opciók (`title` + `severity` a
labelben). Az **„Egyiket sem" is valid** kimenet — ne beszéld rá.

## 5. ADR — a döntési napló

Írj **EGY ADR-t a review-körre** (nem javaslatonként):

- A következő szám: a `docs/adr/` legnagyobb `NNNN`-je + 1. Sablon: `docs/adr/_template.md`.
- **Kontextus:** melyik futás (linkeld a JSON-t és a HTML-t), a fő tanulságok.
- **Döntés:** melyik javaslatot ültetjük át.
- **Megfontolt alternatívák:** **SOROLD FEL AZ ÖSSZESET** — az elvetettet is, az elvetés
  indokával. Ez a napló lényege.
- **Következmények:** mit nyerünk, mi az ár.
- Frissítsd a `docs/adr/README.md` index-tábláját egy sorral.

## 6. Átültetés (opcionális)

Az elfogadott javaslatokat normál fejlesztésként, TDD-vel implementáld.

## RAG-mód

```bash
env -u OPENAI_API_KEY pnpm autotest:rag
```

A JSON-t **és** a HTML-riportot is maga írja (`--no-open` kikapcsolja a megnyitást).

Hat metrika (0–1), állítás-szintű indoklással: **faithfulness**, **answer relevancy**,
**answer correctness**, **context precision**, **context recall**, **noise sensitivity**
(kevesebb a jobb).

**A `n/a` metrika NEM 0**: azt jelenti, hogy nem sikerült megmérni (a judge kétszer sem adott
értékelhető választ). Ha sok `n/a` van, a judge a hibás, nem a RAG.

**Mért alapérték** (2026-08-25, 7 eset): faith 0,86 · relev 0,74 · correct 0,69 · prec 0,99 ·
recall 0,74 · noise 0,12. Ehhez viszonyítsd a következő futást.

## Fájlok

- `tools/autotest/src/battery.ts` — a nehézségi létra futtatója (Playwright)
- `tools/autotest/src/rag-eval.ts` — a RAGAS-mérés (böngésző nélkül, közvetlenül a pipeline-on)
- `tools/autotest/src/report-html.ts` — a battery riportja
- `tools/autotest/cases/battery-cases.json` · `rag-cases.json` — a **tesztesetek** (adat)
- `docs/adr/` — a döntési napló

Új eset = egy sor a JSON-ba, kódmódosítás nélkül. Séma-ellenőrzés ingyenes:
`pnpm autotest:battery -- --dump-cases`.

**A mérőeszköz nem a termék része**: a `tools/autotest` külön workspace-csomag, a
`packages/core` egyetlen sorral sem tud róla.
