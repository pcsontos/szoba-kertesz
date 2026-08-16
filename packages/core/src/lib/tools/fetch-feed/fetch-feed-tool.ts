import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { fetchFeedCandidates, type FeedDomain } from './shopify-feed.js';

// fetchFeed tool — az INGEST-agent ezzel olvassa be ÉLŐBEN a webshop-feedet (Shopify
// products.json), hogy a friss forrás-adat (ár, akció, cserépméret, tag-ek, leírás) alapján
// frissítse a katalógust. A letöltés/normalizálás motorja a shopify-feed.ts; ez a fájl a
// tool-héj: modell-séma + határvédelem + outcome. Az adatbázisba NEM ez ír (az upsertProduct).

export const FETCH_FEED_TOOL_NAME = 'fetchFeed';

const InputSchema = z.object({
  source: z.enum(['tropicalhome.hu', 'thesill.com']).optional(),
  filter: z.string().optional(),
  limit: z.number().int().positive().max(100).optional(),
});

/** validál → letölt+normalizál (shopify-feed) → szövegesít. Soha nem dob. */
export async function executeFetchFeed(
  rawInput: unknown,
): Promise<ToolOutcome> {
  const parsed = InputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      content: `Hibás fetchFeed-bemenet: ${parsed.error.issues[0]?.message ?? 'ismeretlen'}`,
      isError: true,
      summary: null,
      rowCount: null,
    };
  }

  try {
    const result = await fetchFeedCandidates({
      source: parsed.data.source as FeedDomain | undefined,
      filter: parsed.data.filter,
      limit: parsed.data.limit,
    });
    return {
      content: JSON.stringify(result),
      isError: false,
      summary: `FETCH ${result.source} (${result.matched}/${result.totalPlants} találat)`,
      rowCount: result.candidates.length,
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: `Feed-hiba: ${message}`,
      isError: true,
      summary: null,
      rowCount: null,
    };
  }
}

/**
 * A modell felé eső tool-definíció. Bekötés az agentbe: egy sor a toolset-ben.
 * A séma itt is megengedőbb, mint a határvédelem: a szigorú ellenőrzés az
 * `executeFetchFeed`-ben fut, hogy hibára a saját magyar üzenetünk menjen vissza.
 */
const FetchFeedToolInputSchema = z.object({
  source: z
    .enum(['tropicalhome.hu', 'thesill.com'])
    .optional()
    .describe('A feed forrása. Alap: tropicalhome.hu.'),
  filter: z
    .string()
    .optional()
    .describe('Szűrő névre/latin névre (részszó), pl. "monstera mint".'),
  limit: z
    .number()
    .int()
    .optional()
    .describe('Max visszaadott találat (alap 20).'),
});

export type FetchFeedToolInput = z.infer<typeof FetchFeedToolInputSchema>;

export const fetchFeedTool = (
  report?: ToolReporter,
): Tool<FetchFeedToolInput, string> =>
  tool({
    description:
      'Beolvassa egy webshop élő termék-feedjét (Shopify products.json) és normalizált termék-jelölteket ' +
      'ad vissza: latin név, ár (már HUF-ra váltva), akciós ár, cserépméret, tag-ek, rövid leírás. ' +
      'Forrás: tropicalhome.hu (alap) vagy thesill.com. Szűrj a filter paraméterrel egy konkrét termékre ' +
      '(pl. "monstera mint"), hogy ne a teljes feed jöjjön vissza. A kapott adatból állítsd össze a ' +
      'magyar termék-mezőket, majd upsertProduct-tal írd be.',
    inputSchema: FetchFeedToolInputSchema,
    execute: async (input, { toolCallId }) => {
      const outcome = await executeFetchFeed(input);
      report?.(toolCallId, FETCH_FEED_TOOL_NAME, input, outcome);
      return outcome.content;
    },
  });
