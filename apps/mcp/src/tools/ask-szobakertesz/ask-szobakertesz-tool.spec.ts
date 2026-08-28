import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { AskAgentOptions, AskResult } from '@szoba-kertesz/core';
import {
  ASK_SZOBAKERTESZ_TOOL_NAME,
  registerAskSzobakertesz,
} from './ask-szobakertesz-tool.js';

// InMemoryTransport: a Client és a McpServer UGYANABBAN a folyamatban beszél egymással —
// nincs subprocess, nincs stdio. Ez teszi lehetővé, hogy a role/print pinnelést valódi
// MCP tool-híváson KERESZTÜL ellenőrizzük, mégis kulcs és DB nélkül.

const FAKE_RESULT: AskResult = {
  answer: 'Teszt-válasz.',
  systemPrompt: '',
  messages: [],
  usage: { inputTokens: 10, outputTokens: 20 },
  toolSteps: [],
  stopReason: 'stop',
};

async function connectTestServer(
  ask: (question: string, options: AskAgentOptions) => Promise<AskResult>,
): Promise<{ client: Client; server: McpServer }> {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerAskSzobakertesz(server, { ask });

  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return { client, server };
}

describe('registerAskSzobakertesz', () => {
  it('a hívás role: "customer"-rel megy, SOHA "admin"-nal', async () => {
    const calls: AskAgentOptions[] = [];
    const { client, server } = await connectTestServer(async (_question, options) => {
      calls.push(options);
      return FAKE_RESULT;
    });

    await client.callTool({
      name: ASK_SZOBAKERTESZ_TOOL_NAME,
      arguments: { kerdes: 'Milyen növény bírja az árnyékot?' },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.role).toBe('customer');

    await client.close();
    await server.close();
  });

  it('a hívás print: false-szal megy', async () => {
    const calls: AskAgentOptions[] = [];
    const { client, server } = await connectTestServer(async (_question, options) => {
      calls.push(options);
      return FAKE_RESULT;
    });

    await client.callTool({
      name: ASK_SZOBAKERTESZ_TOOL_NAME,
      arguments: { kerdes: 'teszt' },
    });

    expect(calls[0]?.print).toBe(false);

    await client.close();
    await server.close();
  });

  it('a dobott hiba isError: true-vá alakul, nem repül ki', async () => {
    const { client, server } = await connectTestServer(async () => {
      throw new Error('szimulált hiba');
    });

    const result = await client.callTool({
      name: ASK_SZOBAKERTESZ_TOOL_NAME,
      arguments: { kerdes: 'teszt' },
    });

    expect(result.isError).toBe(true);
    const [first] = result.content as { text?: string }[];
    expect(first?.text).toContain('szimulált hiba');

    await client.close();
    await server.close();
  });

  it('sikeres hívásnál a válasz és a token-összegzés két külön text részben jön', async () => {
    const { client, server } = await connectTestServer(async () => FAKE_RESULT);

    const result = await client.callTool({
      name: ASK_SZOBAKERTESZ_TOOL_NAME,
      arguments: { kerdes: 'teszt' },
    });

    const content = result.content as { type: string; text: string }[];
    expect(content).toHaveLength(2);
    expect(content[0]?.text).toBe('Teszt-válasz.');
    expect(content[1]?.text).toContain('10/20 token');

    await client.close();
    await server.close();
  });
});
