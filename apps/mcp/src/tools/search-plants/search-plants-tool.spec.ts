import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  SEARCH_PLANTS_TOOL_NAME,
  registerSearchPlants,
  type SearchPlantsOptions,
} from './search-plants-tool.js';

// A tool SAJÁT logikája: keresztvalidálás → guard → JSON-alak → hibafordítás. A `query` szeammal
// mindez DB nélkül mérhető (a #11 review 7. tétele).

type QueryFn = NonNullable<SearchPlantsOptions['query']>;

async function connectTestServer(
  query: QueryFn,
): Promise<{ client: Client; server: McpServer }> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerSearchPlants(server, { query });

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server };
}

describe('registerSearchPlants', () => {
  it('a sorokat rowCount-tal együtt, JSON-ként adja vissza', async () => {
    const { client, server } = await connectTestServer(async () => ({
      rows: [{ id: 1, name: 'Bazsalikom' }],
      rowCount: 1,
    }));

    const result = await client.callTool({
      name: SEARCH_PLANTS_TOOL_NAME,
      arguments: { limit: 1 },
    });

    const content = result.content as { text: string }[];
    expect(JSON.parse(content[0]?.text ?? '')).toEqual({
      rowCount: 1,
      rows: [{ id: 1, name: 'Bazsalikom' }],
    });

    await client.close();
    await server.close();
  });

  it('a GUARDOLT SQL megy a DB-nek, nem a nyers — és paraméterekkel', async () => {
    const seen: { sql: string; params: unknown[] }[] = [];
    const { client, server } = await connectTestServer(async (sql, params) => {
      seen.push({ sql, params });
      return { rows: [], rowCount: 0 };
    });

    await client.callTool({
      name: SEARCH_PLANTS_TOOL_NAME,
      arguments: { keres: 'monstera' },
    });

    // A guard külső LIMIT-be csomagol — ez a bizonyíték, hogy tényleg átment rajta.
    expect(seen[0]?.sql).toContain('AS _q LIMIT');
    expect(seen[0]?.params).toEqual(['%monstera%']);

    await client.close();
    await server.close();
  });

  it('minAr > maxAr esetén ÉRTHETŐ hibát ad, nem néma üres listát', async () => {
    let called = false;
    const { client, server } = await connectTestServer(async () => {
      called = true;
      return { rows: [], rowCount: 0 };
    });

    const result = await client.callTool({
      name: SEARCH_PLANTS_TOOL_NAME,
      arguments: { minAr: 20000, maxAr: 5000 },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { text: string }[];
    expect(content[0]?.text).toContain('20000');
    expect(content[0]?.text).toContain('5000');
    // A DB-t el sem érte: a hiba a határon dőlt el.
    expect(called).toBe(false);

    await client.close();
    await server.close();
  });

  it('a DB-hiba isError-ként jön vissza, és az ÜRES üzenetű AggregateError is olvasható', async () => {
    // Pontosan az a hibaalak, amit a Task 7 élő próbája mért: a pg ECONNREFUSED-nél
    // AggregateError-t dob, aminek a .message-e ÜRES.
    const { client, server } = await connectTestServer(async () => {
      throw new AggregateError([new Error('connect ECONNREFUSED 127.0.0.1:5433')], '');
    });

    const result = await client.callTool({
      name: SEARCH_PLANTS_TOOL_NAME,
      arguments: { limit: 1 },
    });

    expect(result.isError).toBe(true);
    const content = result.content as { text: string }[];
    expect(content[0]?.text).toContain('ECONNREFUSED');
    // A regresszió, amit ez a teszt őriz: korábban itt "Adatbázis-hiba: " állt, semmi utána.
    expect(content[0]?.text).not.toBe('Adatbázis-hiba: ');

    await client.close();
    await server.close();
  });

  it('a boolean szűrő `false` értékét a séma ELUTASÍTJA (nem néma no-op)', async () => {
    const { client, server } = await connectTestServer(async () => ({
      rows: [],
      rowCount: 0,
    }));

    const result = await client.callTool({
      name: SEARCH_PLANTS_TOOL_NAME,
      arguments: { petSafe: false },
    });

    // A lényeg: a hívó VISSZAJELZÉST kap, nem egy szűretlen listát abban a hitben,
    // hogy a "nem pet-safe" halmazt kapta.
    expect(result.isError).toBe(true);

    await client.close();
    await server.close();
  });
});
