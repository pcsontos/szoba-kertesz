import { render } from '@testing-library/react';
import App from './App.js';

/**
 * A generátor „Welcome web" placeholder tesztjének helyére lépő smoke-tesztek.
 * Nem a chat-logikát mérik (az a szerver + agent dolga, és a Task 11 élő
 * ellenőrzése fedi), hanem azt, hogy a felület felépül, a beviteli mező üresen
 * tiltott, és — a 07. alkalom óta — hogy a thread-lista és a `?thread=`-es
 * visszatöltés a SZERVERTŐL kapott adatból rajzolódik ki.
 *
 * A `fetch` MINDIG stubolva van: az App induláskor lekéri a beszélgetés-listát,
 * és stub nélkül a teszt valódi hálózati hívást indítana a localhost:3000-re.
 */

const originalFetch = globalThis.fetch;

/** Egyszerű útvonal-alapú stub: a hívott URL-ből dönti el, mit ad vissza. */
function stubFetch(handler: (url: string) => unknown): void {
  globalThis.fetch = (async (input: RequestInfo | URL) =>
    new Response(JSON.stringify(handler(String(input))), {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch;
}

describe('App', () => {
  beforeEach(() => {
    stubFetch(() => ({ threads: [] }));
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // A `findByText` nem díszítés: az induló lista-lekérés a renderelés UTÁN
  // frissít állapotot, és ha a teszt előbb véget ér, React act()-figyelmeztetést ír.
  it('felépül, és a kezdő üzenet a katalógusról kérdezésre hív', async () => {
    const { getByRole, getByPlaceholderText, findByText } = render(<App />);

    expect(getByRole('heading', { name: 'Szobakertész' })).toBeTruthy();
    expect(getByPlaceholderText('Írd ide a kérdésed…')).toBeTruthy();
    await findByText('Még nincs mentett beszélgetés.');
  });

  it('üres bemenettel a Küldés tiltott', async () => {
    const { getByRole, findByText } = render(<App />);

    const submit = getByRole('button', { name: 'Küldés' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    await findByText('Még nincs mentett beszélgetés.');
  });

  it('a thread-lista sávja megjelenik, és üresen is beszédes', async () => {
    const { findByText, getByRole } = render(<App />);

    expect(getByRole('button', { name: 'Új beszélgetés' })).toBeTruthy();
    expect(await findByText('Még nincs mentett beszélgetés.')).toBeTruthy();
  });

  it('a lista elemei a szerverről jönnek', async () => {
    stubFetch(() => ({
      threads: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          title: 'Hány kaktusz van?',
          updatedAt: '2026-08-22T10:00:00.000Z',
        },
      ],
    }));

    const { findByRole } = render(<App />);

    expect(
      await findByRole('button', { name: 'Hány kaktusz van?' }),
    ).toBeTruthy();
  });

  // Ez a teszt a MEGOSZTHATÓ URL-t pinneli: a link birtokosa ugyanazt a
  // beszélgetést kapja vissza — a tool-kártyákkal együtt, mert a tár a TELJES
  // `UIMessage.parts`-ot őrzi, nem csak a szöveget (ezt a CLI lapítja el).
  it('a ?thread= URL-ből visszatölti a beszélgetést, a tool-kártyával együtt', async () => {
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

    const { findByText } = render(<App />);

    expect(await findByText('Két kaktusz van.')).toBeTruthy();
    expect(await findByText('katalógus lekérdezés')).toBeTruthy();
    expect(await findByText('SELECT count(*) FROM products')).toBeTruthy();
  });
});
