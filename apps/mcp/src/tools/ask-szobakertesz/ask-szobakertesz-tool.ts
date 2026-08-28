import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { askAgent, type AskAgentOptions, type AskResult } from '@szoba-kertesz/core';
import { errorMessage } from '../../lib/error-message.js';

// ask_szobakertesz — az AGENT-AS-TOOL. A hívó host (Claude Code / Claude Desktop) számára ez
// egy sima tool-hívás, de mögötte a MI teljes agent-loopunk fut: saját system prompt, saját
// toolkészlet (runSql, searchKnowledge, listCategories, queryCustomers), több kör, majd kész
// magyar válasz.
//
//   Claude (a hívó)  →  MCP tool: ask_szobakertesz  →  a mi query-agentünk
//                                                        ├── runSql          (katalógus)
//                                                        ├── searchKnowledge (RAG tudásbázis)
//                                                        ├── listCategories
//                                                        └── queryCustomers
//
// MIÉRT ÍGY: a domén-tudás (SQL-szabályok, séma, magyar hangnem, RAG-forrásidézés) a MI
// promptunkban van, nem a hívóéban. Cserébe lassabb (több modellhívás), és a hívó nem lát bele
// a lépésekbe — a nyom nálunk marad (logs/agent.log, logs/<ts>.json).
//
// SZEREP (7. döntés, ez a kör legfontosabb biztonsági állítása): FIXEN 'customer'. Adminként a
// query-agent megkapná a delegateToIngest toolt, azzal az MCP-n át ÍRNI lehetne a katalógusba
// — egy idegen host modellje. Az MCP-felület read-only marad.
//
// print: FIXEN false — a színes Trace enélkül a stdout-ra menne és szétverné a JSON-RPC
// folyamot (lásd main.ts kettős stdout-védelme).
//
// Nincs `result.tracePath` (a mi AskResult-unk nem tartalmaz ilyen mezőt, ellentétben a
// kurzuséval) — a token-összegzés helyette csak a felhasznált tokenszámot adja vissza.

export const ASK_SZOBAKERTESZ_TOOL_NAME = 'ask_szobakertesz';

const QUESTION_MAX = 1000;

export interface AskSzobaKerteszOptions {
  /**
   * Teszt-szeam: a hívott agent-futtató. Alapból a VALÓDI askAgent — a produkciós út be van
   * kötve, a specek viszont API-hívás és DB nélkül futnak (ugyanaz a minta, mint a core
   * delegateToIngestTool `run` opciója).
   */
  readonly ask?: (question: string, options: AskAgentOptions) => Promise<AskResult>;
}

export function registerAskSzobakertesz(
  server: McpServer,
  options: AskSzobaKerteszOptions = {},
): void {
  const ask = options.ask ?? askAgent;

  server.registerTool(
    ASK_SZOBAKERTESZ_TOOL_NAME,
    {
      title: 'Kérdezd meg a szoba-kertész szakértőt',
      description:
        'Természetes nyelvű kérdést tesz fel a szoba-kertész szakértő agentnek, ami a ' +
        'növény-katalógusból (ár, készlet, fény- és vízigény, pet-safe) és a gondozási ' +
        'tudásbázisból dolgozik, és kész, magyar nyelvű választ ad forrásokkal. Akkor ' +
        'használd, ha ajánlást, gondozási tanácsot vagy összetett, több szempontú kérdésre ' +
        'választ kérsz. Ha csak nyers katalógus-sorokra van szükséged, a search_plants ' +
        'gyorsabb; ha csak gondozási cikkekre, a search_knowledge.',
      inputSchema: {
        kerdes: z
          .string()
          .trim()
          .min(1)
          .max(QUESTION_MAX)
          .describe(
            'A kérdés — magyarul a legjobb, pl. "milyen pet-safe növény bírja az árnyékot?"',
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ kerdes }) => {
      try {
        const result = await ask(kerdes, { role: 'customer', print: false });

        return {
          content: [
            { type: 'text' as const, text: result.answer },
            {
              type: 'text' as const,
              text:
                `— szoba-kertész agent · ${result.usage.inputTokens}/` +
                `${result.usage.outputTokens} token`,
            },
          ],
        };
      } catch (error: unknown) {
        // Az `errorMessage` az AggregateError-t is kicsomagolja (a #11 review 4. tétele):
        // DB-leállásnál különben ÜRES szöveg menne vissza a hívó modellnek.
        return {
          isError: true,
          content: [
            {
              type: 'text' as const,
              text: `A szoba-kertész agent hibára futott: ${errorMessage(error)}`,
            },
          ],
        };
      }
    },
  );
}
