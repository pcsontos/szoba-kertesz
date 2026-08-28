# MCP — a szoba-kertész mint eszköz egy IDEGEN agent kezében

Eddig minden belépési pontnál **mi** hívtuk a modellt: a CLI, a HTTP-szerver és a web
ugyanazt az agent-loopot indította el. Az MCP (Model Context Protocol) megfordítja az irányt:
itt egy **idegen host** (Claude Desktop, Claude Code) modellje hívja a **mi** tooljainkat.

```
  eddig:   felhasználó → CLI/web → szoba-kertész agent → toolok → DB
  most:    felhasználó → Claude  → MCP → szoba-kertész toolok → DB
                                   └── ask_szobakertesz esetén: → query-agent → toolok → DB
```

A `@szoba-kertesz/core` most sem tud arról, hogy létezik az MCP-réteg — az `apps/mcp` a
negyedik belépési pont a `cli`, `server`, `web` mellett. **A kör nulla soros core-diffel
valósult meg.**

## Hatókör: KIZÁRÓLAG a stdio transport

Ez a kör szándékosan **nem** tartalmazza az MCPB-csomagot (Claude Desktop GUI-jából
telepíthető Extension) és a streamable HTTP + Railway-deployt. Az utóbbi a projekt első
publikus deploya lenne, külön Postgres-hosztolással és egy valódi, tokenes támadási
felülettel — ez a döntés indoka a specben (1. döntés) részletezve. Ha a jövőben mégis kell:
az `apps/mcp/src/szoba-kertesz-server.ts`-ben épített `server` objektum VÁLTOZATLAN marad,
csak a transport cserélődik.

## A három tool — három stílus, szándékosan

| | `search_plants` | `search_knowledge` | `ask_szobakertesz` |
|---|---|---|---|
| Mi fut mögötte | egy paraméterezett `SELECT` | a core RAG-pipeline-ja | a **teljes** query-agent loop |
| Ki gondolkodik | a **hívó** modell | a **hívó** modell | a **mi** agentünk |
| Válasz | nyers JSON sorok | chunkok + forrás-URL-ek | kész, magyar szöveg forrásokkal |
| Fizetős? | **nem** | igen — embedding + HyDE + rerank, ≈ pár cent | igen — teljes loop, ≈ 3–8 cent |
| Tesztelhetőség | unit-teszt (determinisztikus) | a core-ban tesztelt | csak end-to-end |
| Domén-tudás helye | a hívó kontextusában | a hívó kontextusában | a **mi** promptunkban |

**`search_plants`** a klasszikus MCP-adat-minta: 16 szűrőmezőt fogad (kategória, hely, fény,
öntözés, nehézség, ár-sáv, pet/kid-safe, légtisztító, készlet, méret-tartomány, rendezés,
limit) — a katalógus MINDEN besoroló oszlopa elérhető a hívó modellnek. A `hely` szűrő
**befogadó**: `kültéri`/`beltéri` a `mindkettő` besorolású termékeket is visszahozza, mert a
doménben az azt jelenti, hogy MINDKÉT helyre jó (a `runSql`-nél ez nem probléma, mert ott a
system prompt tanítja a modellt a szótárra — itt a hívó modell nem ismeri a sémánkat).

**`search_knowledge`** nem új logika, hanem egy **átkötött** core-tool: a meglévő
`executeSearchKnowledge` alakja fordul MCP-re, a logika (HyDE → embedding → pgvector →
rerank) változatlan.

**`ask_szobakertesz`** az *agent-as-tool*: a hívó számára ez egy sima tool, de mögötte a mi
promptunk, SQL-szabályaink és a RAG tudásbázisunk fut. **Fixen `role: 'customer'`** — ez a
kör legfontosabb biztonsági állítása: adminként a query-agent megkapná a `delegateToIngest`
toolt, azzal az MCP-n át **írni** lehetne a katalógusba. Ezt teszt pinneli
(`ask-szobakertesz-tool.spec.ts`), nem csak a leírás mondja ki.

## Amit szándékosan NEM ajánlunk ki

`queryCustomers` (valódi ügyféladat — idegen hostnak kiadni nem tanulság, hanem hiba),
`upsertProduct` és `delegateToIngest` (bármelyik felülírná a fenti biztonsági állítást), és a
`threads`/`messages` perzisztencia (az MCP-hívás egylövetű, mint a `pnpm cli ask` — a hívó
host tartja a beszélgetést, nem mi).

## Két csapda a stdio-transportnál

**1. A stdout a protokollé.** stdio-n a JSON-RPC üzenetek a stdout-on mennek — egyetlen
odaírt sor használhatatlanná teszi a szervert. A core két helyen ír oda: a színes Trace
(`print` flag) és a modul-szintű `traceLog` (amit normál esetben a `runAgentLoop` némít, de a
`search_knowledge` agent-loop nélkül hívja a retrievalt). Ezért a `main.ts` KETTŐS védelmet
épít: `captureStdout()` (mindent, ami mégis odaírna, a stderr-re terel) **és**
`setQuiet(true)` (elveszi magát a zajt — a nyom a `logs/agent.log`-ban megmarad).

**2. Az MCP-felület jogosultsága.** Lásd fentebb: `ask_szobakertesz` fixen `role: 'customer'`,
a `search_plants` értékei mindig `$1, $2, …` paraméterként mennek, és a mi generált SQL-ünk
is átmegy a core `guardSql`-jén (öv és nadrágtartó).

## Bekötés dev módban

### Claude Code

A repo gyökerében a `.mcp.example.json` a minta — másold `.mcp.json` néven (gitignore-olt
marad, `CLAUDE.md` szabálya szerint sosem kerül a gitbe):

```bash
cp .mcp.example.json .mcp.json
```

Utána a Claude Code a projekt megnyitásakor felajánlja a szerver engedélyezését, vagy
kézzel:

```bash
claude mcp add --scope project szoba-kertesz -- pnpm mcp
claude mcp list          # állapot: ✓ connected
```

A Claude Code UI-ban a `/mcp` paranccsal listázható a `szoba-kertesz` szerver és alatta a
három tool.

### Claude Desktop

A Desktop nem örökli a shell PATH-ját, ezért **abszolút út** kell, és az `.env`-et a `cwd`-ből
tölti. `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "szoba-kertesz": {
      "command": "/abszolút/út/node",
      "args": [
        "/abszolút/út/szoba-kertesz/node_modules/tsx/dist/cli.mjs",
        "--conditions=@szoba-kertesz/source",
        "/abszolút/út/szoba-kertesz/apps/mcp/src/main.ts"
      ],
      "cwd": "/abszolút/út/szoba-kertesz"
    }
  }
}
```

⚠️ A tsx-nél a **`tsx/dist/cli.mjs`** kell, NEM a `node_modules/.bin/tsx` — az utóbbi egy
shell-wrapper, amit a Node nem tud közvetlenül futtatni, és a wrapper a PATH-ból keresné a
node-ot, ami a Desktop alatt szintén nincs meg. A `cwd` sem elhagyható: abból töltődik az
`.env`.

### Inspector (host nélküli teszt)

```bash
pnpm mcp:inspect
```

⚠️ **Port-ütközés:** az Inspector alapból a `6274`-et akarja; ezért a `mcp:inspect` a
`6280`/`6281`-re van állítva (`CLIENT_PORT`/`SERVER_PORT`). A kiírt teljes URL-t nyisd meg (az
auth tokent is tartalmazza), ne csak a `localhost:6280`-at.

## Előfeltételek és költség

Ugyanaz, mint a CLI-nél: futó Postgres (`docker compose up -d`), `.env` a repo gyökerében
(`ANTHROPIC_API_KEY`, `DATABASE_URL_READONLY`). A `search_plants` **ingyenes** (nincs benne
modell), a `search_knowledge` ≈ pár cent (embedding + HyDE + rerank), az `ask_szobakertesz` ≈
3–8 cent (teljes agent-loop). A `pnpm mcp:smoke` **ingyenes** — modellt nem hív, csak a DB-t.

## Ha remote (HTTP) kell

Az `apps/mcp/src/szoba-kertesz-server.ts`-ben épített `server` objektum változatlan maradna,
csak a transport cserélődne (`StreamableHTTPServerTransport` + Express + bearer token). Ez a
kör szándékosan nem tartalmazza (1. döntés).
