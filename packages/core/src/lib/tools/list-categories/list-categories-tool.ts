import { tool, type Tool } from 'ai';
import { z } from 'zod';
import { queryReadonly, type DbReadonlyDeps } from '../run-sql/db-readonly.js';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';

export const LIST_CATEGORIES_TOOL_NAME = 'listCategories';

/**
 * A modelltől visszakapott tool-input `unknown` — a `runSql`-hez hasonlóan
 * Zod-dal validáljuk, még akkor is, ha ennek a tool-nak nincs érdemi mezője
 * (konvenció: `unknown` a nem megbízható bemenetre, sosem `any`).
 */
const ListCategoriesInputSchema = z.object({}).passthrough();

/**
 * A `listCategories` tool Anthropic-kompatibilis definíciója — nincs
 * bemeneti mezője, mert a mögötte futó lekérdezés fix
 * (`SELECT DISTINCT category`), nem a modell által generált SQL.
 */
export const listCategoriesToolDefinition = {
  name: LIST_CATEGORIES_TOOL_NAME,
  description:
    'A products katalógusban ténylegesen előforduló összes kategória lekérdezése ' +
    '(SELECT DISTINCT category). Ezt használd, ha a kérdés a kategóriákra vagy azok ' +
    'listájára vonatkozik, ahelyett hogy a rendszerpromptban felsorolt neveket találnád ki.',
  input_schema: {
    type: 'object',
    properties: {},
  },
};

export interface ListCategoriesToolSuccess {
  readonly ok: true;
  readonly categories: readonly string[];
}

export interface ListCategoriesToolFailure {
  readonly ok: false;
  readonly error: string;
}

export type ListCategoriesToolResult =
  | ListCategoriesToolSuccess
  | ListCategoriesToolFailure;

/**
 * Végrehajtja a `listCategories` tool-hívást: nincs SQL-guard (a lekérdezés
 * fix, nem a modell szövegéből épül), csak a read-only kapcsolaton
 * (`db-readonly.ts`) fut le. A `runSql`-hez hasonlóan szándékosan SOSEM
 * dob — hiba esetén `{ ok: false, error }`-t ad vissza, amit a hívó
 * (`agent.ts`) `tool_result`-ként (`is_error: true`) küld a modellnek.
 */
export async function executeListCategoriesTool(
  input: unknown,
  deps: DbReadonlyDeps = {},
): Promise<ListCategoriesToolResult> {
  const parsedInput = ListCategoriesInputSchema.safeParse(input);
  if (!parsedInput.success) {
    return {
      ok: false,
      error: `Érvénytelen listCategories bemenet: ${parsedInput.error.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    };
  }

  try {
    const result = await queryReadonly<{ category: string }>(
      'SELECT DISTINCT category FROM products ORDER BY category',
      deps,
    );
    return {
      ok: true,
      categories: result.rows.map((row) => row.category),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Az AI SDK felé eső tool-definíció. Paraméter nélküli tool — üres
 * objektum-séma; a mögötte futó lekérdezés fix, nem a modell szövegéből épül.
 */
export const listCategoriesTool = (
  report?: ToolReporter,
): Tool<Record<string, never>, string> =>
  tool({
    description: listCategoriesToolDefinition.description,
    inputSchema: z.object({}),
    execute: async (input, { toolCallId }) => {
      const result = await executeListCategoriesTool(input);
      const outcome: ToolOutcome = result.ok
        ? {
            content: JSON.stringify(result.categories),
            isError: false,
            summary: `${result.categories.length} kategória`,
            sql: null,
            rowCount: result.categories.length,
          }
        : {
            content: result.error,
            isError: true,
            summary: null,
            sql: null,
            rowCount: null,
          };
      report?.(toolCallId, LIST_CATEGORIES_TOOL_NAME, input, outcome);
      return outcome.content;
    },
  });
