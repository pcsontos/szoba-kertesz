import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { queryReadonly, type DbReadonlyDeps } from '../run-sql/db-readonly.js';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import {
  CUSTOMER_COLUMNS,
  CUSTOMER_LIST_LIMIT,
  CUSTOMER_TYPES,
  QueryCustomersInputSchema,
} from './customer-schema.js';

// queryCustomers — a bolt ÜGYFELEINEK lekérdezése. A getClientPreferences utódja:
// a kódba égetett háromelemű térkép helyett valódi tábla, és nem csak "preferencia",
// hanem teljes profil (keret, szint, pet/kid-safe igény, jegyzet).
//
// A MEGLÉVŐ read-only poolon fut (db-readonly.ts), pontosan úgy, ahogy a listCategories —
// nem kell hozzá új kapcsolat, mert a _ro szerep az ALTER DEFAULT PRIVILEGES miatt
// automatikusan lát minden később létrehozott táblát.
//
// Az SQL PARAMÉTEREZETT, és az oszloplista KÓDBÓL jön (customer-schema.ts), nem a
// modelltől — a modell csak a szűrők ÉRTÉKÉT adja, a lekérdezés alakját sosem.

export const QUERY_CUSTOMERS_TOOL_NAME = 'queryCustomers';

export async function executeQueryCustomers(
  rawInput: unknown,
  deps: DbReadonlyDeps = {},
): Promise<ToolOutcome> {
  const parsed = QueryCustomersInputSchema.safeParse(rawInput ?? {});
  if (!parsed.success) {
    return {
      content:
        'Érvénytelen ügyfél-lekérdezés. Használható mezők: code (pontos ügyfélkód), ' +
        `search (név- vagy városrészlet), customerType (${CUSTOMER_TYPES.join(' | ')}).`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }

  const { code, search, customerType } = parsed.data;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (code) {
    values.push(code.toUpperCase());
    conditions.push(`code = $${values.length}`);
  }
  if (customerType) {
    values.push(customerType);
    conditions.push(`customer_type = $${values.length}`);
  }
  if (search) {
    values.push(`%${search}%`);
    conditions.push(
      `(name ILIKE $${values.length} OR city ILIKE $${values.length})`,
    );
  }

  const where =
    conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '';
  const sql =
    `SELECT ${CUSTOMER_COLUMNS} FROM customers${where} ` +
    `ORDER BY code ASC LIMIT ${CUSTOMER_LIST_LIMIT}`;

  try {
    const result = await queryReadonly(sql, values, deps);

    if (result.rowCount === 0) {
      return {
        content:
          'Nincs ilyen ügyfél a nyilvántartásban. Kérdezz vissza a felhasználótól, ' +
          'melyik ügyfélről van szó — ne találj ki adatot.',
        isError: false,
        summary: 'ügyfél-lekérdezés · 0 találat',
        // Az `sql` a MODELL által generált lekérdezés bizonyítéka; ez a lekérdezés
        // kódból épül, ezért — a listCategories és az upsertProduct mintájára — null.
        sql: null,
        rowCount: 0,
      };
    }

    const label = code?.toUpperCase() ?? search ?? customerType ?? 'összes';
    return {
      content: JSON.stringify(result.rows),
      isError: false,
      summary: `${result.rows.length} ügyfél · ${label}`,
      sql: null,
      rowCount: result.rows.length,
    };
  } catch (error) {
    return {
      content: `Az ügyfél-lekérdezés nem sikerült: ${
        error instanceof Error ? error.message : String(error)
      }`,
      isError: true,
      summary: null,
      sql: null,
      rowCount: null,
    };
  }
}

export const queryCustomersTool = (
  report?: ToolReporter,
): Tool<{ code?: string; search?: string; customerType?: string }, string> =>
  tool({
    description:
      'A bolt ügyfeleinek lekérdezése. Ha a kérdés ügyfélre hivatkozik (kóddal, névvel ' +
      'vagy várossal), ELŐBB ezt hívd: visszaadja a keretet (budget, Ft), a hozzáértést ' +
      '(expertiseLevel: kezdő | haladó | profi — ez a products.difficulty skálája), a ' +
      'pet/kid-safe igényt és a szöveges jegyzetet (notes: fényviszonyok, stílus). ' +
      'Paraméter nélkül az első 20 ügyfelet listázza.',
    inputSchema: z.object({
      code: z.string().optional().describe('Pontos ügyfélkód, pl. ACME.'),
      search: z
        .string()
        .optional()
        .describe('Név- vagy városrészlet kereséshez.'),
      customerType: z
        .string()
        .optional()
        .describe(`Szűrés típusra: ${CUSTOMER_TYPES.join(' | ')}.`),
    }),
    execute: async (input, { toolCallId }) => {
      const outcome = await executeQueryCustomers(input);
      report?.(toolCallId, QUERY_CUSTOMERS_TOOL_NAME, input, outcome);
      return outcome.content;
    },
  });
