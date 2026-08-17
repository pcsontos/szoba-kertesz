import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import {
  CATEGORY,
  DIFFICULTY,
  LIGHT,
  LOCATION,
  PRODUCT_COLUMNS,
  ProductInputSchema,
  WATERING,
  type ProductInput,
} from './product-schema.js';
import { queryReadWrite, type DbReadWriteDeps } from './db-readwrite.js';

// upsertProduct tool — az INGEST-agent EGYETLEN írási útja a katalógusba. A modell egy teljes,
// sémára illesztett termék-objektumot ad; mi a rendszer-határon szigorúan validálunk (Zod,
// product-schema.ts), majd latin név szerint upsertelünk (paraméterezett SQL a read-write
// kapcsolaton, db-readwrite.ts). Soha nem dob: a hibát is a modellnek visszaadható magyar
// szövegként adja vissza, így az agent tud belőle javítani. Nyers write-SQL NINCS — ez a
// read/write szétválasztás tool-oldala, a DB-szerepkörök szintjén pedig a szoba-kertesz_rw őrzi.

export const UPSERT_PRODUCT_TOOL_NAME = 'upsertProduct';

export type UpsertAction = 'created' | 'updated';

export interface UpsertResult {
  readonly action: UpsertAction;
  readonly id: number;
  readonly latinName: string;
}

/**
 * Upsert latin név szerint (case-insensitive). Meglévőt frissít, újat beszúr — idempotens.
 *
 * EGYETLEN, atomi lekérdezés. Korábban két lépés volt (SELECT id → UPDATE vagy INSERT), és
 * a kettő közé befért egy másik írás: két egyidejű upsert ugyanarra a névre két sort hozott
 * létre, mert mindkét SELECT üresen tért vissza. Az `ON CONFLICT` ezt a rést zárja be — a
 * döntést (beszúrás vagy frissítés) a Postgres hozza meg, a `lower(latin_name)` unique index
 * alapján (lásd a 20260817112400_products_latin_name_unique migrációt).
 *
 * A `xmax = 0` a szokásos postgres-fogás: frissen BESZÚRT sornál a rendszeroszlop 0, a
 * konfliktus miatt FRISSÍTETT sornál a módosító tranzakció azonosítója — ebből tudjuk meg
 * egy körben, melyik ág futott, külön lekérdezés nélkül.
 */
export async function upsertProduct(
  input: ProductInput,
  deps: DbReadWriteDeps = {},
): Promise<UpsertResult> {
  // Az oszlopnevek a PRODUCT_COLUMNS fix, KÓDBAN rögzített listájából jönnek — soha nem a
  // modell inputjából; az értékek pedig kizárólag $n paraméterként. String-konkatenáció nincs.
  const values = PRODUCT_COLUMNS.map(([field]) => input[field]);
  const cols = PRODUCT_COLUMNS.map(([, col]) => col).join(', ');
  const placeholders = PRODUCT_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
  const setClause = PRODUCT_COLUMNS.map(
    ([, col]) => `${col} = EXCLUDED.${col}`,
  ).join(', ');

  const result = await queryReadWrite<{ id: number; created: boolean }>(
    `INSERT INTO products (${cols}) VALUES (${placeholders})
     ON CONFLICT (lower(latin_name)) DO UPDATE SET ${setClause}
     RETURNING id, (xmax = 0) AS created`,
    values,
    deps,
  );

  const row = result.rows[0];
  return {
    action: row.created ? 'created' : 'updated',
    id: row.id,
    latinName: input.latinName,
  };
}

/**
 * validál → upsert → szövegesített kimenet. Soha nem dob.
 *
 * A `deps` a tesztelhetőség miatt van átvezetve (injektált pool → valódi DB nélkül is
 * bizonyítható, hogy érvénytelen terméknél EGYETLEN lekérdezés sem fut le); a tool-factory
 * `execute`-ja `deps` nélkül hívja, tehát a produkciós út a megosztott read-write pool.
 */
export async function executeUpsertProduct(
  rawInput: unknown,
  deps: DbReadWriteDeps = {},
): Promise<ToolOutcome> {
  const parsed = ProductInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    // Az ÖSSZES hibát egyben adjuk vissza, hogy a modell egy körben pótolja, ne pingpongozzon.
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
      .join('; ');
    return {
      content: `Érvénytelen termék — nem írtam DB-be: ${issues}`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }

  try {
    const result = await upsertProduct(parsed.data, deps);
    const verb = result.action === 'created' ? 'létrehozva' : 'frissítve';
    return {
      content: JSON.stringify({
        ok: true,
        action: result.action,
        id: result.id,
        latinName: result.latinName,
        message: `"${parsed.data.name}" (${result.latinName}) ${verb}. id=${result.id}`,
      }),
      isError: false,
      summary: `UPSERT products (${result.action}) · ${result.latinName}`,
      sql: null,
      rowCount: 1,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: `Adatbázis-hiba az upsert során: ${message}`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }
}

/**
 * A modell felé eső termék-alak: leíró, de MEGENGEDŐ (a kötött szótárak itt `string`-ek,
 * az érvényes értékek a `describe`-ban). A szigorú ellenőrzés az `executeUpsertProduct`-ban
 * fut — így hibás bemenetre a SAJÁT magyar üzenetünk megy vissza, nem az SDK kivétele, és
 * a modell tud belőle javítani. Ugyanaz a kétrétegű minta, mint a `runSql`-nél.
 */
const UpsertProductToolInputSchema = z.object({
  name: z.string().describe('MAGYAR termék-név.'),
  latinName: z
    .string()
    .describe('Botanikai (latin) név — ez a termék kulcsa (dedup).'),
  category: z.string().describe(`Egy ezek közül: ${CATEGORY.join(' | ')}.`),
  location: z.string().describe(`Egy ezek közül: ${LOCATION.join(' | ')}.`),
  price: z.number().describe('Ár HUF-ban (> 0).'),
  salePrice: z
    .number()
    .nullable()
    .describe('Akciós ár HUF-ban, vagy null. Csak a price alatt lehet.'),
  stock: z.number().int().describe('Raktárkészlet (db), >= 0.'),
  light: z.string().describe(`Egy ezek közül: ${LIGHT.join(' | ')}.`),
  watering: z.string().describe(`Egy ezek közül: ${WATERING.join(' | ')}.`),
  difficulty: z.string().describe(`Egy ezek közül: ${DIFFICULTY.join(' | ')}.`),
  currentHeightCm: z.number().int().describe('Jelenlegi magasság cm.'),
  maxHeightCm: z.number().int().describe('Kifejlett magasság cm.'),
  currentPotCm: z.number().int().describe('Cserép átmérő cm.'),
  petSafe: z.boolean().describe('Háziállat-barát.'),
  kidSafe: z.boolean().describe('Gyerekbiztos.'),
  airPurifying: z.boolean().describe('Légtisztító.'),
  rating: z.number().describe('Értékelés 0–5. Frissen felvett terméknél 0.'),
  reviewsCount: z
    .number()
    .int()
    .describe('Értékelések száma. Frissen felvett terméknél 0.'),
  description: z.string().describe('MAGYAR leírás a termékről.'),
});

export type UpsertProductToolInput = z.infer<
  typeof UpsertProductToolInputSchema
>;

/** Az AI SDK felé eső tool-definíció — a kétrétegű tool-felület felső rétege. */
export const upsertProductTool = (
  report?: ToolReporter,
): Tool<UpsertProductToolInput, string> =>
  tool({
    description:
      'Létrehoz vagy frissít EGY terméket a katalógusban, latin név szerint (case-insensitive). ' +
      'Teljes, sémára illesztett termék-objektumot vár (magyar name és description, HUF ár). ' +
      'Ha a latin név már létezik, FRISSÍTI; egyébként újat hoz létre. Használat előtt runSql-lel ' +
      'ellenőrizd a jelenlegi állapotot, hogy tudd, mit írsz felül.',
    inputSchema: UpsertProductToolInputSchema,
    execute: async (input, { toolCallId }) => {
      const outcome = await executeUpsertProduct(input);
      report?.(toolCallId, UPSERT_PRODUCT_TOOL_NAME, input, outcome);
      return outcome.content;
    },
  });
