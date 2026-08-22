import { z } from 'zod';

// customer-schema.ts — a queryCustomers HATÁRA. Az upsert-product/product-schema.ts
// mintájára: a Zod-séma és a megengedett oszlopnevek EGY helyen, a tool mellett.
//
// Miért fix oszloplista: a SELECT sosem `*`. Így egy későbbi séma-bővítés (pl. egy
// belső megjegyzés-mező) nem szivárog ki magától a modellhez.

/** Az ügyfél típusa. Az értékkészlet a seed-adaté (packages/db/prisma/customers.ts). */
export const CUSTOMER_TYPES = [
  'magánszemély',
  'iroda',
  'étterem',
  'hotel',
  'üzlet',
] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];

/**
 * A modellnek visszaadott oszlopok — ebben a sorrendben. A `budget` `::float8`-ra
 * van kasztolva, mert a `pg` a `numeric`-et STRINGKÉNT adja vissza (a pontosság
 * megőrzése miatt), és a modell így idézőjeles "1000"-et látna szám helyett.
 */
export const CUSTOMER_COLUMNS =
  'code, name, city, customer_type AS "customerType", budget::float8 AS budget, ' +
  'expertise_level AS "expertiseLevel", pet_safe_required AS "petSafeRequired", ' +
  'kid_safe_required AS "kidSafeRequired", notes';

/** Legfeljebb ennyi ügyfél megy vissza a modellnek egy hívásból. */
export const CUSTOMER_LIST_LIMIT = 20;

export const QueryCustomersInputSchema = z.object({
  code: z.string().trim().min(1).optional(),
  search: z.string().trim().min(1).optional(),
  customerType: z.enum(CUSTOMER_TYPES).optional(),
});

export type QueryCustomersInput = z.infer<typeof QueryCustomersInputSchema>;
