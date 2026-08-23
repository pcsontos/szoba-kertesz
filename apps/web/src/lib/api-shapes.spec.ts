import { toStoredMessages, toThreadSummaries } from './api-shapes.js';

// A szerver hibája IS JSON: a /api/threads 500-nál `{ error: … }`-t küld, tehát a
// `response.json()` sikerrel lefut, és a `threads` mező hiányzik. Ha ezt validálatlanul
// engedjük a state-be, a ThreadList `threads.length`-je dob — és nem a sáv tűnik el,
// hanem az EGÉSZ felület. Ezért ez a két függvény a határ.

describe('toThreadSummaries — a lista-válasz alakja', () => {
  it('érvényes listát átenged', () => {
    const thread = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      title: 'Hány kaktusz van?',
      updatedAt: '2026-08-22T10:00:00.000Z',
    };

    expect(toThreadSummaries({ threads: [thread] })).toEqual([thread]);
  });

  it('hibaválaszból (nincs threads mező) ÜRES lista lesz, nem undefined', () => {
    expect(toThreadSummaries({ error: 'A lista nem tölthető be' })).toEqual([]);
  });

  it('nem tömb threads mezőre is üres lista', () => {
    expect(toThreadSummaries({ threads: 'nem tömb' })).toEqual([]);
  });

  it('a hiányos elemeket kihagyja, a jókat megtartja', () => {
    const good = { id: 'a', title: 'jó', updatedAt: 'most' };

    expect(toThreadSummaries({ threads: [{ id: 'b' }, good, null] })).toEqual([
      good,
    ]);
  });
});

describe('toStoredMessages — a betöltött beszélgetés alakja', () => {
  it('a tárolt üzenetekből UIMessage-alakot csinál, string id-vel', () => {
    const parts = [{ type: 'text', text: 'Szia' }];

    expect(
      toStoredMessages({ messages: [{ id: 7, role: 'user', parts }] }),
    ).toEqual([{ id: '7', role: 'user', parts }]);
  });

  it('ismeretlen role-t kihagy — a chat csak user/assistant buborékot ismer', () => {
    const rows = [
      { id: 1, role: 'system', parts: [] },
      { id: 2, role: 'assistant', parts: [] },
    ];

    expect(toStoredMessages({ messages: rows })).toEqual([
      { id: '2', role: 'assistant', parts: [] },
    ]);
  });

  it('hibaválaszra üres lista, nem dobás', () => {
    expect(toStoredMessages({ error: 'Nincs ilyen beszélgetés' })).toEqual([]);
  });

  it('parts nélküli sort kihagy', () => {
    expect(toStoredMessages({ messages: [{ id: 1, role: 'user' }] })).toEqual(
      [],
    );
  });
});
