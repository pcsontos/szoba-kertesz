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
    const ask = vi.fn().mockImplementation(async (_question, options) => {
      options.onTextDelta?.('Kész.');
      return answer('Kész.');
    });
    const url = await start(ask as unknown as AskFn);

    await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [uiMessage('user', 'kérdés')] }),
    });

    expect(ask.mock.calls[0]?.[1]?.role).toBe('customer');
  });
});

describe('POST /api/chat — a végső válasz és a hiba-fejléc (PR #4 review, 2. és 5. tétel)', () => {
  /**
   * 2. tétel: a végpont korábban CSAK a deltákat írta ki, a result.answer-t
   * eldobta. Ha a loop a lépéslimit miatt szöveg nélkül állt meg, az answer az
   * agent emptyAnswer-e lett — de delta nem keletkezett, tehát a böngésző ÜRES
   * buborékot kapott 200-zal. A CLI-ben ugyanez látható választ ad.
   */
  it('ha egyetlen delta sem ment ki, a végső answer megy ki (nem üres 200)', async () => {
    const fallback =
      'Nem sikerült végső választ adni a megengedett lépésszámon belül (6 kör). Pontosítsd a kérdést.';
    // Szándékosan NEM hív onTextDelta-t — ez a lépéslimit esete.
    const ask = vi.fn().mockImplementation(async () => answer(fallback));
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [uiMessage('user', 'kérdés')] }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(fallback);
  });

  /**
   * 5. tétel: a res.type('text/plain') a try ELŐTT futott le, az Express
   * res.json() pedig csak akkor állít tartalomtípust, ha még nincs — így az
   * 500-as JSON törzs text/plain fejléccel ment ki. A típust ezért csak az
   * ELSŐ tényleges kiírás előtt állítjuk be.
   */
  it('stream ELŐTTI hibánál a válasz application/json, nem text/plain', async () => {
    const ask = vi.fn().mockImplementation(async () => {
      // Dob, mielőtt egyetlen delta is kiment volna.
      throw new Error('API hiba az első körben');
    });
    const url = await start(ask as unknown as AskFn);

    const response = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messages: [uiMessage('user', 'kérdés')] }),
    });

    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');
    const body = (await response.json()) as { error?: string };
    expect(body.error).toContain('API hiba az első körben');
  });
});
