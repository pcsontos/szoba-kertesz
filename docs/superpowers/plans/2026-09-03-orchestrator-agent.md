# Orchestrátor-agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bevezetni egy negyedik és ötödik agentet (`orchestrator-agent`, `package-agent`) a szoba-kertesz projektbe, amivel a rendszer először képes végigvinni egy teljes növénycsomag összeállítását egy ügyfélnek — validálással és mentés előtti megerősítéssel —, a query-agent (mostantól "info-agent" szerepben) és az ingest-agent érintetlenül hagyása mellett.

**Architecture:** Az orchestrátor egy vékony, tool-alapú `AgentDefinition` (két route-tool: `routeToPackageAgent` / `routeToInfoAgent`, mindkettő agent-mint-tool a meglévő `delegateToIngestTool` mintájára), és promptja szerint a route-olt agent válaszát SZÓ SZERINT adja vissza. Egy **flow-lock** (tiszta függvény, a history tool-hívásaiból olvas) rövidre zárja az orchestrátor-hívást, amíg egy csomag-flow nyitva van — a package-agentet ilyenkor közvetlenül hívjuk. A package-agent determinisztikus toolokkal (`validatePackage`/`savePackage`) épít és ment egy csomagot egy ötödik DB-szerepen (`szoba-kertesz_package`, SELECT a `products`/`customers`-en, SELECT+INSERT a két új `packages`/`package_items` táblán, append-only).

**Tech Stack:** TypeScript strict, Vercel AI SDK 7 (`streamText`, `tool`), Zod, `pg` (paraméterezett SQL, tranzakció), Prisma (séma+migráció), Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-orchestrator-agent-design.md`

## Global Constraints

- TypeScript strict; `unknown` a nem megbízható inputra, Zod-validáció a rendszerhatáron (`docs/konvenciók.md`).
- Minden tool a közös `ToolOutcome` alakot adja vissza, és SOSEM dob — a hiba is a modellnek visszaadható magyar szöveg.
- A modellnek/felhasználónak szóló szövegek (prompt, tool-leírás, hibaüzenet) MAGYARUL; a kódkommentek is magyarul, a meglévő stílus szerint.
- Nincs `ORCHESTRATION_MODE` kapcsoló és nincs router/csillag topológia — EGYETLEN, mindig aktív útvonal (a spec 5. döntése).
- A `packages`/`package_items` táblák APPEND-ONLY: az új DB-szerep csak SELECT+INSERT-et kap, UPDATE/DELETE-et sehol.
- A `savePackage` NEM csökkent `stock`-ot — a csomag ajánlat, nem valós rendelés-checkout (a spec "Amit szándékosan NEM csinálunk" szakasza).
- `packages/core` marad framework-független — az új agentek/toolok NEM tudhatnak a CLI-ről vagy a HTTP-ről.
- A `threads.customer_id` változatlanul `null` marad ebben a körben — a `packages.customer_id` az egyetlen igazságforrás.

---

## Task 1: Adatmodell — `packages` + `package_items` tábla

**Files:**
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<ts>_packages/migration.sql` (Prisma generálja)

**Interfaces:**
- Produces: `packages` tábla (`id UUID`, `customer_id INT` FK, `total_price NUMERIC(12,2)`, `created_at`), `package_items` tábla (`id SERIAL`, `package_id UUID` FK cascade, `product_id INT` FK, `quantity INT`, `unit_price NUMERIC(12,2)`).

- [ ] **Step 1: Séma bővítése**

`packages/db/prisma/schema.prisma` végére (a `Message` modell UTÁN) illeszd be:

```prisma
// packages + package_items — a CSOMAG-ÉPÍTÉS eredménye. A package-agent validatePackage/
// savePackage toolja ír ide, a szoba-kertesz_package szerepen. APPEND-ONLY: nincs UPDATE,
// nincs DELETE-grant — egy elmentett csomag nem szerkeszthető vagy törölhető innentől.
//
// Az id itt is UUID, dbgenerated()-del (NEM Prisma-kliens-oldali @default(uuid())): a
// savePackage NYERS SQL INSERT-tel ír, tehát a DB-nek magának kell generálnia az azonosítót,
// ahogy a Thread modellnél is (lásd ott a kommentet).
model Package {
  id          String        @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  customerId  Int           @map("customer_id")
  customer    Customer      @relation(fields: [customerId], references: [id])
  totalPrice  Decimal       @map("total_price") @db.Decimal(12, 2)
  createdAt   DateTime      @default(now()) @map("created_at")
  items       PackageItem[]

  @@map("packages")
}

// A unitPrice ÁRPILLANATKÉP mentéskor (COALESCE(sale_price, price) abban a pillanatban) —
// egy elmentett csomag ára ne sodródjon a katalógus KÉSŐBBI árváltozásaival.
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

A `Customer` modellhez (a meglévő `threads Thread[]` sor alá) add hozzá a visszairányú relációt:

```prisma
  packages        Package[]
```

A `Product` modellhez (a `@@map("products")` elé) add hozzá:

```prisma
  packageItems    PackageItem[]
```

- [ ] **Step 2: Migráció generálása és alkalmazása**

A repo gyökeréről:

```bash
pnpm exec prisma migrate dev --name packages
```

Ez a helyi fejlesztői adatbázisra AZONNAL alkalmazza az új táblákat (biztonságos, additív — csak `CREATE TABLE`, nem érint meglévő adatot) és létrehozza a `packages/db/prisma/migrations/<ts>_packages/migration.sql` fájlt.

- [ ] **Step 3: Ellenőrzés**

```bash
docker compose exec postgres psql -U "$POSTGRES_ADMIN_USER" -d szoba-kertesz -c '\d packages'
docker compose exec postgres psql -U "$POSTGRES_ADMIN_USER" -d szoba-kertesz -c '\d package_items'
```

Várt: mindkét tábla létezik a fenti oszlopokkal, és a `package_items_package_id_fkey` / `package_items_product_id_fkey` / `packages_customer_id_fkey` idegen kulcsok szerepelnek.

- [ ] **Step 4: Commit**

```bash
git add packages/db/prisma/schema.prisma packages/db/prisma/migrations/
git commit -m "feat: packages és package_items tábla (Task 1)"
```

---

## Task 2: Ötödik DB-szerep — `szoba-kertesz_package`

**Files:**
- Create: `packages/db/prisma/migrations/<ts2>_package_role/migration.sql` (kézzel írt, `<ts2>` > a Task 1 migráció időbélyege)
- Modify: `init.sql`
- Modify: `.env.example`
- Modify: `packages/core/src/lib/config.ts`
- Modify: `packages/core/src/lib/config.spec.ts`

**Interfaces:**
- Produces: `Config.databaseUrlPackage?: string` (opcionális, mint a `databaseUrlReadWrite`).

- [ ] **Step 1: A régi teszt megbukik — új mezőt várunk a configtól**

`packages/core/src/lib/config.spec.ts`-ben cseréld ki a `Object.keys(config).sort()` állítást (a `'reads DATABASE_URL_READWRITE...'` teszt előtti, `'reads DATABASE_URL_READONLY into the config...'` teszten belüli blokkot):

```ts
  it('reads DATABASE_URL_READONLY into the config, but never DATABASE_URL (the admin/RW one)', () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DATABASE_URL: 'postgresql://admin:secret@localhost:5433/szoba-kertesz',
      DATABASE_URL_READONLY: READONLY_URL,
    });

    expect(config.databaseUrlReadonly).toEqual(READONLY_URL);
    expect(config).not.toHaveProperty('databaseUrl');
    expect(Object.keys(config).sort()).toEqual([
      'anthropicApiKey',
      'anthropicModel',
      'databaseUrlChat',
      'databaseUrlPackage',
      'databaseUrlReadWrite',
      'databaseUrlReadonly',
      'openaiApiKey',
    ]);
  });
```

A fájl VÉGÉRE (az utolsó `it` blokk után, a záró `});` elé) illessz be egy új tesztet:

```ts
  it('reads DATABASE_URL_PACKAGE when given, but stays optional without it', () => {
    // Az ÖTÖDIK jogosultsági szint (szoba-kertesz_package) csak a package-agent
    // validatePackage/savePackage útjáé. Opcionális, mert a katalógus/gondozás
    // kérdés-válasz oldal enélkül is teljesen működik — a hiányt a db-package.ts
    // jelzi, ott, ahol tényleg számít.
    const PACKAGE_URL = 'postgresql://pkg:pkg@localhost:5433/szoba-kertesz';
    const withPackage = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DATABASE_URL_READONLY: READONLY_URL,
      DATABASE_URL_PACKAGE: PACKAGE_URL,
    });
    const withoutPackage = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DATABASE_URL_READONLY: READONLY_URL,
    });

    expect(withPackage.databaseUrlPackage).toEqual(PACKAGE_URL);
    expect(withoutPackage.databaseUrlPackage).toBeUndefined();
  });
```

- [ ] **Step 2: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern config.spec.ts
```

Várt: FAIL — a `Object.keys` állítás hiányolja a `databaseUrlPackage` kulcsot, az új teszt pedig `undefined`-et kap `'databaseUrlPackage' in config` helyett (a mező még nem létezik a típuson/visszatérésen).

- [ ] **Step 3: `config.ts` bővítése**

`packages/core/src/lib/config.ts`-ben az `EnvSchema` `DATABASE_URL_CHAT` sora UTÁN:

```ts
  // Csak a package-agent validatePackage/savePackage útjához kell (szoba-kertesz_package
  // szerep) — a katalógus/gondozás kérdés-válasz oldal enélkül is teljesen működik, ezért
  // OPCIONÁLIS, mint a READWRITE, a CHAT és az OPENAI_API_KEY. A hiányát a
  // tools/package/db-package.ts jelzi, fail-fast, érthető magyar üzenettel.
  DATABASE_URL_PACKAGE: z.string().min(1).optional(),
```

A `Config` interfészben a `databaseUrlChat?: string;` sor UTÁN:

```ts
  readonly databaseUrlPackage?: string;
```

A `loadConfig` visszatérési objektumában a `databaseUrlChat: parsed.data.DATABASE_URL_CHAT,` sor UTÁN:

```ts
    databaseUrlPackage: parsed.data.DATABASE_URL_PACKAGE,
```

A fájl doc-commentjében (a négy jogosultsági szintet felsoroló blokk) egészítsd ki egy ötödik ponttal, ugyanabban a stílusban, mint a többi.

- [ ] **Step 4: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern config.spec.ts
```

Várt: PASS.

- [ ] **Step 5: `init.sql` bővítése**

`init.sql`-ben a `szoba-kertesz_chat` szerepet létrehozó `DO $$ ... END $$;` blokk UTÁN (a fájl végére):

```sql
-- Az ÖTÖDIK szerep: a csomag-építés útja (a package-agent validatePackage/savePackage
-- toolja). A grantok a <ts2>_package_role migrációban vannak, nem itt — az init.sql a
-- products/customers táblák létrehozása ELŐTT fut, tehát itt csak a szerep jöhet létre.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'szoba-kertesz_package') THEN
    CREATE ROLE "szoba-kertesz_package" LOGIN PASSWORD 'szoba-kertesz_package';
  END IF;
END
$$;
```

- [ ] **Step 6: A hand-written migráció**

Válassz egy időbélyeget, ami KÉSŐBBI, mint a Task 1-ben generált `<ts>_packages` mappáé (pl. `date -u +%Y%m%d%H%M%S`), és hozd létre:

```bash
mkdir -p "packages/db/prisma/migrations/<ts2>_package_role"
```

`packages/db/prisma/migrations/<ts2>_package_role/migration.sql`:

```sql
-- Az ÖTÖDIK szerep: a csomag-építés útja. A jogosultsági szétvágás nálunk nem prompt-szabály,
-- hanem Postgres-jog — ez a fájl a <ts>_db_roles migráció folytatása, a <ts>_chat_role
-- mintájára.
--
-- FONTOS: ennek a migrációnak a packages/package_items táblák létrehozása (Task 1) UTÁN kell
-- futnia (a fájlnév időbélyege dönt), különben a GRANT nem létező táblára hivatkozna.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'szoba-kertesz_package') THEN
    CREATE ROLE "szoba-kertesz_package" LOGIN PASSWORD 'szoba-kertesz_package';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE "szoba-kertesz" TO "szoba-kertesz_package";
GRANT USAGE ON SCHEMA public TO "szoba-kertesz_package";

-- OLVASÁS a determinisztikus validáláshoz (products, customers) — ez NEM a modell generálta
-- SQL, hanem a validatePackage/savePackage saját, kódból fixált lekérdezése (lásd
-- tools/package/package-validation.ts).
GRANT SELECT ON TABLE products TO "szoba-kertesz_package";
GRANT SELECT ON TABLE customers TO "szoba-kertesz_package";

-- ÍRÁS kizárólag a csomag-táblákra, APPEND-ONLY: nincs UPDATE, nincs DELETE.
GRANT SELECT, INSERT ON TABLE packages TO "szoba-kertesz_package";
GRANT SELECT, INSERT ON TABLE package_items TO "szoba-kertesz_package";
GRANT USAGE, SELECT ON SEQUENCE package_items_id_seq TO "szoba-kertesz_package";
```

Alkalmazd:

```bash
pnpm db:migrate
```

- [ ] **Step 7: Ellenőrzés**

```bash
docker compose exec postgres psql -U "$POSTGRES_ADMIN_USER" -d szoba-kertesz -c "\du szoba-kertesz_package"
```

Várt: a szerep létezik, LOGIN-nal.

- [ ] **Step 8: `.env.example` bővítése**

A `DATABASE_URL_CHAT` sor és leírása UTÁN:

```
#   DATABASE_URL_PACKAGE    the szoba-kertesz_package role. The package-agent's
#                          validatePackage/savePackage path ONLY: SELECT on products +
#                          customers (deterministic checks), SELECT + INSERT on packages +
#                          package_items — no UPDATE, no DELETE (append-only, like messages).
#                          OPTIONAL — leave it out and the catalog/care question-answer side
#                          still works fully; only package building fails, with a clear message.
```

```
DATABASE_URL_PACKAGE=postgresql://szoba-kertesz_package:szoba-kertesz_package@localhost:5433/szoba-kertesz
```

- [ ] **Step 9: Commit**

```bash
git add packages/db/prisma/migrations/ init.sql .env.example packages/core/src/lib/config.ts packages/core/src/lib/config.spec.ts
git commit -m "feat: ötödik DB-szerep (szoba-kertesz_package) a csomag-építéshez (Task 2)"
```

---

## Task 3: `db-package.ts` — pool, lekérdezés, tranzakció

**Files:**
- Create: `packages/core/src/lib/tools/package/db-package.ts`
- Create: `packages/core/src/lib/tools/package/db-package.spec.ts`

**Interfaces:**
- Produces: `queryPackage<T>(sql, values?, deps?): Promise<QueryResult<T>>`, `withPackageTransaction<T>(run: (client: PoolClient) => Promise<T>, deps?): Promise<T>`, `closePackagePool(): Promise<void>`, `interface DbPackageDeps { pool?: Pool; config?: Config }`.
- Consumes: `loadConfig`, `Config` (`../../config.js`).

- [ ] **Step 1: A DB-role-guarantee spec (előbb, valódi DB ellen)**

`packages/core/src/lib/tools/package/db-package.spec.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { closePackagePool, queryPackage, withPackageTransaction } from './db-package.js';

// Lásd upsert-product/db-readwrite.spec.ts — ugyanaz a minta: a repo gyökerén lévő .env
// explicit betöltése, mert a vitest cwd-je packages/core.
const here = dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = resolve(here, '../../../../../../.env');
try {
  process.loadEnvFile(repoRootEnvPath);
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

/**
 * A szoba-kertesz_package szerep jogosultsági határai valódi DB-n — a db-readwrite.spec.ts
 * és a thread-store DB-specjeinek mintájára: a határokat nem a prompt őrzi, hanem a Postgres
 * szerepkör.
 */
describe('db-package — a szoba-kertesz_package szerep jogosultsági határai', () => {
  afterAll(async () => {
    await closePackagePool();
  });

  it('olvasni tud a products és a customers táblából', async () => {
    const products = await queryPackage<{ count: string }>(
      'SELECT count(*)::text AS count FROM products',
    );
    const customers = await queryPackage<{ count: string }>(
      'SELECT count(*)::text AS count FROM customers',
    );

    expect(Number(products.rows[0].count)).toBeGreaterThan(0);
    expect(Number(customers.rows[0].count)).toBeGreaterThan(0);
  });

  it('be tud szúrni egy csomagot tranzakcióban, és a tranzakció COMMIT-tal zárul', async () => {
    const customer = await queryPackage<{ id: number }>(
      'SELECT id FROM customers LIMIT 1',
    );
    const customerId = customer.rows[0].id;

    const packageId = await withPackageTransaction(async (client) => {
      const result = await client.query<{ id: string }>(
        'INSERT INTO packages (customer_id, total_price) VALUES ($1, $2) RETURNING id',
        [customerId, 1000],
      );
      return result.rows[0].id;
    });

    const inserted = await queryPackage<{ id: string }>(
      'SELECT id FROM packages WHERE id = $1',
      [packageId],
    );
    expect(inserted.rowCount).toBe(1);

    // Takarítás ADMIN kapcsolaton — a package szerepnek nincs DELETE joga.
    const admin = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await admin.query('DELETE FROM packages WHERE id = $1', [packageId]);
    } finally {
      await admin.end();
    }
  });

  it('a tranzakció ROLLBACK-el zárul, ha a run-függvény dob', async () => {
    const customer = await queryPackage<{ id: number }>(
      'SELECT id FROM customers LIMIT 1',
    );
    const customerId = customer.rows[0].id;

    await expect(
      withPackageTransaction(async (client) => {
        await client.query(
          'INSERT INTO packages (customer_id, total_price) VALUES ($1, $2)',
          [customerId, 1000],
        );
        throw new Error('szándékos hiba a rollback teszteléséhez');
      }),
    ).rejects.toThrow(/szándékos hiba/);

    const remaining = await queryPackage<{ count: string }>(
      'SELECT count(*)::text AS count FROM packages WHERE customer_id = $1 AND total_price = 1000',
      [customerId],
    );
    expect(Number(remaining.rows[0].count)).toBe(0);
  });

  it('frissíteni NEM tud — a packages append-only', async () => {
    await expect(
      queryPackage('UPDATE packages SET total_price = total_price WHERE false'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('törölni NEM tud', async () => {
    await expect(
      queryPackage('DELETE FROM packages WHERE false'),
    ).rejects.toThrow(/permission denied/i);
  });

  it('a customers táblát NEM tudja módosítani — csak SELECT joga van rajta', async () => {
    await expect(
      queryPackage('UPDATE customers SET notes = notes WHERE false'),
    ).rejects.toThrow(/permission denied/i);
  });
});
```

- [ ] **Step 2: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern db-package.spec.ts
```

Várt: FAIL — a `./db-package.js` modul nem létezik.

- [ ] **Step 3: `db-package.ts` implementálása**

```ts
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { loadConfig, type Config } from '../../config.js';

/**
 * A csomag-építés EGYETLEN adatbázis-kapcsolati rétege: kizárólag a DATABASE_URL_PACKAGE
 * (a szoba-kertesz_package szerep) kapcsolati stringjét használja. A db-chat.ts és a
 * db-readwrite.ts mintája, negyedszer.
 *
 * A tranzakció-helper (withPackageTransaction) ÚJ ebben a fájlban: a savePackage KÉT táblába
 * ír (packages + package_items), és ha az items-INSERT elhasal, a package-sor sem maradhat
 * árva — az upsertProduct egyetlen ON CONFLICT-os statementje itt nem elég, mert két
 * KÜLÖNBÖZŐ táblát érint.
 */
export interface DbPackageDeps {
  readonly pool?: Pool;
  readonly config?: Config;
}

let sharedPool: Pool | undefined;

function resolvePool(deps: DbPackageDeps): Pool {
  if (deps.pool) {
    return deps.pool;
  }
  if (!sharedPool) {
    const config = deps.config ?? loadConfig();
    if (!config.databaseUrlPackage) {
      throw new Error(
        'Hiányzó DATABASE_URL_PACKAGE — a csomag-építés ezen a kapcsolaton megy ' +
          '(szoba-kertesz_package szerep). Vedd fel a .env fájlba; a katalógus- és ' +
          'gondozási kérdések enélkül is működnek.',
      );
    }
    sharedPool = new Pool({
      connectionString: config.databaseUrlPackage,
      max: 4,
    });
  }
  return sharedPool;
}

/** Paraméterezett lekérdezés a csomag-kapcsolaton. String-konkatenáció SOHA. */
export async function queryPackage<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
  deps: DbPackageDeps = {},
): Promise<QueryResult<T>> {
  return resolvePool(deps).query<T>(sql, values);
}

/**
 * BEGIN → run(client) → COMMIT, hiba esetén ROLLBACK. A savePackage ezt hívja: a
 * packages-sor és a package_items-sorok EGYÜTT kerülnek be, vagy egyik sem.
 */
export async function withPackageTransaction<T>(
  run: (client: PoolClient) => Promise<T>,
  deps: DbPackageDeps = {},
): Promise<T> {
  const client = await resolvePool(deps).connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Lezárja a megosztott pool-t (folyamat-leállításhoz és tesztekhez). */
export async function closePackagePool(): Promise<void> {
  if (!sharedPool) {
    return;
  }
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
}
```

- [ ] **Step 4: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern db-package.spec.ts
```

Várt: PASS (élő, seedelt Postgres kell hozzá — `docker compose up -d` + `pnpm db:migrate` + `pnpm db:seed` már megtörtént az előző taskokban).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lib/tools/package/db-package.ts packages/core/src/lib/tools/package/db-package.spec.ts
git commit -m "feat: db-package.ts — pool és tranzakció-helper a csomag-építéshez (Task 3)"
```

---

## Task 4: `package-schema.ts` + `package-validation.ts` (a determinisztikus ellenőrzés)

**Files:**
- Create: `packages/core/src/lib/tools/package/package-schema.ts`
- Create: `packages/core/src/lib/tools/package/package-validation.ts`
- Create: `packages/core/src/lib/tools/package/package-validation.spec.ts`
- Create: `packages/core/src/lib/tools/package/package-validation-db.spec.ts`

**Interfaces:**
- Consumes: `queryPackage`, `DbPackageDeps` (Task 3), `DIFFICULTY` (`../upsert-product/product-schema.js`, meglévő export).
- Produces: `PackageItemInputSchema`, `PackageInputSchema`, `type PackageInput`, `checkPackage(input: PackageInput, deps?: DbPackageDeps): Promise<PackageCheckResult>`, `type PackageCheckResult`, `type PackageViolation`.

- [ ] **Step 1: `package-schema.ts`**

```ts
import { z } from 'zod';

// package-schema.ts — a csomag-építő toolok (validatePackage, savePackage) KÖZÖS bemeneti
// sémája. A product-schema.ts mintájára: a Zod-séma egy helyen, a toolok mellett. Nincs
// enum mező (a customerId/productId/quantity mind egyszerű szám), ezért nem kell külön,
// engedékenyebb SDK-elülső séma, mint az upsertProduct-nál — ez a séma egyszerre az AI-SDK
// felé eső inputSchema ÉS a belső re-validáció alapja.

export const PackageItemInputSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});

export type PackageItemInput = z.infer<typeof PackageItemInputSchema>;

export const PackageInputSchema = z
  .object({
    customerId: z.number().int().positive(),
    items: z.array(PackageItemInputSchema).min(1),
  })
  .strict();

export type PackageInput = z.infer<typeof PackageInputSchema>;
```

- [ ] **Step 2: A validáció UNIT specje (mockolt DB-lekérdezéssel, előbb — bukjon)**

`packages/core/src/lib/tools/package/package-validation.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import { checkPackage } from './package-validation.js';
import type { PackageInput } from './package-schema.js';

/**
 * A checkPackage a DETERMINISZTIKUS szabály (nem LLM-döntés) — mockolt pool-lal, valódi DB
 * nélkül teszteljük a döntési ágakat. A DB-n futó forgatókönyvek (valódi seed-adat)
 * package-validation-db.spec.ts-ben vannak.
 */

function fakePool(
  customerRow: Record<string, unknown> | undefined,
  productRows: Record<string, unknown>[],
): Pool {
  let call = 0;
  return {
    query: async (): Promise<QueryResult> => {
      call += 1;
      if (call === 1) {
        return {
          rows: customerRow ? [customerRow] : [],
          rowCount: customerRow ? 1 : 0,
        } as QueryResult;
      }
      return { rows: productRows, rowCount: productRows.length } as QueryResult;
    },
  } as unknown as Pool;
}

const CUSTOMER = {
  budget: 10000,
  pet_safe_required: true,
  kid_safe_required: false,
  expertise_level: 'kezdő',
};

const PRODUCT = {
  id: 1,
  name: 'Teszt növény',
  stock: 5,
  pet_safe: true,
  kid_safe: true,
  difficulty: 'kezdő',
  unit_price: 2000,
};

const validInput: PackageInput = {
  customerId: 1,
  items: [{ productId: 1, quantity: 2 }],
};

describe('checkPackage', () => {
  it('rendben talál egy érvényes, kereten belüli csomagot', async () => {
    const pool = fakePool(CUSTOMER, [PRODUCT]);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
    expect(result.totalPrice).toBe(4000);
    expect(result.items).toEqual([
      { productId: 1, name: 'Teszt növény', quantity: 2, unitPrice: 2000, lineTotal: 4000 },
    ]);
  });

  it('elutasítja, ha nincs ilyen ügyfél', async () => {
    const pool = fakePool(undefined, []);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.code).toBe('unknown_customer');
  });

  it('elutasítja, ha a kért termék nem létezik', async () => {
    const pool = fakePool(CUSTOMER, []);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations[0]?.code).toBe('unknown_product');
  });

  it('elutasítja, ha nincs elég készlet', async () => {
    const pool = fakePool(CUSTOMER, [{ ...PRODUCT, stock: 1 }]);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('out_of_stock');
  });

  it('elutasítja, ha az ügyfélnek pet-safe kell, a termék meg nem az', async () => {
    const pool = fakePool(CUSTOMER, [{ ...PRODUCT, pet_safe: false }]);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('not_pet_safe');
  });

  it('elutasítja, ha a termék nehézségi szintje meghaladja az ügyfél hozzáértését', async () => {
    const pool = fakePool(CUSTOMER, [{ ...PRODUCT, difficulty: 'profi' }]);

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('too_difficult');
  });

  it('elutasítja, ha az összár meghaladja a keretet', async () => {
    const pool = fakePool(
      { ...CUSTOMER, budget: 1000 },
      [PRODUCT],
    );

    const result = await checkPackage(validInput, { pool });

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('over_budget');
  });
});
```

- [ ] **Step 3: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern package-validation.spec.ts
```

Várt: FAIL — a `./package-validation.js` modul nem létezik.

- [ ] **Step 4: `package-validation.ts` implementálása**

```ts
import { queryPackage, type DbPackageDeps } from './db-package.js';
import { DIFFICULTY } from '../upsert-product/product-schema.js';
import type { PackageInput } from './package-schema.js';

// package-validation.ts — a csomag DETERMINISZTIKUS ellenőrzése: készlet, büdzsé, pet/kid-safe
// igény, nehézségi szint. NEM LLM-döntés — a validatePackage ÉS a savePackage EGYARÁNT ezt
// hívja (a savePackage mentés előtt ÚJRA, defense in depth), hogy a szabály a kódban éljen,
// ne csak a promptban.

export interface PackageViolation {
  readonly code:
    | 'unknown_customer'
    | 'unknown_product'
    | 'out_of_stock'
    | 'not_pet_safe'
    | 'not_kid_safe'
    | 'too_difficult'
    | 'over_budget';
  readonly message: string;
}

export interface PackageLineItem {
  readonly productId: number;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly lineTotal: number;
}

export interface PackageCheckResult {
  readonly ok: boolean;
  readonly violations: readonly PackageViolation[];
  readonly items: readonly PackageLineItem[];
  readonly totalPrice: number;
  readonly customerBudget: number | null;
}

interface CustomerRow {
  readonly budget: number;
  readonly pet_safe_required: boolean;
  readonly kid_safe_required: boolean;
  readonly expertise_level: string;
}

interface ProductRow {
  readonly id: number;
  readonly name: string;
  readonly stock: number;
  readonly pet_safe: boolean;
  readonly kid_safe: boolean;
  readonly difficulty: string;
  readonly unit_price: number;
}

export async function checkPackage(
  input: PackageInput,
  deps: DbPackageDeps = {},
): Promise<PackageCheckResult> {
  const violations: PackageViolation[] = [];

  const customerResult = await queryPackage<CustomerRow>(
    'SELECT budget::float8 AS budget, pet_safe_required, kid_safe_required, expertise_level ' +
      'FROM customers WHERE id = $1',
    [input.customerId],
    deps,
  );
  const customer = customerResult.rows[0];
  if (!customer) {
    return {
      ok: false,
      violations: [
        {
          code: 'unknown_customer',
          message: `Nincs ${input.customerId} azonosítójú ügyfél.`,
        },
      ],
      items: [],
      totalPrice: 0,
      customerBudget: null,
    };
  }

  const productIds = input.items.map((item) => item.productId);
  const productResult = await queryPackage<ProductRow>(
    'SELECT id, name, stock, pet_safe, kid_safe, difficulty, ' +
      'COALESCE(sale_price, price)::float8 AS unit_price ' +
      'FROM products WHERE id = ANY($1::int[])',
    [productIds],
    deps,
  );
  const productsById = new Map(productResult.rows.map((row) => [row.id, row]));

  const items: PackageLineItem[] = [];
  let totalPrice = 0;
  const customerDifficultyRank = DIFFICULTY.indexOf(
    customer.expertise_level as (typeof DIFFICULTY)[number],
  );

  for (const requested of input.items) {
    const product = productsById.get(requested.productId);
    if (!product) {
      violations.push({
        code: 'unknown_product',
        message: `Nincs ${requested.productId} azonosítójú termék.`,
      });
      continue;
    }
    if (product.stock < requested.quantity) {
      violations.push({
        code: 'out_of_stock',
        message: `"${product.name}": csak ${product.stock} db van raktáron, ${requested.quantity} db kellene.`,
      });
    }
    if (customer.pet_safe_required && !product.pet_safe) {
      violations.push({
        code: 'not_pet_safe',
        message: `"${product.name}" nem háziállat-barát, pedig az ügyfélnek fontos.`,
      });
    }
    if (customer.kid_safe_required && !product.kid_safe) {
      violations.push({
        code: 'not_kid_safe',
        message: `"${product.name}" nem gyerekbiztos, pedig az ügyfélnek fontos.`,
      });
    }
    const productDifficultyRank = DIFFICULTY.indexOf(
      product.difficulty as (typeof DIFFICULTY)[number],
    );
    if (productDifficultyRank > customerDifficultyRank) {
      violations.push({
        code: 'too_difficult',
        message: `"${product.name}" gondozási szintje (${product.difficulty}) meghaladja az ügyfél hozzáértését (${customer.expertise_level}).`,
      });
    }

    const lineTotal = product.unit_price * requested.quantity;
    totalPrice += lineTotal;
    items.push({
      productId: product.id,
      name: product.name,
      quantity: requested.quantity,
      unitPrice: product.unit_price,
      lineTotal,
    });
  }

  if (totalPrice > customer.budget) {
    violations.push({
      code: 'over_budget',
      message: `A csomag összára (${totalPrice} Ft) meghaladja az ügyfél keretét (${customer.budget} Ft).`,
    });
  }

  return {
    ok: violations.length === 0,
    violations,
    items,
    totalPrice,
    customerBudget: customer.budget,
  };
}
```

- [ ] **Step 5: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern package-validation.spec.ts
```

Várt: PASS, mind a 7 eset.

- [ ] **Step 6: DB-integrációs spec valódi seed-adaton**

Előbb nézd meg egy valós ügyfél és egy valós termék adatait, hogy a teszt reális határértékekkel dolgozzon:

```bash
docker compose exec postgres psql -U "$POSTGRES_ADMIN_USER" -d szoba-kertesz -c "SELECT id, code, budget, expertise_level, pet_safe_required FROM customers ORDER BY id LIMIT 3;"
docker compose exec postgres psql -U "$POSTGRES_ADMIN_USER" -d szoba-kertesz -c "SELECT id, name, price, stock, difficulty, pet_safe FROM products ORDER BY id LIMIT 3;"
```

`packages/core/src/lib/tools/package/package-validation-db.spec.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { queryPackage } from './db-package.js';
import { checkPackage } from './package-validation.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = resolve(here, '../../../../../../.env');
try {
  process.loadEnvFile(repoRootEnvPath);
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

interface CustomerFixture {
  readonly id: number;
  readonly budget: number;
}
interface ProductFixture {
  readonly id: number;
  readonly price: number;
  readonly stock: number;
}

async function firstCustomer(): Promise<CustomerFixture> {
  const result = await queryPackage<CustomerFixture>(
    'SELECT id, budget::float8 AS budget FROM customers ORDER BY id LIMIT 1',
  );
  return result.rows[0];
}

async function cheapInStockProduct(): Promise<ProductFixture> {
  const result = await queryPackage<ProductFixture>(
    'SELECT id, COALESCE(sale_price, price)::float8 AS price, stock FROM products ' +
      'WHERE stock > 0 ORDER BY COALESCE(sale_price, price) ASC LIMIT 1',
  );
  return result.rows[0];
}

/**
 * A checkPackage VALÓDI seed-adaton — a mockolt unit specekkel ellentétben itt a tényleges
 * customers/products táblák tartalma dönt. A cél: bizonyítani, hogy a szoba-kertesz_package
 * szerepen keresztül fut a lekérdezés, és a mért árak/készletek a valósággal egyeznek.
 */
describe('checkPackage — valódi seed-adaton', () => {
  it('egy létező ügyfélre és egy raktáron lévő, olcsó termékre rendben talál egy 1 darabos csomagot', async () => {
    const customer = await firstCustomer();
    const product = await cheapInStockProduct();

    const result = await checkPackage({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: 1 }],
    });

    expect(result.totalPrice).toBe(product.price);
    // Csak a büdzsé-korlátot állítjuk (a többi szabály a konkrét seed-adattól függ,
    // ezért nem feltételezünk ok:true-t — a lényeg, hogy a lekérdezés valódi adatot ad).
    expect(result.customerBudget).toBe(customer.budget);
  });

  it('irreálisan nagy mennyiségre out_of_stock-ot jelez', async () => {
    const customer = await firstCustomer();
    const product = await cheapInStockProduct();

    const result = await checkPackage({
      customerId: customer.id,
      items: [{ productId: product.id, quantity: product.stock + 1000 }],
    });

    expect(result.ok).toBe(false);
    expect(result.violations.map((v) => v.code)).toContain('out_of_stock');
  });

  it('nem létező ügyfél-azonosítóra unknown_customer-t ad', async () => {
    const result = await checkPackage({
      customerId: -1,
      items: [{ productId: 1, quantity: 1 }],
    });

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual([
      { code: 'unknown_customer', message: 'Nincs -1 azonosítójú ügyfél.' },
    ]);
  });
});
```

- [ ] **Step 7: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern package-validation
```

Várt: PASS mindkét fájlra (unit + DB).

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/lib/tools/package/package-schema.ts packages/core/src/lib/tools/package/package-validation.ts packages/core/src/lib/tools/package/package-validation.spec.ts packages/core/src/lib/tools/package/package-validation-db.spec.ts
git commit -m "feat: package-validation.ts — csomag determinisztikus ellenőrzése (Task 4)"
```

---

## Task 5: `validate-package-tool.ts`

**Files:**
- Create: `packages/core/src/lib/tools/package/validate-package-tool.ts`
- Create: `packages/core/src/lib/tools/package/validate-package-tool.spec.ts`

**Interfaces:**
- Consumes: `PackageInputSchema` (Task 4), `checkPackage` (Task 4), `ToolOutcome`/`ToolReporter` (`../tool-outcome.js`).
- Produces: `VALIDATE_PACKAGE_TOOL_NAME = 'validatePackage'`, `executeValidatePackage(rawInput, deps?)`, `validatePackageTool(report?)`.

- [ ] **Step 1: A spec — előbb, bukjon**

`packages/core/src/lib/tools/package/validate-package-tool.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  VALIDATE_PACKAGE_TOOL_NAME,
  executeValidatePackage,
  validatePackageTool,
} from './validate-package-tool.js';

function fakePool(
  customerRow: Record<string, unknown> | undefined,
  productRows: Record<string, unknown>[],
): Pool {
  let call = 0;
  return {
    query: async (): Promise<QueryResult> => {
      call += 1;
      if (call === 1) {
        return {
          rows: customerRow ? [customerRow] : [],
          rowCount: customerRow ? 1 : 0,
        } as QueryResult;
      }
      return { rows: productRows, rowCount: productRows.length } as QueryResult;
    },
  } as unknown as Pool;
}

const CUSTOMER = {
  budget: 10000,
  pet_safe_required: false,
  kid_safe_required: false,
  expertise_level: 'profi',
};
const PRODUCT = {
  id: 1,
  name: 'Teszt növény',
  stock: 5,
  pet_safe: true,
  kid_safe: true,
  difficulty: 'kezdő',
  unit_price: 2000,
};

describe('executeValidatePackage', () => {
  it('érvénytelen bemenetnél nem fut le lekérdezés, magyar hibaüzenetet ad', async () => {
    const outcome = await executeValidatePackage({ customerId: 'x' });

    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain('Érvénytelen csomag');
  });

  it('rendben talált csomagnál isError:false, a content JSON-ban ok:true', async () => {
    const pool = fakePool(CUSTOMER, [PRODUCT]);

    const outcome = await executeValidatePackage(
      { customerId: 1, items: [{ productId: 1, quantity: 2 }] },
      { pool },
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content)).toMatchObject({ ok: true, totalPrice: 4000 });
    expect(outcome.summary).toContain('OK');
  });

  it('szabálysértésnél isError:false marad (nem rendszerhiba), de ok:false a tartalomban', async () => {
    const pool = fakePool({ ...CUSTOMER, budget: 1 }, [PRODUCT]);

    const outcome = await executeValidatePackage(
      { customerId: 1, items: [{ productId: 1, quantity: 2 }] },
      { pool },
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content).ok).toBe(false);
    expect(outcome.summary).toContain('ELUTASÍTVA');
  });
});

describe('validatePackageTool', () => {
  it('a tool execute-je függvény, injektálás nélkül is felépíthető', () => {
    const tool = validatePackageTool();
    expect(typeof tool.execute).toBe('function');
  });

  it('a tool NEVE a várt konstans', () => {
    expect(VALIDATE_PACKAGE_TOOL_NAME).toBe('validatePackage');
  });
});
```

A `validatePackageTool` maga a MEGOSZTOTT (valódi) pool-t hívja (nincs `deps` injektálás a tool-factory szintjén, az `upsertProductTool` mintája szerint) — ezért a `validatePackageTool` describe blokk csak azt bizonyítja, hogy a factory injektálás nélkül is felépíthető és a névkonstans helyes; a TÉNYLEGES viselkedést (érvényes/elutasított csomag, Trace-jelentés) az `executeValidatePackage` fenti tesztjei fedik `deps`-injektált mock pool-lal, DB nélkül. A teljes, valódi végponttól-végpontig futás — modell hívja a toolt, a tool a valódi DB-t éri el — a Task 4/6 DB-integrációs specjeiben van bizonyítva.

- [ ] **Step 2: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern validate-package-tool.spec.ts
```

Várt: FAIL — a `./validate-package-tool.js` modul nem létezik.

- [ ] **Step 3: `validate-package-tool.ts` implementálása**

```ts
import { tool, type Tool } from 'ai';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { PackageInputSchema } from './package-schema.js';
import { checkPackage, type PackageCheckResult } from './package-validation.js';
import type { DbPackageDeps } from './db-package.js';

// validate-package-tool.ts — az AI-SDK felé eső vékony réteg a checkPackage fölött. NEM ír
// adatbázisba. A savePackage ugyanezt a checkPackage-et hívja újra mentés előtt.

export const VALIDATE_PACKAGE_TOOL_NAME = 'validatePackage';

function formatCheckResult(result: PackageCheckResult): string {
  if (result.ok) {
    const lines = result.items
      .map((item) => `${item.name} × ${item.quantity} = ${item.lineTotal} Ft`)
      .join('; ');
    return JSON.stringify({
      ok: true,
      items: result.items,
      totalPrice: result.totalPrice,
      customerBudget: result.customerBudget,
      message: `Rendben: ${lines}. Összesen ${result.totalPrice} Ft a ${result.customerBudget} Ft-os keretből.`,
    });
  }
  return JSON.stringify({
    ok: false,
    violations: result.violations,
    totalPrice: result.totalPrice,
    customerBudget: result.customerBudget,
    message: `Nem felel meg: ${result.violations.map((v) => v.message).join(' ')}`,
  });
}

export async function executeValidatePackage(
  rawInput: unknown,
  deps: DbPackageDeps = {},
): Promise<ToolOutcome> {
  const parsed = PackageInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    return {
      content: `Érvénytelen csomag: ${issues}`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }

  try {
    const result = await checkPackage(parsed.data, deps);
    return {
      content: formatCheckResult(result),
      isError: false,
      summary: result.ok
        ? `csomag OK · ${result.items.length} tétel · ${result.totalPrice} Ft`
        : `csomag ELUTASÍTVA · ${result.violations.length} probléma`,
      sql: null,
      rowCount: result.items.length,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: `A csomag ellenőrzése nem sikerült: ${message}`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }
}

export const validatePackageTool = (
  report?: ToolReporter,
): Tool<{ customerId: number; items: { productId: number; quantity: number }[] }, string> =>
  tool({
    description:
      'Ellenőrzi egy növénycsomag-javaslatot: készlet, büdzsé, pet/kid-safe igény, ' +
      'nehézségi szint. NEM ír adatbázisba — mentés előtt MINDIG ezt hívd.',
    inputSchema: PackageInputSchema,
    execute: async (input, { toolCallId }) => {
      const outcome = await executeValidatePackage(input);
      report?.(toolCallId, VALIDATE_PACKAGE_TOOL_NAME, input, outcome);
      return outcome.content;
    },
  });
```

- [ ] **Step 4: A spec javítása és futtatás — menjen zölden**

Az 1. lépésben leírtak szerint a `validatePackageTool` describe blokkot a végleges, egyszerű formára cserélve futtasd:

```bash
pnpm nx test core --testPathPattern validate-package-tool.spec.ts
```

Várt: PASS mind az 5 esetre (3 `executeValidatePackage` + 2 `validatePackageTool`).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lib/tools/package/validate-package-tool.ts packages/core/src/lib/tools/package/validate-package-tool.spec.ts
git commit -m "feat: validate-package-tool — csomag-ellenőrzés AI-SDK toolként (Task 5)"
```

---

## Task 6: `save-package-tool.ts`

**Files:**
- Create: `packages/core/src/lib/tools/package/save-package-tool.ts`
- Create: `packages/core/src/lib/tools/package/save-package-tool.spec.ts`
- Create: `packages/core/src/lib/tools/package/save-package-db.spec.ts`

**Interfaces:**
- Consumes: `PackageInputSchema` (Task 4), `checkPackage` (Task 4), `withPackageTransaction` (Task 3).
- Produces: `SAVE_PACKAGE_TOOL_NAME = 'savePackage'`, `executeSavePackage(rawInput, deps?)`, `savePackageTool(report?)`, `interface SavedPackage`.

- [ ] **Step 1: Unit spec — a rejection-path, előbb (bukjon)**

`packages/core/src/lib/tools/package/save-package-tool.spec.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Pool, QueryResult } from 'pg';
import {
  SAVE_PACKAGE_TOOL_NAME,
  executeSavePackage,
  savePackageTool,
} from './save-package-tool.js';

function fakeRejectingPool(): Pool {
  // A checkPackage ELSŐ (customer) lekérdezése üres sort ad — a savePackage tehát
  // unknown_customer-en bukik, és SOSEM jut el a pool.connect()-ig (a transactionig).
  return {
    query: async (): Promise<QueryResult> => ({ rows: [], rowCount: 0 } as QueryResult),
    connect: vi.fn(),
  } as unknown as Pool;
}

describe('executeSavePackage', () => {
  it('érvénytelen bemenetnél nem ír, magyar hibaüzenetet ad', async () => {
    const outcome = await executeSavePackage({ customerId: 'x' });

    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain('Érvénytelen csomag');
  });

  it('ha a checkPackage elutasítja, NEM próbál írni (pool.connect sosem hívódik)', async () => {
    const pool = fakeRejectingPool();

    const outcome = await executeSavePackage(
      { customerId: 999, items: [{ productId: 1, quantity: 1 }] },
      { pool },
    );

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content).ok).toBe(false);
    expect(outcome.summary).toContain('ELUTASÍTVA');
    expect(pool.connect).not.toHaveBeenCalled();
  });
});

describe('savePackageTool', () => {
  it('a tool NEVE a várt konstans, injektálás nélkül is felépíthető', () => {
    const tool = savePackageTool();
    expect(typeof tool.execute).toBe('function');
    expect(SAVE_PACKAGE_TOOL_NAME).toBe('savePackage');
  });
});
```

- [ ] **Step 2: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern save-package-tool.spec.ts
```

Várt: FAIL — a `./save-package-tool.js` modul nem létezik.

- [ ] **Step 3: `save-package-tool.ts` implementálása**

```ts
import { tool, type Tool } from 'ai';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { PackageInputSchema, type PackageInput } from './package-schema.js';
import { checkPackage, type PackageCheckResult } from './package-validation.js';
import { withPackageTransaction, type DbPackageDeps } from './db-package.js';

// save-package-tool.ts — az EGYETLEN írási út a packages/package_items táblákba. Mentés
// előtt ÚJRA validál (checkPackage) — defense in depth, az upsertProduct mintájára — és a
// beszúrás EGY tranzakcióban fut: ha az item-ek elhasalnának, a package-sor sem marad árva.

export const SAVE_PACKAGE_TOOL_NAME = 'savePackage';

export interface SavedPackage {
  readonly packageId: string;
  readonly totalPrice: number;
  readonly itemCount: number;
}

async function insertPackage(
  input: PackageInput,
  checked: PackageCheckResult,
  deps: DbPackageDeps,
): Promise<SavedPackage> {
  return withPackageTransaction(async (client) => {
    const packageResult = await client.query<{ id: string }>(
      'INSERT INTO packages (customer_id, total_price) VALUES ($1, $2) RETURNING id',
      [input.customerId, checked.totalPrice],
    );
    const packageId = packageResult.rows[0].id;

    for (const item of checked.items) {
      await client.query(
        'INSERT INTO package_items (package_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
        [packageId, item.productId, item.quantity, item.unitPrice],
      );
    }

    return {
      packageId,
      totalPrice: checked.totalPrice,
      itemCount: checked.items.length,
    };
  }, deps);
}

export async function executeSavePackage(
  rawInput: unknown,
  deps: DbPackageDeps = {},
): Promise<ToolOutcome> {
  const parsed = PackageInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    return {
      content: `Érvénytelen csomag — nem mentettem: ${issues}`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }

  try {
    const checked = await checkPackage(parsed.data, deps);
    if (!checked.ok) {
      return {
        content: JSON.stringify({
          ok: false,
          violations: checked.violations,
          message: `Nem mentettem: ${checked.violations.map((v) => v.message).join(' ')}`,
        }),
        isError: false,
        summary: `csomag ELUTASÍTVA mentéskor · ${checked.violations.length} probléma`,
        sql: null,
        rowCount: null,
      };
    }

    const saved = await insertPackage(parsed.data, checked, deps);
    return {
      content: JSON.stringify({
        ok: true,
        packageId: saved.packageId,
        totalPrice: saved.totalPrice,
        itemCount: saved.itemCount,
        message: `Csomag elmentve (${saved.packageId}), ${saved.itemCount} tétel, ${saved.totalPrice} Ft.`,
      }),
      isError: false,
      summary: `CSOMAG mentve · ${saved.itemCount} tétel · ${saved.totalPrice} Ft`,
      sql: null,
      rowCount: saved.itemCount,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: `A csomag mentése nem sikerült: ${message}`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }
}

export const savePackageTool = (
  report?: ToolReporter,
): Tool<{ customerId: number; items: { productId: number; quantity: number }[] }, string> =>
  tool({
    description:
      'Elmenti a növénycsomagot (packages + package_items). Csak EXPLICIT felhasználói ' +
      'megerősítés UTÁN hívd, miután a validatePackage rendben talált mindent.',
    inputSchema: PackageInputSchema,
    execute: async (input, { toolCallId }) => {
      const outcome = await executeSavePackage(input);
      report?.(toolCallId, SAVE_PACKAGE_TOOL_NAME, input, outcome);
      return outcome.content;
    },
  });
```

- [ ] **Step 4: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern save-package-tool.spec.ts
```

Várt: PASS mind a 4 esetre.

- [ ] **Step 5: DB-integrációs spec — valódi beszúrás, atomicitás, elutasítás**

`packages/core/src/lib/tools/package/save-package-db.spec.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { closePackagePool, queryPackage } from './db-package.js';
import { executeSavePackage } from './save-package-tool.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = resolve(here, '../../../../../../.env');
try {
  process.loadEnvFile(repoRootEnvPath);
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

interface Fixture {
  readonly customerId: number;
  readonly productId: number;
  readonly price: number;
}

async function fixture(): Promise<Fixture> {
  const customer = await queryPackage<{ id: number }>(
    'SELECT id FROM customers ORDER BY id LIMIT 1',
  );
  const product = await queryPackage<{ id: number; price: number }>(
    'SELECT id, COALESCE(sale_price, price)::float8 AS price FROM products ' +
      'WHERE stock > 0 ORDER BY COALESCE(sale_price, price) ASC LIMIT 1',
  );
  return {
    customerId: customer.rows[0].id,
    productId: product.rows[0].id,
    price: product.rows[0].price,
  };
}

/**
 * A savePackage KULCS-invariánsa valódi adatbázison: a mentés VALÓDI, auditálható sort hoz
 * létre, ÁRPILLANATKÉPPEL, és egy elutasított csomag SOSEM ír. Az upsert-product-db.spec.ts
 * mintája: admin kapcsolaton takarítunk, a package szerep szándékosan nem tud DELETE-elni.
 */
describe('savePackage — valódi DB-n', () => {
  afterAll(async () => {
    await closePackagePool();
  });

  it('érvényes csomagot ELMENT, a válasz tartalmazza a packageId-t és az árpillanatképet', async () => {
    const { customerId, productId, price } = await fixture();

    const outcome = await executeSavePackage({
      customerId,
      items: [{ productId, quantity: 1 }],
    });

    expect(outcome.isError).toBe(false);
    const parsed = JSON.parse(outcome.content);
    expect(parsed.ok).toBe(true);
    expect(parsed.totalPrice).toBe(price);

    const row = await queryPackage<{ total_price: string }>(
      'SELECT total_price FROM packages WHERE id = $1',
      [parsed.packageId],
    );
    expect(Number(row.rows[0].total_price)).toBe(price);

    const items = await queryPackage<{ unit_price: string }>(
      'SELECT unit_price FROM package_items WHERE package_id = $1',
      [parsed.packageId],
    );
    expect(items.rowCount).toBe(1);
    expect(Number(items.rows[0].unit_price)).toBe(price);

    // Takarítás admin kapcsolaton (a package szerep nem tud DELETE-elni).
    const admin = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await admin.query('DELETE FROM packages WHERE id = $1', [parsed.packageId]);
    } finally {
      await admin.end();
    }
  });

  it('túl nagy mennyiségre ELUTASÍT, és NEM ír egyetlen sort sem', async () => {
    const { customerId, productId } = await fixture();

    const beforeCount = await queryPackage<{ count: string }>(
      'SELECT count(*)::text AS count FROM packages WHERE customer_id = $1',
      [customerId],
    );

    const outcome = await executeSavePackage({
      customerId,
      items: [{ productId, quantity: 1_000_000 }],
    });

    expect(outcome.isError).toBe(false);
    expect(JSON.parse(outcome.content).ok).toBe(false);

    const afterCount = await queryPackage<{ count: string }>(
      'SELECT count(*)::text AS count FROM packages WHERE customer_id = $1',
      [customerId],
    );
    expect(afterCount.rows[0].count).toBe(beforeCount.rows[0].count);
  });
});
```

- [ ] **Step 6: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern save-package
```

Várt: PASS mind a két fájlra (unit + DB).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/lib/tools/package/save-package-tool.ts packages/core/src/lib/tools/package/save-package-tool.spec.ts packages/core/src/lib/tools/package/save-package-db.spec.ts
git commit -m "feat: save-package-tool — az egyetlen írási út a packages táblákba (Task 6)"
```

---

## Task 7: `cancel-package-tool.ts`

**Files:**
- Create: `packages/core/src/lib/tools/package/cancel-package-tool.ts`
- Create: `packages/core/src/lib/tools/package/cancel-package-tool.spec.ts`

**Interfaces:**
- Produces: `CANCEL_PACKAGE_TOOL_NAME = 'cancelPackage'`, `cancelPackageTool(report?)`.

- [ ] **Step 1: A spec — előbb, bukjon**

```ts
import { describe, expect, it } from 'vitest';
import type { ToolOutcome } from '../tool-outcome.js';
import { CANCEL_PACKAGE_TOOL_NAME, cancelPackageTool } from './cancel-package-tool.js';

describe('cancelPackageTool', () => {
  it('nem-hibás outcome-ot jelent a Trace-nek, DB-hívás nélkül', async () => {
    const reported: { name: string; outcome: ToolOutcome }[] = [];
    const tool = cancelPackageTool((_id, name, _input, outcome) => {
      reported.push({ name, outcome });
    });

    const execute = tool.execute as unknown as (
      input: Record<string, never>,
      context: { toolCallId: string },
    ) => Promise<string>;
    const content = await execute({}, { toolCallId: 'call_1' });

    expect(content).toContain('megszakítva');
    expect(reported).toHaveLength(1);
    expect(reported[0]?.name).toBe(CANCEL_PACKAGE_TOOL_NAME);
    expect(reported[0]?.outcome.isError).toBe(false);
  });
});
```

- [ ] **Step 2: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern cancel-package-tool.spec.ts
```

Várt: FAIL — a modul nem létezik.

- [ ] **Step 3: Implementálás**

```ts
import { tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';

// cancel-package-tool.ts — JELZŐ-tool: nem ír adatbázisba. Kizárólag azért létezik, hogy a
// history-ban hagyjon egy felismerhető jelet — ez zárja a flow-lockot (lásd
// orchestrator-agent/flow-lock.ts), ha a felhasználó meggondolja magát csomag-építés közben.

export const CANCEL_PACKAGE_TOOL_NAME = 'cancelPackage';

export const cancelPackageTool = (report?: ToolReporter) =>
  tool({
    description:
      'Jelzi, hogy a csomag-építés megszakadt mentés nélkül — akkor hívd, ha a felhasználó ' +
      'lemond a csomagról.',
    inputSchema: z.object({}),
    execute: async (_input, { toolCallId }) => {
      const outcome: ToolOutcome = {
        content: 'A csomag-építés megszakítva, semmi nem lett elmentve.',
        isError: false,
        summary: 'csomag-építés megszakítva',
        sql: null,
        rowCount: null,
      };
      report?.(toolCallId, CANCEL_PACKAGE_TOOL_NAME, {}, outcome);
      return outcome.content;
    },
  });
```

- [ ] **Step 4: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern cancel-package-tool.spec.ts
```

Várt: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lib/tools/package/cancel-package-tool.ts packages/core/src/lib/tools/package/cancel-package-tool.spec.ts
git commit -m "feat: cancel-package-tool — a flow-lock záró jelzése (Task 7)"
```

---

## Task 8: `ask-info-agent-tool.ts`

**Files:**
- Create: `packages/core/src/lib/tools/ask-info-agent/ask-info-agent-tool.ts`
- Create: `packages/core/src/lib/tools/ask-info-agent/ask-info-agent-tool.spec.ts`

**Interfaces:**
- Consumes: `askAgent`, `type AskAgentOptions` (`../../agents/query-agent/query-agent.js`), `type AskResult` (`../../agents/agent-loop.js`).
- Produces: `ASK_INFO_AGENT_TOOL_NAME = 'askInfoAgent'`, `askInfoAgentTool(report?, options?)`.

- [ ] **Step 1: A spec — a `delegate-to-ingest-tool.spec.ts` mintájára, előbb (bukjon)**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { AskResult } from '../../agents/agent-loop.js';
import type { ToolOutcome } from '../tool-outcome.js';
import { ASK_INFO_AGENT_TOOL_NAME, askInfoAgentTool } from './ask-info-agent-tool.js';

const infoResult = (answer: string): AskResult => ({
  answer,
  systemPrompt: '<role>info</role>',
  messages: [],
  usage: { inputTokens: 10, outputTokens: 20 },
  toolSteps: [],
  stopReason: 'stop',
});

const callTool = async (
  tool: ReturnType<typeof askInfoAgentTool>,
  input: { question: string },
): Promise<string> => {
  const execute = tool.execute as unknown as (
    input: { question: string },
    context: { toolCallId: string; messages: [] },
  ) => Promise<string>;
  return execute(input, { toolCallId: 'call_1', messages: [] });
};

describe('askInfoAgent', () => {
  it('továbbadja a kérdést az info-agentnek MINDIG customer szerepben, és a válaszát adja vissza', async () => {
    const run = vi.fn().mockResolvedValue(infoResult('A Monstera közepes fényt szeret.'));
    const tool = askInfoAgentTool(undefined, { run, print: false, persistTrace: false });

    const content = await callTool(tool, { question: 'Mennyi fényt szeret a Monstera?' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('Mennyi fényt szeret a Monstera?');
    expect(run.mock.calls[0]?.[1]).toMatchObject({ role: 'customer' });
    expect(content).toContain('Monstera');
  });

  it('a Trace-nek nem-hibás outcome-ot jelent, SQL nélkül', async () => {
    const reported: ToolOutcome[] = [];
    const tool = askInfoAgentTool(
      (_id, name, _input, outcome) => {
        expect(name).toBe(ASK_INFO_AGENT_TOOL_NAME);
        reported.push(outcome);
      },
      { run: async () => infoResult('Kész.') },
    );

    await callTool(tool, { question: 'Van pozsgás 5000 alatt?' });

    expect(reported).toHaveLength(1);
    expect(reported[0]?.isError).toBe(false);
    expect(reported[0]?.sql).toBeNull();
  });

  it('a beágyazott agent hibája NEM dönti le a hívó loopot', async () => {
    const tool = askInfoAgentTool(undefined, {
      run: async () => {
        throw new Error('DATABASE_URL_READONLY hiányzik');
      },
    });

    const content = await callTool(tool, { question: 'kérdés' });

    expect(content).toContain('DATABASE_URL_READONLY');
  });

  it('üres kérdést meg sem próbál feltenni', async () => {
    const run = vi.fn();
    const tool = askInfoAgentTool(undefined, { run });

    const content = await callTool(tool, { question: '   ' });

    expect(run).not.toHaveBeenCalled();
    expect(content).toMatch(/üres/i);
  });

  it('injektált futtató nélkül a VALÓDI askAgent-et kötné be', () => {
    const tool = askInfoAgentTool();
    expect(typeof tool.execute).toBe('function');
  });
});
```

- [ ] **Step 2: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern ask-info-agent-tool.spec.ts
```

Várt: FAIL — a modul nem létezik.

- [ ] **Step 3: Implementálás**

```ts
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { askAgent, type AskAgentOptions } from '../../agents/query-agent/query-agent.js';
import type { AskResult } from '../../agents/agent-loop.js';

// ask-info-agent-tool.ts — a package-agent SAJÁT toolja a katalógus/tudásbázis/ügyfél
// eléréséhez: a delegateToIngestTool mintáját követi (agent-mint-tool), de MINDIG
// role: 'customer'-ként hívja az askAgent-et, FÜGGETLENÜL a külső beszélgetés szerepétől —
// egy köztes info-lekérdezés sosem kaphatja meg a delegateToIngest képességet.

export const ASK_INFO_AGENT_TOOL_NAME = 'askInfoAgent';

export interface AskInfoAgentOptions {
  readonly print?: boolean;
  readonly persistTrace?: boolean;
  readonly run?: (
    question: string,
    options?: AskAgentOptions,
  ) => Promise<AskResult>;
}

export const askInfoAgentTool = (
  report?: ToolReporter,
  options: AskInfoAgentOptions = {},
): Tool<{ question: string }, string> => {
  const run = options.run ?? askAgent;

  return tool({
    description:
      'Kérdés a katalógus/tudásbázis/ügyfél-szakértő (info) agentnek — katalógus-tényekhez ' +
      '(ár, készlet, kategória), gondozási tudáshoz, vagy ügyfélprofilhoz. A question legyen ' +
      'önmagában értelmezhető: a másik agent NEM látja a csomag-építés eddigi menetét.',
    inputSchema: z.object({
      question: z.string().describe('Önmagában értelmezhető kérdés az info-agentnek.'),
    }),
    execute: async (input, { toolCallId }) => {
      const question = input.question.trim();
      if (question === '') {
        const outcome: ToolOutcome = {
          content: 'Üres kérdést nem lehet feltenni az info-agentnek.',
          isError: true,
          summary: null,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ASK_INFO_AGENT_TOOL_NAME, input, outcome);
        return outcome.content;
      }
      try {
        const result = await run(question, {
          role: 'customer',
          print: options.print,
          persistTrace: options.persistTrace,
        });
        const outcome: ToolOutcome = {
          content: result.answer,
          isError: false,
          summary: `info-agent · ${result.toolSteps.length} tool-lépés`,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ASK_INFO_AGENT_TOOL_NAME, input, outcome);
        return outcome.content;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const outcome: ToolOutcome = {
          content: `Az info-agent futása nem sikerült: ${message}`,
          isError: true,
          summary: null,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ASK_INFO_AGENT_TOOL_NAME, input, outcome);
        return outcome.content;
      }
    },
  });
};
```

- [ ] **Step 4: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern ask-info-agent-tool.spec.ts
```

Várt: PASS mind az 5 esetre.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lib/tools/ask-info-agent/
git commit -m "feat: askInfoAgent tool — a package-agent info-lekérdezése (Task 8)"
```

---

## Task 9: `package-prompt.ts` + `package-agent.ts`

**Files:**
- Create: `packages/core/src/lib/agents/package-agent/package-prompt.ts`
- Create: `packages/core/src/lib/agents/package-agent/package-agent.ts`
- Create: `packages/core/src/lib/agents/package-agent/package-agent.spec.ts`

**Interfaces:**
- Consumes: `askInfoAgentTool` (Task 8), `validatePackageTool` (Task 5), `savePackageTool` (Task 6), `cancelPackageTool` (Task 7), `runAgentLoop`/`AskOptions`/`AskResult` (`../agent-loop.js`).
- Produces: `buildPackagePrompt(): string`, `askPackageAgent(question: string, options?: AskOptions): Promise<AskResult>`, `MAX_PACKAGE_STEPS`.

- [ ] **Step 1: `package-prompt.ts`**

```ts
// package-prompt.ts — a PACKAGE-agent system promptja. XML-szerű tagek tagolják a részeket
// (docs/konvenciók.md). Ez az az agent, ami a projekt saját nevének ad tartalmat: egy szoba
// növénycsomagjának összeállítása.
export function buildPackagePrompt(): string {
  return `
<role>
Te a Szobakertész csomag-építő asszisztense vagy: egy ügyfélnek (vagy a nevében eljáró
lakberendezőnek) állítasz össze egy növénycsomagot a katalógusból, az ügyfél kerete és
igényei alapján.
</role>

<task>
1. Azonosítsd az ÜGYFELET (askInfoAgent-tel, "ügyfél: <kód/név>" jellegű kérdéssel) — enélkül
   nem tudod a keretét és az igényeit.
2. Gyűjts alkalmas növényeket az askInfoAgent-tel (katalógus-kérdéssel: kategória, fény,
   büdzsé, pet/kid-safe).
3. Amikor van egy javaslatod, hívd a validatePackage toolt — ez ELLENŐRZI a készletet, a
   büdzsét és a biztonsági igényeket, és NEM ír adatbázisba.
4. Mutasd meg az összesítőt a felhasználónak, és KÉRJ EXPLICIT MEGERŐSÍTÉST ("Ez így rendben
   van?").
5. Megerősítés UTÁN, és CSAK akkor, hívd a savePackage toolt.
6. Ha a felhasználó meggondolja magát, hívd a cancelPackage toolt.
</task>

<rules>
- Te magad SOSEM futtatsz SQL-t és SOSEM éred el közvetlenül a katalógust vagy az
  ügyféladatokat — minden lekérdezéshez az askInfoAgent toolt használd.
- SOSEM hívd a savePackage-et validatePackage és EXPLICIT felhasználói megerősítés nélkül.
- Ha a validatePackage szabálysértést jelez (túllépi a keretet, nincs készleten, nem
  biztonságos), MONDD EL a felhasználónak, és ajánlj korrekciót (kevesebb tétel, olcsóbb
  alternatíva) — ne próbáld meg mégis elmenteni.
- Ha a felhasználó a csomag-építéstől FÜGGETLEN kérdést tesz fel (pl. "mi a visszaküldési
  szabály?"), válaszolj röviden (az askInfoAgent-tel, ha kell), majd térj vissza a
  csomag-építéshez.
</rules>

<tools>
- askInfoAgent(kérdés): a katalógus, a tudásbázis és az ügyféladatok elérése — mindig ezt
  használd, sosem közvetlen SQL-t.
- validatePackage({ customerId, items: [{ productId, quantity }] }): ELLENŐRZI a csomagot
  (készlet, büdzsé, pet/kid-safe, nehézségi szint) — NEM ír adatbázisba.
- savePackage({ customerId, items: [{ productId, quantity }] }): ELMENTI a csomagot — csak
  explicit felhasználói megerősítés UTÁN hívd.
- cancelPackage(): jelzi, hogy a csomag-építés megszakadt, mentés nélkül.
</tools>
`.trim();
}
```

- [ ] **Step 2: A toolset-pinning spec — a `query-agent.spec.ts` mintájára, előbb (bukjon)**

```ts
import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { askPackageAgent } from './package-agent.js';

const TEST_CONFIG = {
  anthropicApiKey: 'sk-ant-test',
  anthropicModel: 'claude-sonnet-4-6',
  databaseUrlReadonly: 'postgresql://ro:ro@localhost:5433/szoba-kertesz-test',
};

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
  totalTokens: input + output,
});

const textStepChunks = (text: string) => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: text },
  { type: 'text-end', id: 't1' },
  { type: 'finish', finishReason: { unified: 'stop' }, usage: usage(10, 20) },
];

function toolNameProbe() {
  const seen: string[] = [];
  const model = new MockLanguageModelV4({
    doStream: (async (options: { tools?: { name: string }[] }) => {
      seen.push(...(options.tools ?? []).map((tool) => tool.name));
      return {
        stream: simulateReadableStream({
          chunks: textStepChunks('kész') as never,
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
        }),
      };
    }) as never,
  });
  return { model, seen };
}

describe('askPackageAgent — toolkészlet', () => {
  it('a NÉGY tool megy ki: askInfoAgent, validatePackage, savePackage, cancelPackage', async () => {
    const { model, seen } = toolNameProbe();

    await askPackageAgent('Állíts össze egy csomagot', {
      config: TEST_CONFIG,
      model,
      print: false,
      persistTrace: false,
      log: async () => undefined,
    });

    expect(seen).toEqual([
      'askInfoAgent',
      'validatePackage',
      'savePackage',
      'cancelPackage',
    ]);
  });

  it('a system prompt tartalmazza a megerősítés-kényszert', async () => {
    const { model } = toolNameProbe();

    const result = await askPackageAgent('kérdés', {
      config: TEST_CONFIG,
      model,
      print: false,
      persistTrace: false,
      log: async () => undefined,
    });

    expect(result.systemPrompt).toContain('EXPLICIT MEGERŐSÍTÉST');
    expect(result.systemPrompt).toContain('SOSEM hívd a savePackage-et');
  });

  it('üres kérdést nem fogad el', async () => {
    await expect(
      askPackageAgent('   ', { config: TEST_CONFIG, print: false, persistTrace: false }),
    ).rejects.toThrow(/üres/i);
  });
});
```

- [ ] **Step 3: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern package-agent.spec.ts
```

Várt: FAIL — a `./package-agent.js` modul nem létezik.

- [ ] **Step 4: `package-agent.ts` implementálása**

```ts
import type { ToolSet } from 'ai';
import { buildPackagePrompt } from './package-prompt.js';
import { runAgentLoop, type AskOptions, type AskResult } from '../agent-loop.js';
import { askInfoAgentTool } from '../../tools/ask-info-agent/ask-info-agent-tool.js';
import { validatePackageTool } from '../../tools/package/validate-package-tool.js';
import { savePackageTool } from '../../tools/package/save-package-tool.js';
import { cancelPackageTool } from '../../tools/package/cancel-package-tool.js';

// package-agent.ts — a CSOMAG-ÉPÍTŐ agent. A projekt saját nevének ad tartalmat: egy szoba
// növénycsomagjának összeállítása, ügyfélre szabva, validálással és mentés előtti
// megerősítéssel. Nem fut SQL-t közvetlenül — mindent az askInfoAgent tooljával olvas.
//   prompt:  package-prompt.ts
//   toolok:  askInfoAgent + validatePackage + savePackage + cancelPackage
//   loop:    a közös agent-loop (../agent-loop.ts)

/** Több lépés kell: ügyfél-azonosítás → keresés (több kör is lehet) → validálás → mentés. */
export const MAX_PACKAGE_STEPS = 10;
const MAX_TOKENS = 2048;

export async function askPackageAgent(
  question: string,
  options: AskOptions = {},
): Promise<AskResult> {
  const trimmed = question.trim();
  if (trimmed === '') {
    throw new Error('Üres kérdést nem lehet feltenni.');
  }

  return runAgentLoop(
    trimmed,
    {
      systemPrompt: buildPackagePrompt(),
      buildTools: (report): ToolSet => ({
        askInfoAgent: askInfoAgentTool(report, {
          print: options.print,
          persistTrace: options.persistTrace,
        }),
        validatePackage: validatePackageTool(report),
        savePackage: savePackageTool(report),
        cancelPackage: cancelPackageTool(report),
      }),
      maxSteps: MAX_PACKAGE_STEPS,
      maxOutputTokens: MAX_TOKENS,
      emptyAnswer:
        'Nem sikerült befejezni a csomag-összeállítást a megengedett lépésszámon belül. Pontosítsd a kérést.',
    },
    options,
  );
}
```

- [ ] **Step 5: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern package-agent.spec.ts
```

Várt: PASS mind a 3 esetre.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/lib/agents/package-agent/
git commit -m "feat: package-agent — a csomag-építő agent (Task 9)"
```

---

## Task 10: `flow-lock.ts`

**Files:**
- Create: `packages/core/src/lib/agents/orchestrator-agent/flow-lock.ts`
- Create: `packages/core/src/lib/agents/orchestrator-agent/flow-lock.spec.ts`

**Interfaces:**
- Consumes: `type Message` (`../agent-loop.js`).
- Produces: `type FlowLockState = 'package-open' | 'none'`, `findLastFlowSignal(history: readonly Message[]): FlowLockState`.

- [ ] **Step 1: A spec — előbb, bukjon**

```ts
import { describe, expect, it } from 'vitest';
import { findLastFlowSignal } from './flow-lock.js';
import type { Message } from '../agent-loop.js';

const toolCallMessage = (toolName: string): Message => ({
  role: 'assistant',
  content: [{ type: 'tool-call', toolCallId: 'c1', toolName, input: {} }],
});
const textMessage = (text: string): Message => ({ role: 'assistant', content: text });
const userMessage = (text: string): Message => ({ role: 'user', content: text });

describe('findLastFlowSignal', () => {
  it('üres history esetén "none"-t ad', () => {
    expect(findLastFlowSignal([])).toBe('none');
  });

  it('ha nincs jelző-tool a history-ban, "none"-t ad', () => {
    const history = [userMessage('szia'), textMessage('szia')];
    expect(findLastFlowSignal(history)).toBe('none');
  });

  it('routeToPackageAgent után nyitott ("package-open")', () => {
    const history = [userMessage('csomagot kérek'), toolCallMessage('routeToPackageAgent')];
    expect(findLastFlowSignal(history)).toBe('package-open');
  });

  it('savePackage után zárt ("none"), még ha korábban route is volt', () => {
    const history = [
      userMessage('csomagot kérek'),
      toolCallMessage('routeToPackageAgent'),
      userMessage('igen, mentsd'),
      toolCallMessage('savePackage'),
    ];
    expect(findLastFlowSignal(history)).toBe('none');
  });

  it('cancelPackage után zárt ("none")', () => {
    const history = [
      toolCallMessage('routeToPackageAgent'),
      toolCallMessage('cancelPackage'),
    ];
    expect(findLastFlowSignal(history)).toBe('none');
  });

  it('nem jelző-tool hívások nem nyitnak/zárnak flow-t', () => {
    const history = [
      toolCallMessage('routeToPackageAgent'),
      toolCallMessage('askInfoAgent'),
      toolCallMessage('validatePackage'),
    ];
    expect(findLastFlowSignal(history)).toBe('package-open');
  });

  it('a LEGUTOLSÓ jelző-tool számít, nem az első', () => {
    const history = [
      toolCallMessage('routeToPackageAgent'),
      toolCallMessage('cancelPackage'),
      toolCallMessage('routeToPackageAgent'),
    ];
    expect(findLastFlowSignal(history)).toBe('package-open');
  });
});
```

- [ ] **Step 2: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern flow-lock.spec.ts
```

Várt: FAIL — a `./flow-lock.js` modul nem létezik.

- [ ] **Step 3: Implementálás**

```ts
import type { Message } from '../agent-loop.js';

// flow-lock.ts — TISZTA függvény: a beszélgetés-history tool-hívásaiból olvassa ki, nyitva
// van-e egy csomag-flow. Ha igen, az orchestrator-agent.ts KI SEM HÍVJA az orchestrátor
// LLM-jét — egyenesen a package-agentet hívja. Ez a rövidzár tartja alacsonyan a költséget
// egy többköríves csomag-építésnél (docs/roi.md mért-költség kultúrája).

const FLOW_SIGNAL_TOOLS = ['routeToPackageAgent', 'savePackage', 'cancelPackage'] as const;
type FlowSignalTool = (typeof FLOW_SIGNAL_TOOLS)[number];

export type FlowLockState = 'package-open' | 'none';

function isFlowSignalTool(toolName: string): toolName is FlowSignalTool {
  return (FLOW_SIGNAL_TOOLS as readonly string[]).includes(toolName);
}

/**
 * A history-ban időrendben a LEGUTOLSÓ jelző-tool dönt: routeToPackageAgent → nyitva,
 * savePackage/cancelPackage → zárva, egyik sincs → zárva (alapállapot).
 */
export function findLastFlowSignal(history: readonly Message[]): FlowLockState {
  let last: FlowSignalTool | undefined;

  for (const message of history) {
    if (message.role !== 'assistant' || typeof message.content === 'string') {
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'tool-call' && isFlowSignalTool(part.toolName)) {
        last = part.toolName;
      }
    }
  }

  return last === 'routeToPackageAgent' ? 'package-open' : 'none';
}
```

- [ ] **Step 4: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern flow-lock.spec.ts
```

Várt: PASS mind a 7 esetre.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lib/agents/orchestrator-agent/flow-lock.ts packages/core/src/lib/agents/orchestrator-agent/flow-lock.spec.ts
git commit -m "feat: flow-lock — a csomag-flow állapota a history tool-jelzéseiből (Task 10)"
```

---

## Task 11: `AgentDefinition.toolChoice` — a közös loop bővítése

**Files:**
- Modify: `packages/core/src/lib/agents/agent-loop.ts`
- Modify: `packages/core/src/lib/agents/agent-loop.spec.ts`

**Interfaces:**
- Produces: `AgentDefinition.toolChoice?: 'auto' | 'none' | 'required'` (opcionális — a meglévő agentek ezt NEM töltik ki, viselkedésük változatlan).

- [ ] **Step 1: A regressziós/új-viselkedés spec — előbb, bukjon**

`packages/core/src/lib/agents/agent-loop.spec.ts` VÉGÉRE (az utolsó `describe` blokk után, a fájl végén) illessz be egy új blokkot. Ehhez a fájl elején lévő segédfüggvényeket (`streamOf`, `textStepChunks`, `usage`) újrahasznosítja — ezek már léteznek a fájlban:

```ts
describe('askAgent — AgentDefinition.toolChoice (Task 11)', () => {
  it('meg nem adott toolChoice esetén a streamText-nek KÜLDÖTT érték undefined (a meglévő agentek viselkedése változatlan)', async () => {
    let capturedToolChoice: unknown;
    const model = new MockLanguageModelV4({
      doStream: (async (options: { toolChoice?: unknown }) => {
        capturedToolChoice = options.toolChoice;
        return { stream: streamOf(textStepChunks('kész')) };
      }) as never,
    });

    await askAgent('kérdés', {
      config: TEST_CONFIG,
      model,
      print: false,
      persistTrace: false,
      log: async () => undefined,
    });

    expect(capturedToolChoice).toBeUndefined();
  });
});
```

Ez a `runAgentLoop`-ot közvetve, az `askAgent`-en keresztül hajtja meg (a fájl saját mintája szerint) — mivel a `query-agent` sosem tölti ki a `toolChoice`-t, ennek `undefined`-nek kell maradnia a streamText hívásában is.

Egy MÁSODIK teszt, ami közvetlenül a `runAgentLoop`-ot hívja egy minimális, `toolChoice: 'required'`-et beállító `AgentDefinition`-nel (ehhez importáld a `runAgentLoop`-ot és a `ToolSet`-et a fájl tetején, ha még nincs importálva):

```ts
describe('runAgentLoop — toolChoice threading (Task 11)', () => {
  it('a megadott toolChoice a PROVIDER-szintű alakban ({type: "required"}) ér célba', async () => {
    let capturedToolChoice: unknown;
    const model = new MockLanguageModelV4({
      doStream: (async (options: { toolChoice?: unknown }) => {
        capturedToolChoice = options.toolChoice;
        return { stream: streamOf(textStepChunks('kész')) };
      }) as never,
    });

    await runAgentLoop(
      'kérdés',
      {
        systemPrompt: 'system',
        buildTools: () => ({}),
        maxSteps: 1,
        maxOutputTokens: 100,
        emptyAnswer: 'üres',
        toolChoice: 'required',
      },
      { config: TEST_CONFIG, model, print: false, persistTrace: false, log: async () => undefined },
    );

    expect(capturedToolChoice).toEqual({ type: 'required' });
  });
});
```

Ha a fájl teteje még nem importálja a `runAgentLoop`-ot, egészítsd ki:

```ts
import { askAgent, MAX_TOOL_ITERATIONS } from './query-agent/query-agent.js';
import { runAgentLoop } from './agent-loop.js';
```

- [ ] **Step 2: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern agent-loop.spec.ts
```

Várt: FAIL a MÁSODIK új teszten — `AgentDefinition` nem ismeri a `toolChoice` mezőt (típushiba/futásidejű `undefined` a várt `{type:'required'}` helyett). Az ELSŐ új teszt már ZÖLDEN fut (jelenleg is `undefined` megy ki) — ez a regressziós őr, ami a Step 3 UTÁN is zöld kell maradjon.

- [ ] **Step 3: `agent-loop.ts` bővítése**

Az `AgentDefinition` interfészben az `emptyAnswer` mező UTÁN:

```ts
  /**
   * Kényszerített tool-választás. Az ÖSSZES eddigi agent hallgatólagosan 'auto'-n fut (a
   * modell dönt, hívjon-e toolt) — ezt a mezőt EGYELŐRE csak az orchestrátor tölti ki
   * ('required'): ő SOSEM válaszolhat tool nélkül, mindig pontosan egy route-tool-t kell
   * hívnia. Alapértelmezés nélkül (undefined) a streamText saját alapértelmezése ('auto')
   * érvényesül — a meglévő agentek viselkedése ezért változatlan.
   */
  readonly toolChoice?: 'auto' | 'none' | 'required';
```

A `streamText({...})` hívásban a `tools,` sor UTÁN:

```ts
      toolChoice: agent.toolChoice,
```

- [ ] **Step 4: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern agent-loop.spec.ts
```

Várt: PASS, a TELJES fájlra (a meglévő tesztek is, a két újjal együtt).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lib/agents/agent-loop.ts packages/core/src/lib/agents/agent-loop.spec.ts
git commit -m "feat: AgentDefinition.toolChoice — kényszerített tool-választás az orchestrátorhoz (Task 11)"
```

---

## Task 12: `route-to-package-tool.ts` + `route-to-info-tool.ts`

**Files:**
- Create: `packages/core/src/lib/tools/route-to-package/route-to-package-tool.ts`
- Create: `packages/core/src/lib/tools/route-to-package/route-to-package-tool.spec.ts`
- Create: `packages/core/src/lib/tools/route-to-info/route-to-info-tool.ts`
- Create: `packages/core/src/lib/tools/route-to-info/route-to-info-tool.spec.ts`

**Interfaces:**
- Consumes: `askPackageAgent` (Task 9), `askAgent`/`type AskAgentOptions` (`../../agents/query-agent/query-agent.js`), `type Message`/`type AskOptions`/`type AskResult` (`../agent-loop.js`).
- Produces: `ROUTE_TO_PACKAGE_AGENT_TOOL_NAME`, `routeToPackageAgentTool(report?, options)`; `ROUTE_TO_INFO_AGENT_TOOL_NAME`, `routeToInfoAgentTool(report?, options)`. **Fontos eltérés a `delegateToIngestTool` mintájától**: mindkét tool bemeneti sémája ÜRES (`z.object({})`) — a `question`/`history` NEM a modelltől jön, hanem az `orchestrator-agent.ts` zárja le a factory-hívásban (lásd Task 13), hogy a route-olt agent a TELJES, hiteles beszélgetést kapja, ne a modell által újrafogalmazott rövidített változatot.

- [ ] **Step 1: `route-to-package-tool.spec.ts` — előbb, bukjon**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { AskResult, Message } from '../../agents/agent-loop.js';
import type { ToolOutcome } from '../tool-outcome.js';
import {
  ROUTE_TO_PACKAGE_AGENT_TOOL_NAME,
  routeToPackageAgentTool,
} from './route-to-package-tool.js';

const packageResult = (answer: string): AskResult => ({
  answer,
  systemPrompt: '<role>package</role>',
  messages: [],
  usage: { inputTokens: 10, outputTokens: 20 },
  toolSteps: [],
  stopReason: 'stop',
});

const HISTORY: readonly Message[] = [{ role: 'user', content: 'előzmény' }];

const callTool = async (
  tool: ReturnType<typeof routeToPackageAgentTool>,
): Promise<string> => {
  const execute = tool.execute as unknown as (
    input: Record<string, never>,
    context: { toolCallId: string; messages: [] },
  ) => Promise<string>;
  return execute({}, { toolCallId: 'call_1', messages: [] });
};

describe('routeToPackageAgent', () => {
  it('a LEZÁRT (nem modell-adta) kérdést és history-t adja át a package-agentnek', async () => {
    const run = vi.fn().mockResolvedValue(packageResult('Íme egy javaslat.'));
    const tool = routeToPackageAgentTool(undefined, {
      question: 'Állíts össze egy csomagot',
      history: HISTORY,
      run,
      print: false,
      persistTrace: false,
    });

    const content = await callTool(tool);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('Állíts össze egy csomagot');
    expect(run.mock.calls[0]?.[1]).toMatchObject({ history: HISTORY });
    expect(content).toBe('Íme egy javaslat.');
  });

  it('a Trace-nek nem-hibás outcome-ot jelent', async () => {
    const reported: ToolOutcome[] = [];
    const tool = routeToPackageAgentTool(
      (_id, name, _input, outcome) => {
        expect(name).toBe(ROUTE_TO_PACKAGE_AGENT_TOOL_NAME);
        reported.push(outcome);
      },
      { question: 'kérdés', history: [], run: async () => packageResult('kész') },
    );

    await callTool(tool);

    expect(reported).toHaveLength(1);
    expect(reported[0]?.isError).toBe(false);
  });

  it('a beágyazott agent hibája NEM dönti le a hívó loopot', async () => {
    const tool = routeToPackageAgentTool(undefined, {
      question: 'kérdés',
      history: [],
      run: async () => {
        throw new Error('DATABASE_URL_PACKAGE hiányzik');
      },
    });

    const content = await callTool(tool);

    expect(content).toContain('DATABASE_URL_PACKAGE');
  });
});
```

- [ ] **Step 2: `route-to-info-tool.spec.ts` — előbb, bukjon**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { AskResult, Message } from '../../agents/agent-loop.js';
import type { ToolOutcome } from '../tool-outcome.js';
import {
  ROUTE_TO_INFO_AGENT_TOOL_NAME,
  routeToInfoAgentTool,
} from './route-to-info-tool.js';

const infoResult = (answer: string): AskResult => ({
  answer,
  systemPrompt: '<role>info</role>',
  messages: [],
  usage: { inputTokens: 10, outputTokens: 20 },
  toolSteps: [],
  stopReason: 'stop',
});

const HISTORY: readonly Message[] = [{ role: 'user', content: 'előzmény' }];

const callTool = async (
  tool: ReturnType<typeof routeToInfoAgentTool>,
): Promise<string> => {
  const execute = tool.execute as unknown as (
    input: Record<string, never>,
    context: { toolCallId: string; messages: [] },
  ) => Promise<string>;
  return execute({}, { toolCallId: 'call_1', messages: [] });
};

describe('routeToInfoAgent', () => {
  it('a lezárt kérdést, history-t ÉS a külső szerepet adja át az info-agentnek', async () => {
    const run = vi.fn().mockResolvedValue(infoResult('3 pozsgás van 5000 alatt.'));
    const tool = routeToInfoAgentTool(undefined, {
      question: 'Hány pozsgás van 5000 alatt?',
      history: HISTORY,
      role: 'admin',
      run,
      print: false,
      persistTrace: false,
    });

    const content = await callTool(tool);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('Hány pozsgás van 5000 alatt?');
    expect(run.mock.calls[0]?.[1]).toMatchObject({ history: HISTORY, role: 'admin' });
    expect(content).toBe('3 pozsgás van 5000 alatt.');
  });

  it('a Trace-nek nem-hibás outcome-ot jelent', async () => {
    const reported: ToolOutcome[] = [];
    const tool = routeToInfoAgentTool(
      (_id, name, _input, outcome) => {
        expect(name).toBe(ROUTE_TO_INFO_AGENT_TOOL_NAME);
        reported.push(outcome);
      },
      { question: 'kérdés', history: [], role: 'customer', run: async () => infoResult('kész') },
    );

    await callTool(tool);

    expect(reported).toHaveLength(1);
    expect(reported[0]?.isError).toBe(false);
  });
});
```

- [ ] **Step 3: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern "route-to-package-tool|route-to-info-tool"
```

Várt: FAIL — egyik modul sem létezik.

- [ ] **Step 4: `route-to-package-tool.ts` implementálása**

```ts
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { askPackageAgent } from '../../agents/package-agent/package-agent.js';
import type { AskOptions, AskResult, Message } from '../../agents/agent-loop.js';

// route-to-package-tool.ts — az ORCHESTRÁTOR toolja: átirányítja a beszélgetést a
// package-agentnek. A delegateToIngestTool mintáját követi (agent-mint-tool), de a bemeneti
// sémája ÜRES: a question/history nem a MODELLTŐL jön (mint delegateToIngest instruction
// mezője), hanem az orchestrator-agent.ts zárja le a factory-hívásban — így a package-agent
// a TELJES, hiteles beszélgetést kapja, nem egy a modell által újrafogalmazott rövidítést.

export const ROUTE_TO_PACKAGE_AGENT_TOOL_NAME = 'routeToPackageAgent';

export interface RouteToPackageAgentOptions {
  readonly question: string;
  readonly history: readonly Message[];
  readonly print?: boolean;
  readonly persistTrace?: boolean;
  readonly run?: (question: string, options?: AskOptions) => Promise<AskResult>;
}

export const routeToPackageAgentTool = (
  report: ToolReporter | undefined,
  options: RouteToPackageAgentOptions,
): Tool<Record<string, never>, string> => {
  const run = options.run ?? askPackageAgent;

  return tool({
    description:
      'Átirányítja a beszélgetést a csomag-építő (package) agentnek: a felhasználó egy ' +
      'növénycsomagot szeretne összeállítani (szoba, büdzsé, igények alapján) — akár most ' +
      'kezdi, akár folytatja. Nincs bemeneti paramétere.',
    inputSchema: z.object({}),
    execute: async (_input, { toolCallId }) => {
      try {
        const result = await run(options.question, {
          history: options.history,
          print: options.print,
          persistTrace: options.persistTrace,
        });
        const outcome: ToolOutcome = {
          content: result.answer,
          isError: false,
          summary: `package-agent · ${result.toolSteps.length} tool-lépés`,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ROUTE_TO_PACKAGE_AGENT_TOOL_NAME, {}, outcome);
        return outcome.content;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const outcome: ToolOutcome = {
          content: `A csomag-építő agent futása nem sikerült: ${message}`,
          isError: true,
          summary: null,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ROUTE_TO_PACKAGE_AGENT_TOOL_NAME, {}, outcome);
        return outcome.content;
      }
    },
  });
};
```

- [ ] **Step 5: `route-to-info-tool.ts` implementálása**

```ts
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { askAgent, type AskAgentOptions } from '../../agents/query-agent/query-agent.js';
import type { AskResult, Message } from '../../agents/agent-loop.js';
import type { UserRole } from '../../user-role/user-role.js';

// route-to-info-tool.ts — az ORCHESTRÁTOR másik toolja: átirányítja a beszélgetést a
// katalógus/tudásbázis/ügyfél-szakértő (info) agentnek — vagyis a MEGLÉVŐ askAgent-nek. A
// role-t TOVÁBBADJA a külső hívásból (az orchestrator-agent.ts zárja le): egy admin
// beszélgetés info-útja is megkapja a delegateToIngest-et, ahogy ma is, orchestrátor nélkül.

export const ROUTE_TO_INFO_AGENT_TOOL_NAME = 'routeToInfoAgent';

export interface RouteToInfoAgentOptions {
  readonly question: string;
  readonly history: readonly Message[];
  readonly role: UserRole;
  readonly print?: boolean;
  readonly persistTrace?: boolean;
  readonly run?: (
    question: string,
    options?: AskAgentOptions,
  ) => Promise<AskResult>;
}

export const routeToInfoAgentTool = (
  report: ToolReporter | undefined,
  options: RouteToInfoAgentOptions,
): Tool<Record<string, never>, string> => {
  const run = options.run ?? askAgent;

  return tool({
    description:
      'Átirányítja a beszélgetést a katalógus/tudásbázis/ügyfél szakértő (info) agentnek: a ' +
      'felhasználó terméket, árat, gondozást vagy ügyfelet érintő kérdést tett fel, NEM ' +
      'csomagot épít. Nincs bemeneti paramétere.',
    inputSchema: z.object({}),
    execute: async (_input, { toolCallId }) => {
      try {
        const result = await run(options.question, {
          role: options.role,
          history: options.history,
          print: options.print,
          persistTrace: options.persistTrace,
        });
        const outcome: ToolOutcome = {
          content: result.answer,
          isError: false,
          summary: `info-agent · ${result.toolSteps.length} tool-lépés`,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ROUTE_TO_INFO_AGENT_TOOL_NAME, {}, outcome);
        return outcome.content;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const outcome: ToolOutcome = {
          content: `Az info-agent futása nem sikerült: ${message}`,
          isError: true,
          summary: null,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ROUTE_TO_INFO_AGENT_TOOL_NAME, {}, outcome);
        return outcome.content;
      }
    },
  });
};
```

- [ ] **Step 6: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern "route-to-package-tool|route-to-info-tool"
```

Várt: PASS mind a 5 esetre (3 + 2).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/lib/tools/route-to-package/ packages/core/src/lib/tools/route-to-info/
git commit -m "feat: routeToPackageAgent + routeToInfoAgent — az orchestrátor két toolja (Task 12)"
```

---

## Task 13: `orchestrator-prompt.ts` + `orchestrator-agent.ts`

**Files:**
- Create: `packages/core/src/lib/agents/orchestrator-agent/orchestrator-prompt.ts`
- Create: `packages/core/src/lib/agents/orchestrator-agent/orchestrator-agent.ts`
- Create: `packages/core/src/lib/agents/orchestrator-agent/orchestrator-agent.spec.ts`

**Interfaces:**
- Consumes: `findLastFlowSignal` (Task 10), `routeToPackageAgentTool`/`routeToInfoAgentTool` (Task 12), `askPackageAgent` (Task 9), `askAgent`/`type AskAgentOptions` (`../query-agent/query-agent.js`), `runAgentLoop`/`type AskOptions`/`type AskResult`/`type Message` (`../agent-loop.js`), `CURRENT_ROLE` (`../../user-role/user-role.js`).
- Produces: `MAX_ORCHESTRATOR_STEPS`, `interface AskOrchestratorOptions extends AskAgentOptions`, `askOrchestrator(question: string, options?: AskOrchestratorOptions): Promise<AskResult>`.

- [ ] **Step 1: `orchestrator-prompt.ts`**

```ts
// orchestrator-prompt.ts — az ORCHESTRÁTOR system promptja. Ez az EGYETLEN agent a
// rendszerben, aminek a feladata NEM a válaszadás: a promptja kifejezetten megtiltja, hogy
// saját szóval feleljen — a route-tool eredményét SZÓ SZERINT kell visszaadnia.
export const ORCHESTRATOR_PROMPT = `<role>
Te a Szobakertész BELSŐ IRÁNYÍTÓJA vagy. Nem beszélsz a felhasználóval — eldöntöd, MELYIK
szakértő agent válaszoljon neki, és a végén PONTOSAN azt add vissza, amit a szakértő mondott.
</role>

<task>
A felhasználó üzenete alapján hívj PONTOSAN EGY toolt:
- routeToPackageAgent: ha a felhasználó egy növénycsomagot szeretne ÖSSZEÁLLÍTANI (szoba,
  büdzsé, igények alapján) — akár most kezdi, akár folytatja egy korábbi csomag-építést.
- routeToInfoAgent: minden más esetben — katalógus-kérdés (ár, készlet, kategória), gondozási
  kérdés, vagy ügyfél-lekérdezés.
</task>

<rules>
- SOSEM válaszolsz a saját szavaiddal. A tool lefutása után a kapott szöveget SZÓ SZERINT,
  változtatás nélkül add vissza — ne fűzz hozzá semmit, ne rövidítsd, ne fogalmazd át.
- Ha bizonytalan vagy, hogy csomag-építésről van-e szó, és a felhasználó konkrét szobát,
  büdzsét vagy "állíts össze" jellegű kérést fogalmazott meg, válaszd a routeToPackageAgent-et.
</rules>`;
```

- [ ] **Step 2: A spec — előbb, bukjon**

```ts
import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { askOrchestrator } from './orchestrator-agent.js';
import type { AskResult, Message } from '../agent-loop.js';

const TEST_CONFIG = {
  anthropicApiKey: 'sk-ant-test',
  anthropicModel: 'claude-sonnet-4-6',
  databaseUrlReadonly: 'postgresql://ro:ro@localhost:5433/szoba-kertesz-test',
};

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
  totalTokens: input + output,
});

const streamOf = (chunks: readonly unknown[]) =>
  simulateReadableStream({ chunks: chunks as never, initialDelayInMs: 0, chunkDelayInMs: 0 });

const textStepChunks = (text: string) => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: text },
  { type: 'text-end', id: 't1' },
  { type: 'finish', finishReason: { unified: 'stop' }, usage: usage(10, 20) },
];

const toolStepChunks = (toolCallId: string, toolName: string) => [
  { type: 'stream-start', warnings: [] },
  { type: 'tool-call', toolCallId, toolName, input: '{}' },
  { type: 'finish', finishReason: { unified: 'tool-calls' }, usage: usage(15, 25) },
];

function mockModel(...steps: readonly (readonly unknown[])[]) {
  let index = 0;
  const doStream = vi.fn(async () => ({
    stream: streamOf(steps[Math.min(index++, steps.length - 1)] ?? []),
  }));
  return { model: new MockLanguageModelV4({ doStream: doStream as never }), doStream };
}

const fakeResult = (answer: string): AskResult => ({
  answer,
  systemPrompt: '<role>x</role>',
  messages: [],
  usage: { inputTokens: 1, outputTokens: 1 },
  toolSteps: [],
  stopReason: 'stop',
});

const baseDeps = { config: TEST_CONFIG, print: false, persistTrace: false, log: async () => undefined };

describe('askOrchestrator — route-olás', () => {
  it('routeToPackageAgent hívásakor a package-agent futtatóját hívja, és a válaszát adja vissza', async () => {
    const { model } = mockModel(
      toolStepChunks('c1', 'routeToPackageAgent'),
      textStepChunks('Íme egy javaslat.'),
    );
    const runPackageAgent = vi.fn().mockResolvedValue(fakeResult('Íme egy javaslat.'));

    const result = await askOrchestrator('Állíts össze egy csomagot', {
      ...baseDeps,
      model,
      runPackageAgent,
    });

    expect(runPackageAgent).toHaveBeenCalledTimes(1);
    expect(runPackageAgent.mock.calls[0]?.[0]).toBe('Állíts össze egy csomagot');
    expect(result.answer).toBe('Íme egy javaslat.');
  });

  it('routeToInfoAgent hívásakor az info-agent futtatóját hívja, és a válaszát adja vissza', async () => {
    const { model } = mockModel(
      toolStepChunks('c1', 'routeToInfoAgent'),
      textStepChunks('3 pozsgás van.'),
    );
    const runInfoAgent = vi.fn().mockResolvedValue(fakeResult('3 pozsgás van.'));

    const result = await askOrchestrator('Hány pozsgás van?', {
      ...baseDeps,
      model,
      runInfoAgent,
    });

    expect(runInfoAgent).toHaveBeenCalledTimes(1);
    expect(runInfoAgent.mock.calls[0]?.[0]).toBe('Hány pozsgás van?');
    expect(result.answer).toBe('3 pozsgás van.');
  });

  it('mindkét route-tool fel van kínálva a modellnek, kényszerített választással', async () => {
    let offered: string[] = [];
    let toolChoice: unknown;
    const model = new MockLanguageModelV4({
      doStream: (async (options: { tools?: { name: string }[]; toolChoice?: unknown }) => {
        offered = (options.tools ?? []).map((tool) => tool.name);
        toolChoice = options.toolChoice;
        return { stream: streamOf(toolStepChunks('c1', 'routeToInfoAgent')) };
      }) as never,
    });

    await askOrchestrator('kérdés', {
      ...baseDeps,
      model,
      runInfoAgent: async () => fakeResult('kész'),
    });

    expect(offered).toEqual(['routeToPackageAgent', 'routeToInfoAgent']);
    expect(toolChoice).toEqual({ type: 'required' });
  });
});

describe('askOrchestrator — flow-lock rövidzár', () => {
  it('nyitott csomag-flow-nál NEM hívja az orchestrátor-modellt, egyenesen a package-agentet hívja', async () => {
    const doStream = vi.fn();
    const model = new MockLanguageModelV4({ doStream: doStream as never });
    const runPackageAgent = vi.fn().mockResolvedValue(fakeResult('Folytatom a csomagot.'));
    const openFlowHistory: readonly Message[] = [
      { role: 'user', content: 'csomagot kérek' },
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'routeToPackageAgent', input: {} }],
      },
    ];

    const result = await askOrchestrator('még egy pozsgást is', {
      ...baseDeps,
      model,
      history: openFlowHistory,
      runPackageAgent,
    });

    expect(doStream).not.toHaveBeenCalled();
    expect(runPackageAgent).toHaveBeenCalledTimes(1);
    expect(runPackageAgent.mock.calls[0]?.[0]).toBe('még egy pozsgást is');
    expect(result.answer).toBe('Folytatom a csomagot.');
  });

  it('lezárt flow-nál (savePackage után) IGENIS az orchestrátor-modellt hívja', async () => {
    const { model } = mockModel(
      toolStepChunks('c1', 'routeToInfoAgent'),
      textStepChunks('kész'),
    );
    const closedFlowHistory: readonly Message[] = [
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'savePackage', input: {} }],
      },
    ];

    const result = await askOrchestrator('másik kérdés', {
      ...baseDeps,
      model,
      history: closedFlowHistory,
      runInfoAgent: async () => fakeResult('kész'),
    });

    expect(result.answer).toBe('kész');
  });
});
```

- [ ] **Step 3: Futtatás — bukjon**

```bash
pnpm nx test core --testPathPattern orchestrator-agent.spec.ts
```

Várt: FAIL — a `./orchestrator-agent.js` modul nem létezik.

- [ ] **Step 4: `orchestrator-agent.ts` implementálása**

```ts
import type { ToolSet } from 'ai';
import { ORCHESTRATOR_PROMPT } from './orchestrator-prompt.js';
import { findLastFlowSignal } from './flow-lock.js';
import { runAgentLoop, type AskOptions, type AskResult } from '../agent-loop.js';
import { askAgent, type AskAgentOptions } from '../query-agent/query-agent.js';
import { askPackageAgent } from '../package-agent/package-agent.js';
import { routeToPackageAgentTool } from '../../tools/route-to-package/route-to-package-tool.js';
import { routeToInfoAgentTool } from '../../tools/route-to-info/route-to-info-tool.js';
import { CURRENT_ROLE } from '../../user-role/user-role.js';

// orchestrator-agent.ts — a NEGYEDIK agent, de más fajta: sosem válaszol saját szóval, csak
// IRÁNYÍT. Két tool-ja van (routeToPackageAgent, routeToInfoAgent), mindkettő egy TELJES
// beágyazott agent-loopot futtat (ugyanaz az agent-mint-tool minta, mint a delegateToIngest),
// és a promptja előírja: a tool eredményét SZÓ SZERINT add vissza.
//
// A FLOW-LOCK a költség miatt kritikus: ha a history-ban a legutóbbi jelző-tool
// routeToPackageAgent (a package-flow tehát nyitva van), az orchestrátor LLM-hívása KI SEM
// MEGY — egyenesen a package-agentet hívjuk. Egy N-köríves csomag-építés így egyetlen plusz
// LLM-hívásba kerül (az elsőbe), nem N-be.

export const MAX_ORCHESTRATOR_STEPS = 2;
const MAX_TOKENS = 1024;

export interface AskOrchestratorOptions extends AskAgentOptions {
  /** Teszt-szeam: a package-agent futtatója (a flow-lockos ág ÉS a route-tool is ezt hívja). */
  readonly runPackageAgent?: (
    question: string,
    options?: AskOptions,
  ) => Promise<AskResult>;
  /** Teszt-szeam: az info-agent (askAgent) futtatója a routeToInfoAgent tool mögött. */
  readonly runInfoAgent?: (
    question: string,
    options?: AskAgentOptions,
  ) => Promise<AskResult>;
}

export async function askOrchestrator(
  question: string,
  options: AskOrchestratorOptions = {},
): Promise<AskResult> {
  const trimmed = question.trim();
  if (trimmed === '') {
    throw new Error('Üres kérdést nem lehet feltenni.');
  }

  const role = options.role ?? CURRENT_ROLE;
  const history = options.history ?? [];

  // FLOW-LOCK RÖVIDZÁR: nyitott csomag-flow-nál nincs orchestrátor-hívás.
  if (findLastFlowSignal(history) === 'package-open') {
    const runPackage = options.runPackageAgent ?? askPackageAgent;
    return runPackage(trimmed, options);
  }

  return runAgentLoop(
    trimmed,
    {
      systemPrompt: ORCHESTRATOR_PROMPT,
      buildTools: (report): ToolSet => ({
        routeToPackageAgent: routeToPackageAgentTool(report, {
          question: trimmed,
          history,
          print: options.print,
          persistTrace: options.persistTrace,
          run: options.runPackageAgent,
        }),
        routeToInfoAgent: routeToInfoAgentTool(report, {
          question: trimmed,
          history,
          role,
          print: options.print,
          persistTrace: options.persistTrace,
          run: options.runInfoAgent,
        }),
      }),
      maxSteps: MAX_ORCHESTRATOR_STEPS,
      maxOutputTokens: MAX_TOKENS,
      toolChoice: 'required',
      emptyAnswer:
        'Nem sikerült eldönteni, hova irányítsam a kérdést. Pontosítsd, mire vagy kíváncsi: ' +
        'katalógus/gondozás, vagy egy növénycsomag összeállítása.',
    },
    options,
  );
}
```

- [ ] **Step 5: Futtatás — menjen zölden**

```bash
pnpm nx test core --testPathPattern orchestrator-agent.spec.ts
```

Várt: PASS mind az 5 esetre.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/lib/agents/orchestrator-agent/
git commit -m "feat: orchestrator-agent — route-olás flow-lock rövidzárral (Task 13)"
```

---

## Task 14: Export barrel — `index.ts`

**Files:**
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: minden Task 1–13-ban létrehozott publikus szimbólum elérhető a `@szoba-kertesz/core` felületről.

- [ ] **Step 1: A barrel bővítése**

`packages/core/src/index.ts`-ben az `agents/ingest-agent/ingest-prompt.js` export sor UTÁN:

```ts
export * from './lib/agents/package-agent/package-agent.js';
export * from './lib/agents/package-agent/package-prompt.js';
export * from './lib/agents/orchestrator-agent/orchestrator-agent.js';
export * from './lib/agents/orchestrator-agent/orchestrator-prompt.js';
export * from './lib/agents/orchestrator-agent/flow-lock.js';
```

A `tools/delegate-to-ingest/delegate-to-ingest-tool.js` export sor UTÁN:

```ts
export * from './lib/tools/ask-info-agent/ask-info-agent-tool.js';
export * from './lib/tools/route-to-package/route-to-package-tool.js';
export * from './lib/tools/route-to-info/route-to-info-tool.js';
export * from './lib/tools/package/package-schema.js';
export * from './lib/tools/package/package-validation.js';
export * from './lib/tools/package/validate-package-tool.js';
export * from './lib/tools/package/save-package-tool.js';
export * from './lib/tools/package/cancel-package-tool.js';
export * from './lib/tools/package/db-package.js';
```

- [ ] **Step 2: Ütközés-ellenőrzés typecheckkel**

```bash
pnpm nx run core:typecheck
```

Várt: PASS — nincs kétszer exportált azonos nevű szimbólum (pl. mindkét `route-to-*` fájl `Message`-t importál típusként, de nem exportálja újra, tehát nem ütközik).

- [ ] **Step 3: Teljes core teszt-csomag**

```bash
pnpm nx test core
```

Várt: PASS (a `db-package.spec.ts`, `package-validation-db.spec.ts`, `save-package-db.spec.ts` élő, seedelt Postgrest igényel — legyen fent `docker compose up -d` + a Task 1–2 migrációi lefuttatva).

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/index.ts
git commit -m "feat: az orchestrátor és a package-agent publikus exportjai (Task 14)"
```

---

## Task 15: Belépési pontok cseréje — CLI és szerver

**Files:**
- Modify: `apps/cli/src/main.ts`
- Modify: `apps/cli/src/interactive.ts`
- Modify: `apps/server/src/app.ts`

**Interfaces:**
- Consumes: `askOrchestrator`, `closePackagePool` (a Task 14 barreljéből).

- [ ] **Step 1: `apps/cli/src/main.ts`**

Az importban cseréld az `askAgent`-et `askOrchestrator`-ra, és vedd fel a `closePackagePool`-t:

```ts
import {
  askOrchestrator,
  askIngestAgent,
  closePackagePool,
  closeReadonlyPool,
  closeReadWritePool,
  setWatchLog,
  USER_ROLES,
} from '@szoba-kertesz/core';
```

Az `ask` parancs action-jében a hívást:

```ts
        const result = await askAgent(question, { print, role });
```

cseréld:

```ts
        const result = await askOrchestrator(question, { print, role });
```

A `finally` blokkban a pool-zárást bővítsd:

```ts
        await Promise.all([closeReadonlyPool(), closePackagePool()]);
```

(a korábbi egyetlen `await closeReadonlyPool();` sor helyett — a csomag-építés a package-poolt is megnyithatja, azt is zárni kell, különben a folyamat a pg `idleTimeoutMillis`-e miatt életben marad).

- [ ] **Step 2: `apps/cli/src/interactive.ts`**

Az importban:

```ts
import {
  askOrchestrator,
  closeChatPool,
  closePackagePool,
  closeReadonlyPool,
  defaultThreadStore,
  partsToText,
  textToParts,
  toThreadTitle,
  type AskResult,
  type Message,
  type ThreadStore,
  type UserRole,
} from '@szoba-kertesz/core';
```

Az `ask` alapértelmezett implementációjában:

```ts
  const ask =
    options.ask ??
    ((question: string, currentHistory: readonly Message[]) =>
      askOrchestrator(question, {
        print,
        history: currentHistory,
        role: options.role,
      }));
```

A `close` eseménykezelőben:

```ts
      void Promise.all([closeReadonlyPool(), closeChatPool(), closePackagePool()])
```

(a korábbi kételemű tömb helyett).

- [ ] **Step 3: `apps/server/src/app.ts`**

Az importban:

```ts
import {
  askOrchestrator,
  defaultThreadStore,
  toThreadTitle,
  ThreadIdSchema,
  type AskResult,
  type StoredMessage,
  type ThreadStore,
  type UserRole,
} from '@szoba-kertesz/core';
```

Az `ask` alapértelmezés:

```ts
  const ask: AskFn =
    options.ask ?? ((question, opts) => askOrchestrator(question, opts));
```

- [ ] **Step 4: Meglévő specek futtatása — DB-mentesek, azonnal**

```bash
pnpm nx test cli
pnpm nx test server
pnpm nx test web
```

Várt: PASS mindhárom projektre, VÁLTOZATLANUL — az `interactive.spec.ts` és az `app.spec.ts` a saját `options.ask`/`options.store` injekciójukon futnak, sosem hívják a valódi `askAgent`/`askOrchestrator`-t (ellenőrizve a Task-előkészítés kutatási fázisában: egyik spec sem importálja/mockolja közvetlenül az `askAgent`-et).

- [ ] **Step 5: Typecheck + lint + build a három érintett projektre**

```bash
pnpm nx run-many -t typecheck lint build -p cli,server,core
```

Várt: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/cli/src/main.ts apps/cli/src/interactive.ts apps/server/src/app.ts
git commit -m "feat: az orchestrátor lesz a belépési pont CLI-n és szerveren (Task 15)"
```

---

## Task 16: Doksi-szinkron

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`
- Modify: `docs/architektura-monorepo.md`
- Modify: `docs/tech-stack.md`
- Modify: `docs/implementacios-terv.md`

**Interfaces:** — (dokumentáció, nincs kód-interfész)

- [ ] **Step 1: `CLAUDE.md`**

A "Project status" szekció végére egy új bekezdés (a legutóbbi, go-live-railway bekezdés UTÁN), ami elmondja: mostantól ÖT agent van, az `askOrchestrator` a belépési pont, a flow-lock a költség miatt kritikus, és az ötödik DB-szerep (`szoba-kertesz_package`) append-only.

A "Key files" listába vedd fel:
- `packages/core/src/lib/agents/orchestrator-agent/` — `orchestrator-agent.ts` (`askOrchestrator`, flow-lock rövidzár), `orchestrator-prompt.ts`, `flow-lock.ts`.
- `packages/core/src/lib/agents/package-agent/` — `package-agent.ts` (`askPackageAgent`), `package-prompt.ts`.
- `packages/core/src/lib/tools/package/` — `package-schema.ts`, `package-validation.ts` (`checkPackage`, megosztott a validate/save között), `validate-package-tool.ts`, `save-package-tool.ts`, `cancel-package-tool.ts`, `db-package.ts`.
- `packages/core/src/lib/tools/ask-info-agent/`, `route-to-package/`, `route-to-info/` — agent-mint-tool wrapperek.

A "Domain model" utáni "Agent behavior contract" szekcióba egy mondat: az orchestrátor sosem válaszol saját szóval, a package-agent sosem fut SQL-t közvetlenül.

A "Local database" szekció DB-kapcsolat felsorolásába vedd fel az ötödiket (`DATABASE_URL_PACKAGE`), a meglévő négy leírásának stílusában.

Az "Architecture" invariáns-listát egy új ponttal egészítsd ki: **öt DB-kapcsolat, öt jogosultsági szint** — a régi "Négy DB-kapcsolat" cím és szöveg helyett.

- [ ] **Step 2: `README.md`**

A "Multi-agent, szétválasztott adatbázis-jogosultsággal" szekciót egészítsd ki két új bekezdéssel (orchestrator-agent + package-agent), a meglévő `query-agent`/`ingest-agent`/`delegateToIngest` felsorolás stílusában.

A "Toolok" felsorolást egészítsd ki: `askInfoAgent` · `routeToPackageAgent` · `routeToInfoAgent` · `validatePackage` · `savePackage` · `cancelPackage`.

Az "Env változók" táblázatba vedd fel a `DATABASE_URL_PACKAGE` sort.

- [ ] **Step 3: `docs/architektura-monorepo.md`**

A `packages/core` alkönyvtár-leírásába (`agents/`) vedd fel az `orchestrator-agent/` és a `package-agent/` mappát a meglévő felsoroláshoz hasonló stílusban.

- [ ] **Step 4: `docs/tech-stack.md`**

A `products`/`customers`/`threads`/`messages` táblák leírása UTÁN vedd fel a `packages`/`package_items` táblák sémáját (oszlopnevek, típusok), a meglévő táblázatok mintájára.

- [ ] **Step 5: `docs/implementacios-terv.md`**

A "Hol tart a terv" táblázat 07. alkalom sorában a "C fázis... kimaradt" megjegyzést cseréld: a C fázis KONCEPCIÓJA (orchestrátor + package-agent + flow-lock) most, ebben a körben MEGÉPÜLT — hivatkozz erre a spec/plan fájlra, és jegyezd meg, mi maradt ki a kurzus eredeti C fázisából (UI-handover, flow-test mérőeszköz, router-mód — külön kör).

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md README.md docs/architektura-monorepo.md docs/tech-stack.md docs/implementacios-terv.md
git commit -m "docs: orchestrátor-agent és package-agent szinkronizálása a doksikba (Task 16)"
```

---

## Task 17: Záró ellenőrzés

**Files:** — (nincs kódváltozás; ellenőrző lépések)

- [ ] **Step 1: Teljes minőségi kapu**

```bash
pnpm nx run-many -t typecheck lint build
pnpm nx test core
pnpm nx test cli
pnpm nx test server
pnpm nx test web
```

Várt: mind PASS. (A `core` DB-s specjeihez élő, migrált, seedelt Postgres kell.)

- [ ] **Step 2: `packages/core` diff-invariáns — EZ A KÖR KIVÉTEL, tudatosan**

Ellentétben a 08./09. alkalommal, EBBEN a körben a `packages/core` diffje SZÁNDÉKOSAN nem üres — ez a kör pontosan a core-t bővíti két új agenttel. Ne futtass üres-diff ellenőrzést; ehelyett ellenőrizd, hogy a diff KIZÁRÓLAG az új agentekhez/toolokhoz kapcsolódik, és nem érintett véletlenül semmi mást:

```bash
git diff master --stat -- packages/core/src | grep -v "orchestrator-agent\|package-agent\|route-to-package\|route-to-info\|ask-info-agent\|tools/package\|agent-loop\.\(ts\|spec\.ts\)\|index\.ts\|config\.\(ts\|spec\.ts\)\|query-agent\.ts"
```

Várt: ÜRES kimenet (minden érintett fájl a fenti, várt listán van).

- [ ] **Step 3: Kézi smoke-teszt — élőben, a felhasználóval**

Mondd el a felhasználónak, hogy ez a lépés MANUÁLIS és FIZETŐS, és kérj jóváhagyást minden fizetős hívás előtt:

```bash
pnpm serve:api    # egyik terminálban
pnpm serve:web    # másikban
```

A böngészőben (`http://localhost:4200`):
1. Katalógus-kérdés (pl. "Hány pozsgás van 5000 Ft alatt?") → a válasz ugyanúgy jön, mint eddig (orchestrátor → routeToInfoAgent → query-agent).
2. Csomag-kérés (pl. "Állíts össze egy csomagot X ügyfélnek Y Ft-ig") → package-agent veszi át, végigmegy az azonosítás → javaslat → validálás → megerősítés → mentés folyamaton.
3. Ellenőrizd élő DB-n: `docker compose exec postgres psql -U "$POSTGRES_ADMIN_USER" -d szoba-kertesz -c "SELECT * FROM packages ORDER BY created_at DESC LIMIT 1;"` — a mentett csomag valóban ott van.

- [ ] **Step 4: `autotest:battery` regresszió — FIZETŐS, csak jóváhagyással**

Kérdezd meg a felhasználót, akarja-e futtatni (kb. az eddig mért díjtétel, lásd `.claude/skills/autotest/SKILL.md`):

```bash
pnpm autotest:battery
```

Várt (a spec 6. sikerkritériuma): mind a 29 eset ZÖLD marad — nincs regresszió a meglévő katalógus/RAG-viselkedésben az orchestrátor bevezetése után.

- [ ] **Step 5: A terv checkboxainak lezárása**

```bash
perl -i -pe 's/^(\s*)- \[ \]/$1- [x]/' docs/superpowers/plans/2026-09-03-orchestrator-agent.md
```

Ellenőrizd: a Step 4 (autotest:battery) csak akkor pipálható ki, ha ténylegesen lefutott — ha a felhasználó nem hagyta jóvá, hagyd `- [ ]`-en, és jegyezd fel a `.superpowers/sdd/2026-09-03-orchestrator-agent/progress.md`-be, hogy miért maradt nyitva.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/plans/2026-09-03-orchestrator-agent.md
git commit -m "docs: mark orchestrator-agent plan tasks complete"
```
