import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoredMessage, ThreadStore } from '@szoba-kertesz/core';
import { createApp, type AskFn } from './app.js';

/**
 * A thread-API SZERZŐDÉSE, valódi HTTP-n, adatbázis nélkül: a tár injektálva van.
 * Az `ask` szándékosan dob — ezek a végpontok SOSEM hívják az agentet.
 */

let server: Server | null = null;

const neverAsk: AskFn = async () => {
  throw new Error('a thread-API nem hívhatja az agentet');
};

async function start(store: ThreadStore): Promise<string> {
  const app = createApp({ ask: neverAsk, store });
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

const EXISTING = '77777777-7777-4777-8777-777777777777';

const stubStore = (messages: StoredMessage[] | null): ThreadStore => ({
  createThread: async () => EXISTING,
  appendMessage: async () => undefined,
  loadThread: async (id) => (id === EXISTING ? messages : null),
  listThreads: async () => [
    {
      id: EXISTING,
      title: 'Hány kaktusz van?',
      updatedAt: '2026-08-22T10:00:00.000Z',
    },
  ],
});

describe('GET /api/threads', () => {
  it('listázza a beszélgetéseket', async () => {
    const url = await start(stubStore([]));

    const response = await fetch(`${url}/api/threads`);
    const body = (await response.json()) as {
      threads: { id: string; title: string }[];
    };

    expect(response.status).toBe(200);
    expect(body.threads).toHaveLength(1);
    expect(body.threads[0].title).toBe('Hány kaktusz van?');
  });
});

describe('GET /api/threads/:id', () => {
  it('visszaadja a thread üzeneteit, a nem-szöveges részekkel együtt', async () => {
    const toolPart = {
      type: 'tool-runSql',
      state: 'output-available',
      output: '[]',
    };
    const url = await start(
      stubStore([
        {
          id: 1,
          role: 'user',
          parts: [{ type: 'text', text: 'Hány kaktusz van?' }],
        },
        {
          id: 2,
          role: 'assistant',
          parts: [toolPart, { type: 'text', text: 'Nyolc.' }],
        },
      ]),
    );

    const response = await fetch(`${url}/api/threads/${EXISTING}`);
    const body = (await response.json()) as {
      messages: { parts: unknown[] }[];
    };

    expect(response.status).toBe(200);
    expect(body.messages).toHaveLength(2);
    // A tool-kártya visszatöltődik — ezért JSON a parts oszlop, nem szöveg.
    expect(body.messages[1].parts[0]).toEqual(toolPart);
  });

  it('nem létező threadre 404 magyar JSON', async () => {
    const url = await start(stubStore(null));

    const response = await fetch(
      `${url}/api/threads/88888888-8888-4888-8888-888888888888`,
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/beszélgetés/i);
  });

  it('érvénytelen azonosítóra 400, és SEMMILYEN stack trace nem szivárog', async () => {
    const url = await start(stubStore([]));

    const response = await fetch(`${url}/api/threads/nem-uuid`);
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).not.toContain('at ');
    expect(text).not.toContain('<html');
  });
});
