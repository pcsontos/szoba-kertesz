# Orchestrátor-agent — design

> Forrás: a kurzus 07. alkalmának ("Beszélő agent") **C fázisa** — `ORCHESTRATION_MODE`,
> orchestrator-agent, package-agent, flow-lock, két handover-mód — amit az `ora-07`
> design-döntés (2026-08-22, 1. döntés) tudatosan kihagyott a scope-ból: "ha kell, saját
> spec". Ez az a spec. A kurzus eredeti kódja a `../ai-agent-kurzus` testvérrepóban él
> (`upstream/main`, a Mastra-refaktor **előtti** commitok: `09327dd`, `83210ea`, `e84d65c`,
> `2bb39a5`, `19fab27`), onnan a KONCEPCIÓT vettük át, nem a kódot — az AI SDK-verzió és az
> architektúra (agent-mint-tool, `streamText`) itt más.

## Mit rögzít ez a doksi

Egy negyedik agentet tervezünk (**orchestrator-agent**) és egy ötödiket vele együtt
(**package-agent**), amivel a rendszer először képes végigvinni a projekt saját, alapító
céljának pontosan azt a lépését, amit a BRS 5. sikerkritériuma (`docs/brs-szoba-kertesz.md`)
és KPI-ja ("egy szoba növénycsomagja 5 perc alatt összeállítható") kimond, de eddig egyetlen
kör sem épített meg: **egy teljes növénycsomag összeállítása egy ügyfélnek**, validálással és
mentés előtti megerősítéssel.

## Kiindulási állapot — mérve, nem feltételezve

- A branch a `master` `6c2b53b` commitjáról ágazik (PR #14 mergelve, go-live-railway kör
  lezárva).
- **77 spec fájl** a repóban (README utoljára 2026-09-01-én mért 75-öt; a go-live-railway kör
  Task 1-e óta kettővel több: `basic-auth.spec.ts`, `web-dist.spec.ts`).
- Az `askAgent`-et **négy helyen** hívja a kódbázis: `apps/cli/src/main.ts:71`,
  `apps/cli/src/interactive.ts:145`, `apps/cli/src/golden-run.ts:76`,
  `apps/server/src/app.ts:153`.
- A `delegate-to-ingest-tool.ts` (105 sor) a **bevált agent-mint-tool minta**: `execute`
  meghívja a beágyazott `askIngestAgent`-et, a teljes választ `content`-ként adja vissza, a
  hívás sosem dob tovább, saját JSONL-sort ír.
- A `query-agent.ts` (92 sor) `AskAgentOptions extends AskOptions` mintája — a `role` a
  QUERY-AGENT szintjén él, a közös loop (`agent-loop.ts`, 373 sor) nem tud szerepekről,
  csak a kész `ToolSet`-et látja.
- A `threads` tábla `customer_id Int?` oszlopa a 07. alkalom óta **mindig `null`** — a
  migráció kifejezetten "hely a C fázisnak" kommenttel hozta létre, eddig senki nem töltötte.
- Négy DB-szerep létezik (`szoba-kertesz_ro/_rw/_chat` + admin); a `messages` tábla
  **append-only** (`<ts>_messages_append_only` migráció revokálta az UPDATE-et a `_chat`
  szereptől) — ez az egyetlen létező precedens egy "csak beszúrható, nem módosítható" táblára.
- Az `autotest:battery` 29 esete a **valódi webes UI**-n fut (`tools/autotest/src/battery.ts`),
  tehát bármi, ami a `/api/chat` mögötti belépési pontot cseréli, ezen automatikusan átmegy.

## Döntések

| # | Döntés | Elvetett alternatíva | Miért |
|---|---|---|---|
| 1 | **Teljes célkép**: új package-agent + orchestrator, nem csak egy routing-réteg a meglévő két agent közt | Szűkebb: orchestrator csak query-agent/ingest-agent között | A package-agent adja a projekt saját, még hiányzó központi képességét (BRS KPI); egy puszta routing-réteg semmilyen új terméki értéket nem adna |
| 2 | A csomag **perzisztál** (új `packages`/`package_items` tábla) | Nincs perzisztencia, csak chat-összefoglaló | A BRS KPI-t ("5 perc alatt összeállítható") auditálható eredmény zárja, nem csak egy elszálló szöveg; illik a projekt "egy írási út" mintájához |
| 3 | A csomag-építés/mentés **mindkét szerepnél** (`customer` **és** `admin`) elérhető | Csak adminnál, mint a `delegateToIngest` | A csomagösszeállítás a termék KÖZPONTI funkciója (a lakberendező persona ezért használja az egészet), nem admin-jogosultság, mint a katalógus-írás |
| 4 | A kör **hátország-fókuszú**: core + CLI + minimális web; UI-handover chip és `flow-test` mérőeszköz **külön kör** | Mindhárom egy körben | Kisebb, fokuszáltabb spec; az UI-csiszolás és a mérőeszköz saját köre illik a 08. alkalom precedenséhez (autotest is önálló kör volt) |
| 5 | **A) Vékony, tool-alapú orchestrátor-agent** (saját `AgentDefinition`, két route-tool) + **flow-lock rövidzár** + **mesh-delegálás** a package-agentnél | B) klasszifikátor (`generateObject`, nincs saját agent); C) router/csillag, mindig az orchestratoron át, rövidzár nélkül | A) illeszkedik a meglévő agent-mint-tool mintához és valódi "agent"-nek számít (saját prompt+Trace-kör); a flow-lock a projekt mért-költség kultúrájához illeszkedik (nem fizetünk plusz routing-hívásért minden körben egy N-köríves csomag-építésnél); C) minden körben duplázná az LLM-hívást |
| 6 | Az orchestrátor toolja **verbatim visszhangozza** a route-olt agent válaszát, nem szintetizálja újra | A query-agent `delegateToIngest`-mintája (a hívó agent maga fogalmazza meg, mi történt) | Az orchestrátor elve: "sosem válaszol, csak irányít" — a customer-facing szöveg a route-olt agent SAJÁT válasza legyen, ne egy újrafogalmazás |
| 7 | **Nincs state-tool** (`addItem`/`removeItem`) — a `validatePackage`/`savePackage` mindig a TELJES aktuális tétellistát kapja egy hívásban | Lépésenkénti cart-mutáció tool-okkal | Az `upsertProduct` "egy darab, teljes objektum, szigorú Zod" mintáját követi; kevesebb új mechanizmus |
| 8 | **Ötödik DB-szerep** (`szoba-kertesz_package`): SELECT a `products`/`customers`-en (a `validatePackage`/`savePackage` determinisztikus kódjához), SELECT+INSERT a `packages`/`package_items`-en, UPDATE/DELETE sehol | A meglévő `_rw` szerep bővítése | A projekt "N kapcsolat, N jogosultsági szint" mintáját folytatja; a `_rw` a products-specifikus ingest-agenté, nem kellene rálógnia egy másik agent írási útjára |
| 9 | A `packages.customer_id` az **egyetlen** igazságforrás, a `threads.customer_id` **változatlanul `null`** marad | A thread-et is összekötni a customer-rel mentéskor | Elkerüli egy második DB-pool (`_chat`) bevonását a package-mentésbe; a `threads.customer_id` továbbra is fenntartott, dokumentált hely marad |
| 10 | `unit_price` **árpillanatkép** mentéskor (`COALESCE(sale_price, price)` abban a pillanatban) | Mindig a jelenlegi katalógus-árra hivatkozni (FK-n át) | Egy elmentett csomag ára ne sodródjon együtt a katalógus későbbi árváltozásaival — az ajánlat azt tükrözze, amit ténylegesen felajánlottak |

## Architektúra

```
packages/core/src/lib/agents/
  orchestrator-agent/
    orchestrator-agent.ts    — askOrchestrator(question, options): AZ ÚJ belépési pont
    orchestrator-prompt.ts   — "sosem válaszolsz, csak route-olsz" prompt
    flow-lock.ts             — findLastFlowSignal(history): 'package-open' | 'none'
    flow-lock.spec.ts
  package-agent/
    package-agent.ts         — askPackageAgent(question, options)
    package-prompt.ts        — csomag-összeállítás szabályai, megerősítés-kényszer
packages/core/src/lib/tools/
  route-to-package/route-to-package-tool.ts   — orchestrátor toolja, askPackageAgent-et hívja
  route-to-info/route-to-info-tool.ts         — orchestrátor toolja, askAgent-et hívja
  ask-info-agent/ask-info-agent-tool.ts       — package-agent toolja, askAgent-et hívja
  package/
    validate-package-tool.ts  — determinisztikus check (készlet, pet/kid-safe, budget)
    save-package-tool.ts      — az EGYETLEN írási út a packages/package_items-re
    cancel-package-tool.ts    — jelző-tool, nem ír DB-be
```

`askOrchestrator` a belépési ponton eldönti a flow-lock állapotát:

- **`'none'`** (nincs nyitott csomag-flow): lefuttatja a saját, minimális
  `AgentDefinition`-jét (`maxSteps: 2`, `toolChoice: 'required'`) a `routeToPackageAgent` /
  `routeToInfoAgent` toolokkal. Az első kör kiválasztja a route-ot, a második kör (a prompt
  előírása szerint) szó szerint visszaadja a tool eredményét.
- **`'package-open'`**: **az orchestrátor LLM-hívása ki sem megy** — egyenesen
  `askPackageAgent`-et hívja. Ez tartja alacsonyan a költséget egy többköríves
  csomag-építésnél (a `docs/roi.md` mért-költség kultúrájával összhangban).

A belépési pontok cseréje: `apps/cli/src/main.ts`, `interactive.ts`, `apps/server/src/app.ts`
`askAgent` → `askOrchestrator`, **ugyanaz az `AskResult` alak**. A `golden-run.ts` **nem**
vált — az kifejezetten a RAG-pipeline-t méri, nem a terméket.

A package-agent a katalógus/tudásbázis/ügyfél-lekérdezéshez a meglévő `askAgent`-et hívja a
saját `askInfoAgent` toolja mögött, **mindig `role: 'customer'`**-ként, függetlenül a külső
beszélgetés szerepétől — egy köztes infó-lekérdezés sosem kaphatja meg a `delegateToIngest`-et.

## Adatmodell

Két új Prisma-modell (`packages/db/prisma/schema.prisma`):

```prisma
model Package {
  id          String        @id @default(uuid()) @db.Uuid
  customerId  Int           @map("customer_id")
  customer    Customer      @relation(fields: [customerId], references: [id])
  totalPrice  Decimal       @map("total_price") @db.Decimal(12, 2)
  createdAt   DateTime      @default(now()) @map("created_at")
  items       PackageItem[]

  @@map("packages")
}

model PackageItem {
  id         Int      @id @default(autoincrement())
  packageId  String   @map("package_id") @db.Uuid
  package    Package  @relation(fields: [packageId], references: [id], onDelete: Cascade)
  productId  Int      @map("product_id")
  product    Product  @relation(fields: [productId], references: [id])
  quantity   Int
  unitPrice  Decimal  @map("unit_price") @db.Decimal(12, 2)

  @@map("package_items")
}
```

Nincs `status` mező: a `packages` tábla csak **mentett, jóváhagyott** csomagokat tartalmaz —
a `validatePackage` visszautasított kísérletei sosem érnek el a DB-ig, tehát nincs "draft"
állapot, amit tárolni kellene.

## Jogosultságok

Ötödik szerep, `szoba-kertesz_package`:

- `SELECT` a `products`-on és a `customers`-en (a determinisztikus `validatePackage`/
  `savePackage` ellenőrzéshez — ez NEM a modell generálta SQL, hanem alkalmazáskód).
- `SELECT` + `INSERT` a `packages`-en és a `package_items`-en.
- **Nincs UPDATE, nincs DELETE** sehol — egy mentett csomag append-only, mint a `messages`.

Migráció: `<ts>_package_role` (a `<ts>_chat_role` mintáját követve — csak új konténernél fut
le, tehát a szerep és a grantok elsődleges forrása itt is a migráció, nem az `init.sql`, amit
ennek megfelelően bővíteni kell).

## Komponensek

**`routeToPackageAgent` / `routeToInfoAgent`** — a `delegateToIngestTool` szerkezeti mása:
`execute` meghívja a beágyazott loopot, a teljes választ `content`-ként adja vissza, saját
JSONL-sort ír, sosem dob tovább. Az orchestrátor `streamText`-hívásán `toolChoice: 'required'`.

**`flow-lock.ts`** — `findLastFlowSignal(history: readonly Message[]): 'package-open' |
'none'`. Végigmegy a history tool-hívásain, megkeresi a `routeToPackageAgent` /
`savePackage` / `cancelPackage` közül időrendben az utolsót; ha `routeToPackageAgent`,
`'package-open'`, egyébként `'none'`. Tiszta függvény, fixture-üzenettömbökön tesztelve.

**A package-agent toolkészlete:**

- `askInfoAgent` — köztes konzultáció a query-agenttel (katalógus/tudásbázis/ügyfél).
- `validatePackage` — bemenet `{ customerId, items: [{ productId, quantity }] }` (szigorú
  Zod). Ellenőrzi: minden `productId` létezik és van készleten a kért mennyiségben; ha a
  customer `pet_safe_required`/`kid_safe_required`, minden tétel megfelel; a tételek
  `difficulty`-je nem haladja meg a customer `expertise_level`-jét; az összár
  (`Σ COALESCE(sale_price, price) × quantity`) nem lépi túl a customer `budget`-jét. Nem
  dob hibát szabálysértésnél — strukturált, olvasható visszajelzést ad.
- `savePackage` — ugyanaz a bemeneti alak, **újra validál mentés előtt**, majd egy
  tranzakcióban beszúrja a `Package` + `PackageItem` sorokat, visszaadja az új `id`-t.
- `cancelPackage` — jelző-tool, csak a flow-lock zárásához kell.

Nincs `addItem`/`removeItem` — a package-agent a beszélgetés kontextusában tartja a készülő
csomagot, a `validatePackage`/`savePackage` mindig a teljes, aktuális tétellistát kapja.

## Adatfolyam (happy path)

1. Ügyfél: "Állíts össze egy csomagot a nappalimba, 30 000 Ft-ig, van macskám." →
   `askOrchestrator` → lock `'none'` → orchestrátor route-ol → `routeToPackageAgent`.
2. Package-agent `askInfoAgent`-tel keres pet-safe, alkalmas növényeket a büdzsén belül,
   összeállít egy javaslatot, megmutatja.
3. Ügyfél visszajelez, package-agent finomít — **ez a kör már lock `'package-open'`, az
   orchestrátor LLM-hívása ki sem megy.**
4. Ügyfél jóváhagyja → `validatePackage` → összesítő → "Ez így rendben van?" → ügyfél "igen"
   → `savePackage` → a lock a következő körre `'none'`-ra vált (a történet legutolsó jelzése
   `savePackage`).

## Hibakezelés

- **Az orchestrátor egyik route-tool-t sem hívja** (a `toolChoice: 'required'` ellenére sem
  100%-ig garantált egy streamelő modellnél) → fallback: `routeToInfoAgent`, mint a
  biztonságosabb, csak-olvasó út; a Trace-ben anomáliaként jelölve.
- **`validatePackage` szabálysértést talál** → nem hiba (`isError: false`), a modell a
  szöveges visszajelzésből ajánl korrekciót az ügyfélnek.
- **`savePackage` DB-hiba** (kapcsolat, constraint) → elkapva, magyar üzenet,
  `isError: true`, sosem dobja tovább — mint a `delegateToIngest`.
- **Megszakadt package-agent-futás** (rate limit, lépéskorlát) → a meglévő
  `[MEGSZAKADT]` mechanizmus fedezi (`agent-loop.ts`); a lock **helyesen nyitva marad**
  (nincs `savePackage`/`cancelPackage` jel a history-ban), a következő üzenet onnan
  folytatja, ahol abbamaradt — ez a pure-function flow-lock természetes mellékhatása, nem
  külön kezelendő eset.
- **Off-topic üzenet nyitott flow alatt** ("mégis mi a visszaküldési szabály?") → a lock
  ettől függetlenül a package-agenthez küldi; a package-agent promptja kezeli (rövid válasz
  `askInfoAgent`-tel, vagy felajánlja a `cancelPackage`-t).

## Doksi-szinkron

CLAUDE.md (négy → **öt** agent, az új `agents/`/`tools/` könyvtárak, az ötödik DB-kapcsolat,
a belépési pont csere), README (a "Toolok" lista, a szerep-szakasz, a minőségi kapuk táblázat
új spec-fájlokkal), `docs/architektura-monorepo.md`, `docs/tech-stack.md` (a két új tábla),
`docs/implementacios-terv.md` (a "Hol tart a terv" táblázat — a C fázis innentől NEM
"kimaradt"), `.env.example`, `init.sql`.

## Amit szándékosan NEM csinálunk

- **Látható UI-handover** (chip, melyik agent beszél épp) — külön kör, a 4. döntés szerint.
- **`flow-test` mérőeszköz** (LLM-as-user forgatókönyvek, automatikus értékelés) — külön kör,
  ahogy az `autotest` is önálló kör volt a 08. alkalmon.
- **`ORCHESTRATION_MODE` env-kapcsoló** (off/router/delegate) — a projekt konvenciója
  kifejezetten elveti a felesleges feature flag-eket; a flow-lockos "delegate" topológia az
  EGYETLEN, amit megépítünk, nincs runtime-váltható alternatíva.
- **Router (csillag) topológia** — lásd 5. döntés; a flow-lock helyettesíti.
- **`threads.customer_id` kitöltése** — lásd 9. döntés; a mező változatlanul fenntartott,
  `null` marad.
- **Csomag-módosítás vagy -törlés mentés után** — a `packages`/`package_items` append-only,
  nincs "szerkeszd a korábbi ajánlatot" funkció ebben a körben.
- **Készlet-csökkentés mentéskor** — a `savePackage` nem foglal és nem csökkent `stock`-ot; a
  csomag egy **ajánlat** (a lakberendező eszköze az ügyfele felé), nem valós
  rendelés-checkout, összhangban a BRS eredeti scope-kizárásával ("Rendelés/bevétel adat,
  írás vagy módosítás" — `docs/brs-szoba-kertesz.md` 3. pont). A `validatePackage` ezért
  mindig a `products.stock` AKTUÁLIS értékét nézi, nem von le belőle korábbi mentett
  csomagokat.
- **`pnpm demo` script, demó-branchek** — nálunk nincsenek, mint a 07. alkalomnál sem.

## Sikerkritériumok — megfigyelhető viselkedés

1. "Állíts össze egy csomagot [szoba] számára, [büdzsé] Ft-ig, [ügyfél-igény]" típusú kérés
   után a package-agent végigviszi a flow-t egy `validatePackage` összesítőig, majd explicit
   "igen" után `savePackage`-dzsel valódi sort ír a `packages`/`package_items` táblákba.
2. Egy 3+ köríves csomag-építés alatt a Trace **egyetlen** `routeToPackageAgent`
   tool-hívást mutat (az első körben) — a további körök egyenesen a package-agentet futtatják,
   plusz orchestrátor-hívás nélkül.
3. A `validatePackage` egy büdzsén túllépő vagy nem pet-safe javaslatot **elutasít**,
   olvasható indoklással, és a modell ezt megmutatja az ügyfélnek — a `savePackage` ilyenkor
   nem fut le, nincs DB-írás.
4. A `szoba-kertesz_package` szerepen `UPDATE packages SET …` és `DELETE FROM package_items`
   → `permission denied` — mérve, nem csak dokumentálva.
5. Egy katalógus- vagy gondozási kérdés (nem csomag-építés) a régi, egy-köríves úton fut:
   orchestrátor → `routeToInfoAgent` → a query-agent válasza szó szerint megjelenik.
6. A meglévő `autotest:battery` **mind a 29 esete** változatlanul zöld az `askOrchestrator`
   belépési pont mögött — nincs regresszió a meglévő katalógus/RAG-viselkedésben.
7. `pnpm nx run-many -t typecheck lint build` és a célzott, DB nélküli spec-csomagok
   (`autotest`, `mcp`, `server`, `web`) zöldek; a DB-s `core`-specek (a `validate-package`/
   `save-package`/`db-readwrite-package` specekkel bővülve) helyi, seedelt Postgresen zöldek.
