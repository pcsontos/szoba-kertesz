import { render } from '@testing-library/react';
import { AI_DISCLOSURE } from './lib/ai-disclosure.js';
import App from './App.js';

/**
 * AI ACT 50. cikk (1)+(5) — a tájékoztatásnak "legkésőbb az első interakció idején" meg kell
 * történnie. Ez a spec azt méri, amit a FELHASZNÁLÓ LÁT, nem azt, hogy a forrásban benne
 * van-e a mondat: renderel, és megnézi, ott van-e a képernyőn MIELŐTT bármit kérdeztek.
 *
 * Miért `role="note"` és nem testid? Mert a felirat akadálymentesen is közlendő, és a role
 * természetes fogódzó — az App.testids.spec.tsx elve szerint ahol van ilyen, ott nem teszünk
 * testidet.
 *
 * A HARMADIK eset a teherbíró: a felirat CSAK a fejlécben van (az üres állapot szövegébe
 * eredetileg is bekerült, de élő ránézésre kettőzésnek bizonyult, ezért kikerült). Az üres
 * állapot az első üzenet után eltűnik — ha a fejléces példány elveszne, a tájékoztatás pont
 * beszélgetés közben szűnne meg, és egy visszatérő látogató sosem látná.
 */

const originalFetch = globalThis.fetch;

function stubFetch(handler: (url: string) => unknown): void {
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    new Response(JSON.stringify(handler(String(input))), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

describe('MI-tájékoztatás (AI Act 50. cikk)', () => {
  beforeEach(() => {
    stubFetch(() => ({ threads: [] }));
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('a felirat az ELSŐ INTERAKCIÓ ELŐTT látszik, üres beszélgetésben', async () => {
    const { getByRole, findByText } = render(<App />);

    await findByText(/Kérdezz a növénykatalógusról/);
    expect(getByRole('note').textContent).toContain(AI_DISCLOSURE);
  });

  it('a felirat NEM tűnik el, amikor már van üzenet a beszélgetésben', async () => {
    const id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    window.history.replaceState(null, '', `?thread=${id}`);
    stubFetch((url) =>
      url.endsWith('/api/threads')
        ? {
            threads: [
              {
                id,
                title: 'Hány kaktusz van?',
                updatedAt: '2026-08-22T10:00:00.000Z',
              },
            ],
          }
        : {
            id,
            messages: [
              {
                id: 1,
                role: 'user',
                parts: [{ type: 'text', text: 'Hány kaktusz van?' }],
              },
              {
                id: 2,
                role: 'assistant',
                parts: [{ type: 'text', text: 'Két kaktusz van.' }],
              },
            ],
          },
    );

    const { findByText, getByRole } = render(<App />);
    await findByText('Két kaktusz van.');

    expect(getByRole('note').textContent).toContain(AI_DISCLOSURE);
  });
});
