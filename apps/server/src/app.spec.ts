import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp, type AskFn } from './app.js';

/**
 * A szerver SZERZŐDÉSE, valódi HTTP-n, de valódi API-hívás nélkül: az `ask`
 * injektálva van. Amit itt bizonyítunk: a böngészőből érkező kérdés PONTOSAN
 * ugyanazon az úton megy, mint a CLI-ben — a szerver csak lefordítja.
 */

let server: Server | null = null;

async function start(ask: AskFn): Promise<string> {
  const app = createApp({ ask });
  const listening = app.listen(0);
  server = listening;
  await new Promise<void>((resolve) =>
    listening.once('listening', () => resolve()),
  );
  const { port } = listening.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  const running = server;
  server = null;
  if (running) {
    await new Promise<void>((resolve) => running.close(() => resolve()));
  }
});

const answer = (text: string) => ({
  answer: text,
  systemPrompt: '<role>szobakertész</role>',
  messages: [],
  usage: { inputTokens: 10, outputTokens: 20 },
  toolSteps: [],
  stopReason: 'stop',
});

describe('POST /api/chat', () => {
  it('a kérdést az agentnek adja, és a válaszát JSON-ben küldi vissza', async () => {
    const ask = vi
      .fn()
      .mockResolvedValue(answer('Hét pozsgás van 5000 Ft alatt.'));
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'Hány pozsgás van 5000 Ft alatt?' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      answer: 'Hét pozsgás van 5000 Ft alatt.',
    });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask.mock.calls[0]?.[0]).toBe('Hány pozsgás van 5000 Ft alatt?');
    // A szerver konzolján ugyanaz a színes trace fusson le, mint a CLI-ben.
    expect(ask.mock.calls[0]?.[1]).toMatchObject({ print: true });
  });

  it('üres vagy hiányzó kérdésre 400-at ad, és az agentet meg sem hívja', async () => {
    const ask = vi.fn();
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '   ' }),
    });

    expect(response.status).toBe(400);
    expect(ask).not.toHaveBeenCalled();
  });

  it('az agent hibáját nem nyeli el: 500 + a hibaüzenet', async () => {
    const ask = vi.fn().mockRejectedValue(new Error('API hiba'));
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'kérdés' }),
    });

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).toContain('API hiba');
  });
});
