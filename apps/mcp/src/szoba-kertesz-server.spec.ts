import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import {
  buildSzobaKerteszServer,
  SERVER_VERSION,
  TOOL_NAMES,
} from './szoba-kertesz-server.js';

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

  it('a SERVER_VERSION megegyezik a package.json-beli verzióval', () => {
    // A hostnak hirdetett verzió és a csomag verziója két külön hely — a #11 review 10. tétele
    // pont azt találta meg, hogy elcsúsztak (0.1.0 vs 0.0.1). Ez a spec őrzi a párost.
    const packageJson = readFileSync(join(__dirname, '..', 'package.json'), 'utf8');
    const { version } = JSON.parse(packageJson) as { version: string };

    expect(SERVER_VERSION).toBe(version);
  });
});
