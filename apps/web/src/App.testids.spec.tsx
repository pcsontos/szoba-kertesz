import { render } from '@testing-library/react';
import App from './App.js';

/**
 * A BATTERY DOM-FOGÓDZÓIT pinneli (`tools/autotest`, 08. alkalom).
 *
 * Miért kell rá teszt? Mert a battery a valódi böngészőben ezekre a horgokra illeszt. Ha egy
 * stílus-refaktor elveszi őket, a Playwright-futás nem hibát jelezne, hanem NÉMÁN ZÖLDET:
 * üres szöveget olvasna, és nem találna redFlaget ott, ahol nem is olvas. A hamis zöld
 * rosszabb, mint a piros — ezért ez a spec.
 *
 * Ahol van természetes fogódzó (placeholder, gomb-felirat, role="alert"), ott NEM teszünk
 * testidet: a battery azokat használja.
 */

const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string) => unknown): void {
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    new Response(JSON.stringify(handler(String(input))), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

describe('a battery DOM-fogódzói', () => {
  beforeEach(() => {
    stubFetch(() => ({ threads: [] }));
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('az üzenet-nézetnek van message-list testidje', async () => {
    const { getByTestId, findByText } = render(<App />);

    await findByText(/Kérdezz a növénykatalógusról/);
    expect(getByTestId('message-list')).toBeTruthy();
  });

  it('a természetes fogódzók megvannak: input placeholder és Küldés gomb', async () => {
    const { getByPlaceholderText, getByRole, findByText } = render(<App />);

    await findByText(/Kérdezz a növénykatalógusról/);
    // A battery ezekre illeszt — ha a szöveg változik, a battery elakad.
    expect(getByPlaceholderText('Írd ide a kérdésed…')).toBeTruthy();
    expect(getByRole('button', { name: 'Küldés' })).toBeTruthy();
  });

  it('egy visszatöltött beszélgetésben megvan mind a négy horog', async () => {
    const id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    window.history.replaceState(null, '', `?thread=${id}`);
    stubFetch((url) =>
      url.endsWith('/api/threads')
        ? { threads: [{ id, title: 'Hány kaktusz van?', updatedAt: '2026-08-22T10:00:00.000Z' }] }
        : {
            id,
            messages: [
              { id: 1, role: 'user', parts: [{ type: 'text', text: 'Hány kaktusz van?' }] },
              {
                id: 2,
                role: 'assistant',
                parts: [
                  {
                    type: 'tool-runSql',
                    state: 'output-available',
                    input: { query: 'SELECT count(*) FROM products' },
                    output: '[{"count":2}]',
                  },
                  { type: 'text', text: 'Két kaktusz van.' },
                ],
              },
            ],
          },
    );

    const { findByText, getAllByTestId, getByTestId } = render(<App />);
    await findByText('Két kaktusz van.');

    // 1. buborékok, szerep szerint megkülönböztetve
    const messages = getAllByTestId('message');
    expect(messages).toHaveLength(2);
    expect(messages.map((node) => node.dataset['role'])).toEqual(['user', 'assistant']);

    // 2. az asszisztens SZÖVEGE külön horgon — a battery ezt olvassa válaszként,
    //    a tool-kártyák szövege nélkül
    expect(getByTestId('assistant-text').textContent).toContain('Két kaktusz van.');

    // 3. a tool-kártya megmondja, MELYIK tool futott (ezen áll a RAG-grounding fok)
    const toolCards = getAllByTestId('tool-card');
    expect(toolCards).toHaveLength(1);
    expect(toolCards[0]?.dataset['tool']).toBe('runSql');
  });
});
