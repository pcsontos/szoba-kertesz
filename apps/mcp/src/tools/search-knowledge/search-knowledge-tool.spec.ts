import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { RetrieveResult } from '@szoba-kertesz/core';
import {
  SEARCH_KNOWLEDGE_TOOL_NAME,
  registerSearchKnowledge,
} from './search-knowledge-tool.js';

// Ennek a fájlnak EGYETLEN saját logikája van: a core ToolOutcome-jának MCP-alakra fordítása
// (content-tömb + isError). A `retrieve` szeam a CORE-ban már készen állt — így ez a spec
// valódi MCP-híváson át mér, mégis API-hívás és DB nélkül fut.

async function connectTestServer(
  retrieve: (question: string) => Promise<RetrieveResult>,
): Promise<{ client: Client; server: McpServer }> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerSearchKnowledge(server, { retrieve });

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server };
}

describe('registerSearchKnowledge', () => {
  it('a találatokat egy text részben, a FORRÁS-sal együtt adja vissza', async () => {
    const { client, server } = await connectTestServer(async () => ({
      searchText: 'why do monstera leaves turn yellow',
      hits: [
        {
          id: 1,
          title: 'Monstera Care › Water',
          source: 'https://example.test/monstera',
          category: 'care',
          chunkIndex: 0,
          content: 'Túlöntözésnél sárgul.',
          distance: 0.21,
          score: 9,
        },
      ],
    }));

    const result = await client.callTool({
      name: SEARCH_KNOWLEDGE_TOOL_NAME,
      arguments: { kerdes: 'Miért sárgul a monstera levele?' },
    });

    expect(result.isError).toBe(false);
    const content = result.content as { type: string; text: string }[];
    expect(content).toHaveLength(1);
    // A forrás nem dísz: a grounding ezen áll, tehát benne KELL lennie a modellnek adott szövegben.
    expect(content[0]?.text).toContain('https://example.test/monstera');
    expect(content[0]?.text).toContain('Túlöntözésnél sárgul.');

    await client.close();
    await server.close();
  });

  it('a kérdést VÁLTOZATLANUL adja tovább a retrievalnek', async () => {
    const asked: string[] = [];
    const { client, server } = await connectTestServer(async (question) => {
      asked.push(question);
      return { searchText: question, hits: [] };
    });

    await client.callTool({
      name: SEARCH_KNOWLEDGE_TOOL_NAME,
      arguments: { kerdes: 'Mit tegyek, ha pajzstetves a fikusz?' },
    });

    expect(asked).toEqual(['Mit tegyek, ha pajzstetves a fikusz?']);

    await client.close();
    await server.close();
  });

  it('találat nélkül NEM hiba — a modellnek szóló magyar mondat megy vissza', async () => {
    const { client, server } = await connectTestServer(async () => ({
      searchText: 'x',
      hits: [],
    }));

    const result = await client.callTool({
      name: SEARCH_KNOWLEDGE_TOOL_NAME,
      arguments: { kerdes: 'Van-e a boltban időgép?' },
    });

    // Az üres találat NEM hibaállapot: a modellnek azt kell mondania, hogy nincs információja.
    expect(result.isError).toBe(false);
    const content = result.content as { text: string }[];
    expect(content[0]?.text).toContain('nincs');

    await client.close();
    await server.close();
  });

  it('a retrieval hibája isError: true-ként jön vissza, nem dobásként', async () => {
    const { client, server } = await connectTestServer(async () => {
      throw new Error('embedding API nem elérhető');
    });

    const result = await client.callTool({
      name: SEARCH_KNOWLEDGE_TOOL_NAME,
      arguments: { kerdes: 'teszt' },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { text: string }[];
    expect(content[0]?.text).toContain('embedding API nem elérhető');

    await client.close();
    await server.close();
  });
});
