import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { closeReadonlyPool } from '../run-sql/db-readonly.js';
import {
  executeQueryCustomers,
  queryCustomersTool,
} from './query-customers-tool.js';

// Mint a db-readwrite.spec.ts: a repo gyökerén lévő .env explicit betöltése,
// mert a vitest cwd-je `packages/core`.
const here = dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = resolve(here, '../../../../../../.env');
try {
  process.loadEnvFile(repoRootEnvPath);
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

describe('queryCustomers — bemenet-validálás (DB nélkül)', () => {
  it('ismeretlen customerType-ra magyar hibát ad, nem dob', async () => {
    const outcome = await executeQueryCustomers({ customerType: 'űrhajó' });

    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain('magánszemély');
    expect(outcome.sql).toBeNull();
  });
});

describe('queryCustomers — valódi lekérdezés a seedelt DB-n', () => {
  afterAll(async () => {
    await closeReadonlyPool();
  });

  it('a TOOL-séma sem enged felsoroláson kívüli customerType-ot', () => {
    // A #8 PR-review 9. tétele: amíg kifelé `z.string()` állt, a modell leírhatott
    // „kávézó"-t, és a belső `z.enum` az EGÉSZ hívást elutasította — a `code` és a
    // `search` is elveszett vele. Amit a modell nem tud leírni, azzal nem tud
    // elrontani egy hívást.
    // A cast a TESZT határán van: az SDK `inputSchema`-ja `FlexibleSchema`-ként
    // tipizált (JSON-sémát is elfogadna), a miénk viszont Zod — a `safeParse` így
    // érhető el. A séma ATTÓL még a valódi, amit a modell kap.
    const schema = queryCustomersTool()
      .inputSchema as unknown as z.ZodType<unknown>;

    expect(schema.safeParse({ customerType: 'kávézó' }).success).toBe(false);
    expect(schema.safeParse({ customerType: 'iroda' }).success).toBe(true);
  });

  it('pontos kódra egy ügyfelet ad vissza, a kerettel együtt', async () => {
    const outcome = await executeQueryCustomers({ code: 'acme' });

    expect(outcome.isError).toBe(false);
    expect(outcome.rowCount).toBe(1);
    const rows: { code: string; budget: number; expertiseLevel: string }[] =
      JSON.parse(outcome.content);
    expect(rows[0].code).toBe('ACME');
    // A Decimal SZÁMKÉNT megy a modellnek, nem stringként — különben a modell
    // idézőjeles értéket látna, és nehezebben számolna vele.
    expect(rows[0].budget).toBe(1000);
    expect(rows[0].expertiseLevel).toBe('kezdő');
  });

  it('a kódot kisbetűsen is megtalálja (a kód normalizálva van)', async () => {
    const outcome = await executeQueryCustomers({ code: 'InItEcH' });

    expect(outcome.rowCount).toBe(1);
    expect(outcome.summary).toBe('1 ügyfél · INITECH');
  });

  it('városrészletre keres (ILIKE), és típusra szűr', async () => {
    const outcome = await executeQueryCustomers({
      search: 'budapest',
      customerType: 'iroda',
    });

    expect(outcome.isError).toBe(false);
    expect(outcome.rowCount).toBeGreaterThanOrEqual(3);
  });

  it('a `%` NEM joker a keresésben — escape-elve megy a DB-re', async () => {
    // A #8 PR-review 10. tétele: escape nélkül a `search: "%"` az ÖSSZES ügyfelet
    // visszaadta volna (a paraméterezés ez ellen nem véd, mert ez nem injekció, hanem
    // mintaszintaxis). Egyetlen ügyfél neve/városa sem tartalmaz `%`-ot, tehát a
    // helyes válasz 0 találat.
    const outcome = await executeQueryCustomers({ search: '%' });

    // `rowCount`-ot állítunk, nem a summary szövegét: a „0 találat" ellenőrzése
    // `toContain('0')`-val a „20 ügyfél" válaszra IS illeszkedne — vagyis pont a
    // hibás viselkedésre.
    expect(outcome.rowCount).toBe(0);
  });

  it('nem létező ügyfélre 0 találatot ad, hibajelzés NÉLKÜL', async () => {
    const outcome = await executeQueryCustomers({ code: 'NINCSILYEN' });

    expect(outcome.isError).toBe(false);
    expect(outcome.rowCount).toBe(0);
    expect(outcome.content).toContain('Nincs ilyen ügyfél');
  });

  it('paraméter nélkül listáz, de legfeljebb 20-at', async () => {
    const outcome = await executeQueryCustomers({});

    expect(outcome.isError).toBe(false);
    expect(outcome.rowCount).toBeLessThanOrEqual(20);
    expect(outcome.rowCount).toBeGreaterThan(0);
  });
});
