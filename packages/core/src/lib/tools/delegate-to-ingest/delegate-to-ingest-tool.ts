import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { askIngestAgent } from '../../agents/ingest-agent/ingest-agent.js';
import type { AskOptions, AskResult } from '../../agents/agent-loop.js';

/**
 * A `delegateToIngest` tool: a query-agent átad egy katalógus-módosítást az
 * ingest-agentnek — TOOL-HÍVÁSKÉNT. Ez a valódi multi-agent kapocs.
 *
 * Amit a szerkezetből érdemes látni: egy AGENT is lehet egy másik agent TOOLJA.
 * A külső loop szempontjából ez ugyanolyan tool, mint a runSql — ugyanaz a
 * ToolOutcome megy vissza a Trace-nek. Belül viszont egy TELJES második loop
 * fut, saját prompttal, saját toolkészlettel és saját DB-jogosultsággal
 * (szoba-kertesz_rw). A query-agent továbbra sem ír: csak DELEGÁL.
 *
 * A beágyazott futás SAJÁT JSONL-sort és saját Trace-t ír — szándékosan.
 * Az a futás valóban elment tokeneket; ha elnyelnénk, a költségbecslés alulmérne.
 */

export const DELEGATE_TO_INGEST_TOOL_NAME = 'delegateToIngest';

export interface DelegateToIngestOptions {
  /** Élő, színes Trace a beágyazott futáshoz is (a külső loop beállítását örökli). */
  readonly print?: boolean;
  /** A beágyazott futás Trace-nyomának kiírása (tesztben false). */
  readonly persistTrace?: boolean;
  /**
   * Teszt-szeam: a beágyazott ingest-futtató. Alapból a VALÓDI `askIngestAgent`
   * — így a produkciós út be van kötve, a specek viszont API-hívás nélkül futnak.
   */
  readonly run?: (
    instruction: string,
    options?: AskOptions,
  ) => Promise<AskResult>;
}

export const delegateToIngestTool = (
  report?: ToolReporter,
  options: DelegateToIngestOptions = {},
): Tool<{ instruction: string }, string> => {
  const run = options.run ?? askIngestAgent;

  return tool({
    description:
      'Átad egy katalógus-módosítási feladatot a katalóguskezelő (ingest) agentnek: új termék ' +
      'felvétele, meglévő termék adatainak javítása, vagy a Shopify-feed alapján frissítés. ' +
      'Az instruction a teljes, önmagában értelmezhető utasítás magyarul — a másik agent NEM ' +
      'látja a beszélgetést, csak ezt a mondatot. Csak akkor hívd, ha a felhasználó ténylegesen ' +
      'MÓDOSÍTANI kér a katalóguson; kérdésre a runSql való.',
    inputSchema: z.object({
      instruction: z
        .string()
        .describe(
          'A katalógus-módosítás teljes utasítása magyarul, önmagában értelmezhetően.',
        ),
    }),
    execute: async (input, { toolCallId }) => {
      const instruction = input.instruction.trim();

      if (instruction === '') {
        const outcome: ToolOutcome = {
          content:
            'Üres utasítást nem lehet delegálni. Írd le egy mondatban, mit kell módosítani a katalóguson.',
          isError: true,
          summary: null,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, DELEGATE_TO_INGEST_TOOL_NAME, input, outcome);
        return outcome.content;
      }

      try {
        const result = await run(instruction, {
          print: options.print,
          persistTrace: options.persistTrace,
        });
        const outcome: ToolOutcome = {
          content: result.answer,
          isError: false,
          summary: `ingest-agent · ${result.toolSteps.length} tool-lépés · ${result.usage.inputTokens + result.usage.outputTokens} token`,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, DELEGATE_TO_INGEST_TOOL_NAME, input, outcome);
        return outcome.content;
      } catch (error: unknown) {
        // SOSEM dobunk tovább: egy elhasalt belső futás nem viheti magával a
        // külső loopot. A hibából a modellnek olvasható szöveg lesz.
        const message = error instanceof Error ? error.message : String(error);
        const outcome: ToolOutcome = {
          content: `A katalógus-módosítás nem sikerült: ${message}`,
          isError: true,
          summary: null,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, DELEGATE_TO_INGEST_TOOL_NAME, input, outcome);
        return outcome.content;
      }
    },
  });
};
