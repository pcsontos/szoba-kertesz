import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamText } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
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

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
  totalTokens: input + output,
});

/**
 * Fake `ask`, ami VALÓDI streamText-eredményt ad az onStream-nek (mock modellel,
 * API-hívás nélkül) — mert a szerver már nem szöveget ír ki, hanem az AI SDK
 * üzenet-streamjét pipe-olja, és ezt csak igazi stream-alakon lehet bizonyítani.
 */
const streamingAsk =
  (text: string | readonly string[]): AskFn =>
  async (_question, options) => {
    const parts = typeof text === 'string' ? [text] : text;
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: (async () => ({
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 't1' },
              ...parts.map((delta) => ({
                type: 'text-delta',
                id: 't1',
                delta,
              })),
              { type: 'text-end', id: 't1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop' },
                usage: usage(10, 20),
              },
            ] as never,
            initialDelayInMs: 0,
            chunkDelayInMs: 0,
          }),
        })) as never,
      }),
      prompt: 'teszt',
    });

    options.onStream?.(result);
    // A valódi loop az onChunk-ból hívja; a fake itt jelzi, hogy ment ki szöveg.
    for (const part of parts) {
      options.onTextDelta?.(part);
    }
    return answer(parts.join(''));
  };

describe('POST /api/chat — streamelve', () => {
  it('az utolsó user-üzenet a kérdés, a többi az előzmény', async () => {
    const ask = vi.fn(streamingAsk('Kész.'));
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

    expect(await response.text()).toContain('Kész.');
    expect(ask.mock.calls[0]?.[0]).toBe('És olcsóbbat?');
    // A korábbi körök az askAgent history-jává alakulnak — enélkül a
    // visszautaló kérdés ("és olcsóbbat?") értelmezhetetlen lenne.
    expect(ask.mock.calls[0]?.[1]?.history).toHaveLength(2);
  });

  it('AI SDK ÜZENET-streamet küld, nem sima szöveget', async () => {
    const url = await start(streamingAsk(['Nyolc ', 'kategória.']));

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [uiMessage('user', 'Kategóriák?')] }),
    });

    // A protokoll az, ami a tool-részeket egyáltalán lehetővé teszi.
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    const body = await response.text();
    expect(body).toContain('text-delta');
    // A szöveg DARABONKÉNT megy ki: két külön text-delta rész, nem egy tömb.
    expect(body).toContain('Nyolc ');
    expect(body).toContain('kategória.');
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

  it('futás közbeni hibából MAGYAR hibarész lesz a streamben, nem stack trace', async () => {
    const failing: AskFn = async () => {
      throw new Error('API hiba a második körben');
    };
    const url = await start(failing);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [uiMessage('user', 'kérdés')] }),
    });

    const body = await response.text();
    expect(body).toContain('Az agent futása megszakadt');
    expect(body).toContain('API hiba a második körben');
    expect(body).not.toContain('at ');
  });
});

describe('POST /api/chat — a kérés HATÁRA (PR #4 review, 4. tétel)', () => {
  /**
   * A séma korábban csak annyit mondott, hogy `messages` egy nem-üres tömb,
   * utána `as UIMessage[]` cast következett. A hiányzó `parts` így nem a
   * validálásban bukott el, hanem az extractText-ben, TypeError-ral — amiből
   * az Express alapértelmezett hibakezelője 500-at csinált, HTML stack
   * trace-szel. Külső inputot nem cast-olunk: a típus a sémából jön.
   */
  it('hiányzó `parts` esetén 400 magyar üzenettel — NEM 500 stack trace-szel', async () => {
    const ask = vi.fn();
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ id: 'm1', role: 'user' }] }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as { error?: string };
    expect(body.error).toMatch(/üzenet/i);
    expect(ask).not.toHaveBeenCalled();
  });

  it('ismeretlen `role` esetén is 400, nem 500', async () => {
    const ask = vi.fn();
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: 'm1', role: 'root', parts: [] }],
      }),
    });

    expect(response.status).toBe(400);
    expect(ask).not.toHaveBeenCalled();
  });

  it('a hibás alak SEMMILYEN esetben nem szivárogtat stack trace-t', async () => {
    const ask = vi.fn();
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [{ id: 'm1', role: 'user' }] }),
    });

    const text = await response.text();
    expect(text).not.toContain('TypeError');
    expect(text).not.toContain('at ');
  });
});

describe('POST /api/chat — a szerep PINNELVE (PR #4 review, 1. tétel)', () => {
  /**
   * A végpont korábban `role` nélkül hívta az askAgent-et, tehát a modul-szintű
   * CURRENT_ROLE-t örökölte — miközben a user-role.ts fejkommentje épp azt
   * ajánlja demóhoz, hogy azt a konstanst írd át `admin`-ra. Nyitott cors()
   * mellett a hitelesítés nélküli végpont így admin-képessé válna
   * (delegateToIngest → írás a szoba-kertesz_rw szerepen). A szerep itt
   * EXPLICIT, nem örökölt.
   */
  it('mindig `customer` szereppel hívja az agentet', async () => {
    const ask = vi.fn(streamingAsk('Kész.'));
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [uiMessage('user', 'kérdés')] }),
    });
    // A választ KI KELL olvasni: az üzenet-stream (text/event-stream) addig
    // nyitva marad, és az afterEach server.close()-a a nyitott socketre várna.
    await response.text();

    expect(ask.mock.calls[0]?.[1]?.role).toBe('customer');
  });
});

describe('POST /api/chat — a végső válasz (PR #4 review, 2. tétel)', () => {
  /**
   * 2. tétel: a végpont korábban CSAK a deltákat írta ki, a result.answer-t
   * eldobta. Ha a loop a lépéslimit miatt szöveg nélkül állt meg, az answer az
   * agent emptyAnswer-e lett — de delta nem keletkezett, tehát a böngésző ÜRES
   * buborékot kapott 200-zal. A CLI-ben ugyanez látható választ ad.
   */
  it('ha egyetlen delta sem ment ki, a végső answer megy ki (nem üres 200)', async () => {
    const fallback =
      'Nem sikerült végső választ adni a megengedett lépésszámon belül (6 kör). Pontosítsd a kérdést.';
    // Szándékosan NEM hív se onStream-et, se onTextDelta-t — ez a lépéslimit esete.
    const ask = vi.fn().mockImplementation(async () => answer(fallback));
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [uiMessage('user', 'kérdés')] }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(fallback);
  });
});

describe('a debug-felület éles környezetben nincs mountolva', () => {
  it('NODE_ENV=production mellett a /debug/knowledge/sources 404', async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const url = await start(vi.fn() as unknown as AskFn);
      const response = await fetch(`${url}/debug/knowledge/sources`);
      expect(response.status).toBe(404);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
