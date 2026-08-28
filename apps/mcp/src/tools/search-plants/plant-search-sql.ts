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

/**
 * ILIKE-jokerek semlegesítése (a #11 review 6. tétele). A `%` és a `_` az ILIKE-ban
 * MINTA-karakter, nem szöveg: escape nélkül a „ficus_benjamina" keresés a `_` helyén BÁRMILYEN
 * karaktert elfogadna, tehát némán MÁST találna, mint amit a hívó kért. Nem biztonsági rés
 * (az érték paraméterként megy), hanem HELYESSÉGI kérdés — és a némán rossz találat egy idegen
 * host modelljénél pont olyan rossz, mint a hiba.
 *
 * A backslash-t is escapelni kell, ELSŐKÉNT, különben a saját escape-karakterünket rontanánk el.
 */
export function escapeLikeWildcards(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const SORT_COLUMNS: Record<(typeof SORT_KEYS)[number], string> = {
  ár: 'COALESCE(sale_price, price) ASC',
  '-ár': 'COALESCE(sale_price, price) DESC',
  értékelés: 'rating DESC, reviews_count DESC',
  készlet: 'stock DESC',
  név: 'name ASC',
};

/**
 * A hívó által kérhető legtöbb sor. NÉMÁN CSATOLVA a core `sql-guard.ts` `DEFAULT_LIMIT`-jéhez
 * (a #11 review 5. tétele): a guard a mi SELECT-ünket egy külső `… LIMIT 50`-be csomagolja,
 * tehát ha ez a szám valaha a guardé fölé nőne, a hívó többet kérne és némán kevesebbet kapna.
 * A guard konstansa nincs exportálva, tehát típussal nem kényszeríthető ki — ezért egy SPEC
 * méri a viszonyt (`plant-search-sql.spec.ts`), a repo szokása szerint.
 */
export const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 10;

/**
 * A „csak ezt mutasd" szűrők SZÁNDÉKOSAN `literal(true)`-k, nem `boolean`-ok (a #11 review 3.
 * tétele). Amíg `z.boolean()` volt, a hívó modell teljes joggal küldhetett `petSafe: false`-t
 * abban a hitben, hogy a NEM pet-safe növényekre szűr — a kód viszont csak a `true` ágat
 * kezelte, tehát SZŰRETLEN listát adott vissza, hibajelzés nélkül. A séma többet ígért, mint
 * amit a kód tudott. Így a `false` már a validáción fennakad, és a modell hibát KAP, nem néma
 * rossz halmazt.
 */
const onlyTrue = (description: string) => z.literal(true).optional().describe(description);

export const PlantSearchSchema = z.object({
  keres: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe(
      'Szabad szöveg: a magyar névben, a latin névben és a leírásban keres. A % és a _ ' +
        'karakter sima szövegként keresődik, nem mintaként.',
    ),
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
  minAr: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Alsó árhatár HUF-ban (akciós árral számol); nem lehet nagyobb a maxAr-nál.'),
  maxAr: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Felső árhatár HUF-ban (akciós árral számol).'),
  petSafe: onlyTrue(
    'Csak háziállatra biztonságos növények. Kizárólag `true` adható meg — a szűrő ' +
      'kikapcsolásához hagyd el a mezőt.',
  ),
  kidSafe: onlyTrue(
    'Csak gyerekre biztonságos növények. Kizárólag `true` adható meg — a szűrő ' +
      'kikapcsolásához hagyd el a mezőt.',
  ),
  legtisztito: onlyTrue(
    'Csak légtisztító hatású növények. Kizárólag `true` adható meg — a szűrő ' +
      'kikapcsolásához hagyd el a mezőt.',
  ),
  csakRaktaron: onlyTrue(
    'Csak a raktáron lévő tételek (stock > 0). Kizárólag `true` adható meg — a szűrő ' +
      'kikapcsolásához hagyd el a mezőt.',
  ),
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

/**
 * Mezők KÖZÖTTI ellenőrzés, magyar hibaüzenettel — vagy `null`, ha rendben van.
 *
 * Miért nem `.refine()` a sémán? Mert az MCP SDK `registerTool`-ja `ZodRawShape`-et vár, és a
 * `.shape`-ből SAJÁT `z.object()`-et épít: egy `.refine()` a mi sémánkon soha nem futna le egy
 * valódi MCP-híváskor (ráadásul a `ZodEffects`-nek nincs is `.shape`-je). Ezért a keresztszabály
 * a tool kezelőjében fut le, explicit hívással.
 */
export function validatePlantSearch(filters: PlantSearch): string | null {
  if (filters.minAr !== undefined && filters.maxAr !== undefined && filters.minAr > filters.maxAr) {
    return `Az alsó árhatár (${filters.minAr}) nagyobb a felsőnél (${filters.maxAr}) — így egyetlen termék sem felelhet meg.`;
  }
  return null;
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
    // Az ESCAPE '\' a három ILIKE MINDEGYIKÉHEZ kell: a jokerek semlegesítése (escapeLikeWildcards)
    // csak akkor ér valamit, ha a Postgres tudja, mi az escape-karakter.
    where(
      (p) =>
        `(name ILIKE ${p} ESCAPE '\\' OR latin_name ILIKE ${p} ESCAPE '\\' ` +
        `OR description ILIKE ${p} ESCAPE '\\')`,
      `%${escapeLikeWildcards(filters.keres)}%`,
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
