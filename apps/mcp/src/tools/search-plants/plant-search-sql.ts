import { z } from 'zod';
import { CATEGORY, LOCATION, LIGHT, WATERING, DIFFICULTY } from '@szoba-kertesz/core';

// plant-search-sql.ts — a DETERMINISZTIKUS kereső magja: strukturált szűrőkből paraméterezett
// SELECT. Nincs benne modell: ugyanaz a bemenet mindig ugyanazt az SQL-t adja, ezért
// unit-tesztelhető (ellentétben az ask_szobakertesz-szel, ami modellt hív).
//
// Az enumok a CORE product-schema.ts-éből jönnek, nem helyi másolatból (4. döntés) — ha egy
// kötött szótár bővül a katalógusban, ez a felület automatikusan követi, nem sodródik el.
//
// BIZTONSÁG: az értékek soha nem kerülnek bele az SQL szövegébe — minden szűrő $n placeholder,
// az értékek külön tömbben mennek a pg-nek. Az oszlop- és irány-nevek nem jöhetnek a hívótól
// szabad szövegként: a `rendezes` egy KULCS, az oszlopnevet a SORT_COLUMNS fix táblázat adja.

export const SORT_KEYS = ['ár', '-ár', 'értékelés', 'készlet', 'név'] as const;

const SORT_COLUMNS: Record<(typeof SORT_KEYS)[number], string> = {
  ár: 'COALESCE(sale_price, price) ASC',
  '-ár': 'COALESCE(sale_price, price) DESC',
  értékelés: 'rating DESC, reviews_count DESC',
  készlet: 'stock DESC',
  név: 'name ASC',
};

export const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

export const PlantSearchSchema = z.object({
  keres: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Szabad szöveg: a magyar névben, a latin névben és a leírásban keres.'),
  kategoria: z.enum(CATEGORY).optional(),
  hely: z
    .enum(LOCATION)
    .optional()
    .describe(
      'Hol tartható. BEFOGADÓ: "beltéri"/"kültéri" a "mindkettő" besorolású termékeket ' +
        'is visszahozza (azok mindkét helyre jók); "mindkettő" pontos egyezés.',
    ),
  feny: z.enum(LIGHT).optional(),
  ontozes: z.enum(WATERING).optional(),
  nehezseg: z.enum(DIFFICULTY).optional(),
  minAr: z.number().int().nonnegative().optional(),
  maxAr: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Felső árhatár HUF-ban (akciós árral számol).'),
  petSafe: z.boolean().optional().describe('Csak háziállatra biztonságos növények.'),
  kidSafe: z.boolean().optional(),
  legtisztito: z.boolean().optional().describe('Csak légtisztító hatású növények.'),
  csakRaktaron: z.boolean().optional().describe('Csak a raktáron lévő tételek (stock > 0).'),
  maxMagassagCm: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('A KIFEJLETT (max_height_cm) magasság felső határa — szoba-illesztéshez.'),
  maxCserepCm: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('A jelenlegi cserépátmérő (current_pot_cm) felső határa.'),
  rendezes: z.enum(SORT_KEYS).optional().describe('Rendezési kulcs; alap: értékelés szerint.'),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
});

export type PlantSearch = z.infer<typeof PlantSearchSchema>;

export interface PreparedQuery {
  readonly sql: string;
  readonly params: unknown[];
}

const SELECTED_COLUMNS = [
  'id',
  'name',
  'latin_name',
  'category',
  'location',
  'price',
  'sale_price',
  'stock',
  'light',
  'watering',
  'difficulty',
  'current_height_cm',
  'max_height_cm',
  'current_pot_cm',
  'pet_safe',
  'kid_safe',
  'air_purifying',
  'rating',
  'reviews_count',
].join(', ');

/** Szűrőkből paraméterezett SELECT. Tiszta függvény: se DB, se modell — ezért tesztelhető. */
export function buildPlantSearchSql(filters: PlantSearch): PreparedQuery {
  const conditions: string[] = [];
  const params: unknown[] = [];

  /** Egy feltétel hozzáadása: az ÉRTÉK mindig paraméterként megy, a szöveg fix. */
  const where = (fragment: (placeholder: string) => string, value: unknown): void => {
    params.push(value);
    conditions.push(fragment(`$${params.length}`));
  };

  if (filters.keres !== undefined) {
    where(
      (p) => `(name ILIKE ${p} OR latin_name ILIKE ${p} OR description ILIKE ${p})`,
      `%${filters.keres}%`,
    );
  }
  if (filters.kategoria !== undefined) {
    where((p) => `category = ${p}`, filters.kategoria);
  }
  if (filters.hely !== undefined) {
    // BEFOGADÓ (16. döntés): a "mindkettő" besorolású termék minden hely-szűrésnél benne
    // van, mert az a doménben azt jelenti, hogy MINDKÉT helyre jó.
    const allowed = filters.hely === 'mindkettő' ? ['mindkettő'] : [filters.hely, 'mindkettő'];
    const placeholders = allowed.map((value) => {
      params.push(value);
      return `$${params.length}`;
    });
    conditions.push(`location IN (${placeholders.join(', ')})`);
  }
  if (filters.feny !== undefined) {
    where((p) => `light = ${p}`, filters.feny);
  }
  if (filters.ontozes !== undefined) {
    where((p) => `watering = ${p}`, filters.ontozes);
  }
  if (filters.nehezseg !== undefined) {
    where((p) => `difficulty = ${p}`, filters.nehezseg);
  }
  if (filters.minAr !== undefined) {
    where((p) => `COALESCE(sale_price, price) >= ${p}`, filters.minAr);
  }
  if (filters.maxAr !== undefined) {
    where((p) => `COALESCE(sale_price, price) <= ${p}`, filters.maxAr);
  }
  if (filters.maxMagassagCm !== undefined) {
    where((p) => `max_height_cm <= ${p}`, filters.maxMagassagCm);
  }
  if (filters.maxCserepCm !== undefined) {
    where((p) => `current_pot_cm <= ${p}`, filters.maxCserepCm);
  }
  if (filters.petSafe === true) {
    conditions.push('pet_safe = TRUE');
  }
  if (filters.kidSafe === true) {
    conditions.push('kid_safe = TRUE');
  }
  if (filters.legtisztito === true) {
    conditions.push('air_purifying = TRUE');
  }
  if (filters.csakRaktaron === true) {
    conditions.push('stock > 0');
  }

  const whereClause = conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const orderBy = SORT_COLUMNS[filters.rendezes ?? 'értékelés'];
  const limit = filters.limit ?? DEFAULT_LIMIT;

  return {
    sql: `SELECT ${SELECTED_COLUMNS} FROM products${whereClause} ORDER BY ${orderBy} LIMIT ${limit}`,
    params,
  };
}
