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

/** A useChat MINDIG a teljes előzményt küldi — ez a kérés alakja. */
const uiMessage = (role: 'user' | 'assistant', text: string) => ({
  id: `${role}-${text.slice(0, 5)}`,
  role,
  parts: [{ type: 'text', text }],
});

describe('POST /api/chat — streamelve', () => {
  it('az utolsó user-üzenet a kérdés, a többi az előzmény', async () => {
    const ask = vi.fn().mockImplementation(async (_question, options) => {
      options.onTextDelta?.('Kész.');
      return answer('Kész.');
    });
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [
          uiMessage('user', 'Hány pozsgás van?'),
          uiMessage('assistant', 'Hét darab.'),
          uiMessage('user', 'És olcsóbbat?'),
        ],
      }),
    });

    expect(await response.text()).toBe('Kész.');
    expect(ask.mock.calls[0]?.[0]).toBe('És olcsóbbat?');
    // A korábbi körök az askAgent history-jává alakulnak — enélkül a
    // visszautaló kérdés ("és olcsóbbat?") értelmezhetetlen lenne.
    expect(ask.mock.calls[0]?.[1]?.history).toHaveLength(2);
  });

  it('a válasz DARABONKÉNT megy ki, nem egyben', async () => {
    const ask = vi.fn().mockImplementation(async (_question, options) => {
      options.onTextDelta?.('Nyolc ');
      options.onTextDelta?.('kategória.');
      return answer('Nyolc kategória.');
    });
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [uiMessage('user', 'Kategóriák?')] }),
    });

    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toBe('Nyolc kategória.');
  });

  it('üres vagy user nélküli kérésre 400, az agent hívása nélkül', async () => {
    const ask = vi.fn();
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [] }),
    });

    expect(response.status).toBe(400);
    expect(ask).not.toHaveBeenCalled();
  });

  it('ha MÁR streamelt, a hibát csak lezárni tudja — nem ír státuszt', async () => {
    const ask = vi.fn().mockImplementation(async (_question, options) => {
      options.onTextDelta?.('Elkezdem…');
      throw new Error('API hiba a második körben');
    });
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [uiMessage('user', 'kérdés')] }),
    });

    // A státusz már 200, mert a fejlécek kimentek az első darabbal.
    // Ez a "Cannot set headers after they are sent" buktató kezelése.
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('Elkezdem…');
  });
});
