import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildSzobaKerteszServer, TOOL_NAMES } from './szoba-kertesz-server.js';

describe('buildSzobaKerteszServer', () => {
  it('pontosan három toolt regisztrál, a TOOL_NAMES-szel megegyező névvel', async () => {
    // Az `ask` injektálva, hogy a teszt kulcs és DB nélkül fusson — itt nem HÍVJUK a toolt,
    // csak listázzuk, de a konzisztencia kedvéért így sem tud véletlenül valódi API-t érinteni.
    const server = buildSzobaKerteszServer({
      ask: async () => {
        throw new Error('ebben a tesztben nem hívható');
      },
    });

    const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test-client', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const { tools } = await client.listTools();
    const names = tools.map((tool) => tool.name).sort();

    expect(tools).toHaveLength(3);
    expect(names).toEqual([...TOOL_NAMES].sort());

    await client.close();
    await server.close();
  });
});
