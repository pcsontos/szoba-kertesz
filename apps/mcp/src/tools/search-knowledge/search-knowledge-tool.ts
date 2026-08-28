import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { executeSearchKnowledge } from '@szoba-kertesz/core';

// search_knowledge — a HARMADIK stílus: nem új logika, hanem egy MEGLÉVŐ core-tool átkötése
// MCP-re. A core-ban a tool két részre van vágva (lásd tool-outcome.ts): az
// `executeSearchKnowledge(input)` a határvédelem és a logika (Zod, RAG-retrieval), a
// `searchKnowledgeTool(report)` az AI SDK-nak szóló definíció. Az MCP-nek csak a MÁSODIK fele
// idegen — az elsőt változtatás nélkül újrahasználjuk: ugyanaz a validáció, ugyanaz a magyar
// hibaszöveg, ugyanaz a pipeline (HyDE → embedding → pgvector top-20 → rerank → top-5), akár
// az agent hívja, akár egy idegen host.
//
// MELLÉKHATÁS, ami a main.ts-t indokolja: a retrieval a `traceLog`-on (rag/retrieve.ts) át a
// stdout-ra ír. Ez a search_knowledge tool AGENT-LOOP NÉLKÜL hívja az executeSearchKnowledge-et
// — a `setQuiet(!print)`-et normál esetben a runAgentLoop állítja, itt viszont sosem futna le.
// Ezért a `main.ts` a boot elején MAGA hívja a `setQuiet(true)`-t (8. döntés).

export const SEARCH_KNOWLEDGE_TOOL_NAME = 'search_knowledge';

export function registerSearchKnowledge(server: McpServer): void {
  server.registerTool(
    SEARCH_KNOWLEDGE_TOOL_NAME,
    {
      title: 'Keresés a gondozási tudásbázisban',
      description:
        'Szemantikus keresés a bolt növénygondozási cikkeiben: kártevők, betegségek, öntözés, ' +
        'fény, átültetés, évszakos teendők. Minden találat a FORRÁS-URL-jével jön — a ' +
        'válaszban hivatkozz rájuk. „Hogyan / miért / mit tegyek" jellegű kérdésekhez való; a ' +
        'katalógus tényeihez (ár, készlet, méret) a search_plants a helyes eszköz.',
      inputSchema: {
        kerdes: z
          .string()
          .trim()
          .min(1)
          .describe(
            'A kérdés természetes nyelven, ahogy elhangzott — ne alakítsd kulcsszavakká, a ' +
              'keresés jelentés alapján dolgozik.',
          ),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ kerdes }) => {
      // A core execute-ja SOHA nem dob: hibát is ToolOutcome-ként ad vissza. Csak az alakot
      // kell MCP-re fordítani (content-tömb + isError).
      const outcome = await executeSearchKnowledge({ question: kerdes });

      return {
        isError: outcome.isError,
        content: [{ type: 'text' as const, text: outcome.content }],
      };
    },
  );
}
