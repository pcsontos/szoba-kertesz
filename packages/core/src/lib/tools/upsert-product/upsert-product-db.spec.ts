import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { closeReadWritePool, queryReadWrite } from './db-readwrite.js';
import { upsertProduct } from './upsert-product-tool.js';
import type { ProductInput } from './product-schema.js';

// Lásd db-readwrite.spec.ts — ugyanaz a minta: a repo gyökerén lévő .env explicit
// betöltése, mert a vitest cwd-je `packages/core`.
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
 * Az `upsertProduct` KULCS-invariánsa valódi adatbázison: „egy termék csak
 * egyszer szerepel — a latin név a kulcs" (ingest-prompt.ts, és a tool leírása).
 *
 * Ezt sokáig csak a kód állította (SELECT → INSERT/UPDATE két külön lekérdezésben),
 * a DB viszont nem tudott róla: két egyidejű upsert ugyanarra a névre két sort
 * hozott létre. A `lower(latin_name)` unique index után az invariáns ott él, ahol
 * a Task 6 óta a többi határ is — a Postgresben, nem a promptban és nem a kódban.
 *
 * A seed-sorokhoz NEM nyúlunk: saját, csak ide való latin névvel dolgozunk, és
 * admin-kapcsolaton takarítunk — a `szoba-kertesz_rw` szerep szándékosan NEM tud
 * törölni, tehát a teszt a saját szemetét sem tudná eltakarítani rajta.
 */

const TEST_LATIN = 'Testicus upsertius';
/** Külön név a „created" ághoz: azt CSAK érintetlen soron lehet bizonyítani. */
const TEST_LATIN_NEW = 'Testicus creatius';

const testProduct = (overrides: Partial<ProductInput> = {}): ProductInput => ({
  name: 'Teszt növény',
  latinName: TEST_LATIN,
  category: 'szobanövény',
  location: 'beltéri',
  price: 1000,
  salePrice: null,
  stock: 1,
  light: 'közepes',
  watering: 'közepes',
  difficulty: 'kezdő',
  currentHeightCm: 10,
  maxHeightCm: 20,
  currentPotCm: 9,
  petSafe: true,
  kidSafe: true,
  airPurifying: false,
  rating: 0,
  reviewsCount: 0,
  description: 'Csak teszthez — a spec admin-kapcsolaton törli.',
  ...overrides,
});

async function countTestRows(): Promise<number> {
  const result = await queryReadWrite<{ count: string }>(
    'SELECT count(*)::text AS count FROM products WHERE lower(latin_name) = lower($1)',
    [TEST_LATIN],
  );
  return Number(result.rows[0].count);
}

describe('upsertProduct — a latin név mint kulcs, valódi DB-n', () => {
  afterAll(async () => {
    // A takarítás ADMIN kapcsolaton megy: a rw szerepnek nincs DELETE joga.
    const admin = new Pool({ connectionString: process.env.DATABASE_URL });
    try {
      await admin.query(
        'DELETE FROM products WHERE lower(latin_name) = ANY($1::text[])',
        [[TEST_LATIN.toLowerCase(), TEST_LATIN_NEW.toLowerCase()]],
      );
    } finally {
      await admin.end();
    }
    await closeReadWritePool();
  });

  it('érintetlen latin névre "created"-et jelent, nem "updated"-et', async () => {
    // Regressziós őr az ON CONFLICT átíráshoz: a beszúrás/frissítés megkülönböztetése
    // már nem külön SELECT-ből jön, hanem a `xmax = 0` rendszeroszlopból. Ha ez
    // elromlik, MINDEN hívás "updated"-nek látszana — némán, mert a sor amúgy jó helyre
    // kerül, és a modell rossz összefoglalót adna vissza a felhasználónak.
    const result = await upsertProduct(
      testProduct({ latinName: TEST_LATIN_NEW, name: 'Teszt új növény' }),
    );

    expect(result.action).toBe('created');
    expect(result.id).toBeGreaterThan(0);
  });

  it('két PÁRHUZAMOS upsert ugyanarra a latin névre EGYETLEN sort hagy maga után', async () => {
    // Ez a lelet lényege. A régi SELECT → INSERT úton mindkét hívás üres SELECT-et
    // látott, és mindkettő beszúrt — a „latin név a kulcs" invariáns némán elveszett.
    const results = await Promise.allSettled([
      upsertProduct(testProduct({ stock: 1 })),
      upsertProduct(testProduct({ stock: 2 })),
    ]);

    const ok = results.filter((r) => r.status === 'fulfilled');
    expect(ok.length).toBeGreaterThan(0);
    expect(await countTestRows()).toBe(1);
  });

  it('a DB maga utasítja vissza a duplikált latin nevet, más betűalakkal is', async () => {
    // Védelem a kódtól függetlenül: ha valaki egyszer megkerülné az upsertProduct-ot,
    // a Postgres akkor is megőrzi az invariánst. (Vö. db-readwrite.spec.ts: a
    // határokat nem a prompt őrzi.)
    await expect(
      queryReadWrite(
        'INSERT INTO products (name, latin_name, category, location, price, stock, light, watering, difficulty, current_height_cm, max_height_cm, current_pot_cm, pet_safe, kid_safe, air_purifying, rating, reviews_count, description) ' +
          "VALUES ('Duplikátum', $1, 'szobanövény', 'beltéri', 1, 1, 'közepes', 'közepes', 'kezdő', 1, 1, 1, true, true, false, 0, 0, 'x')",
        [TEST_LATIN.toUpperCase()],
      ),
    ).rejects.toThrow(/duplicate key|unique/i);
  });

  it('a másik betűalakra is ugyanazt a sort frissíti, nem újat hoz létre', async () => {
    // Regressziós őr az ON CONFLICT átíráshoz: a kulcs `lower(latin_name)`, tehát
    // a csupa nagybetűs alaknak ugyanoda kell találnia. (Ez a case-insensitivitás
    // a régi SELECT-es úton is megvolt — itt azt védjük, hogy az átírás során se vesszen el.)
    const first = await upsertProduct(testProduct({ stock: 3 }));
    const second = await upsertProduct(
      testProduct({ latinName: TEST_LATIN.toUpperCase(), stock: 4 }),
    );

    expect(second.action).toBe('updated');
    expect(second.id).toBe(first.id);
    expect(await countTestRows()).toBe(1);
  });
});
