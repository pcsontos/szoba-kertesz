import { describe, expect, it } from 'vitest';
import { partsToText, textToParts } from './message-parts.js';

describe('message-parts — két nézet ugyanarra a tárra', () => {
  it('a szövegből egyetlen text-part lesz', () => {
    expect(textToParts('szia')).toEqual([{ type: 'text', text: 'szia' }]);
  });

  it('a text-partokat összefűzi (a stream darabjai)', () => {
    const parts = [
      { type: 'text', text: 'Három ' },
      { type: 'text', text: 'növényt ajánlok.' },
    ];

    expect(partsToText(parts)).toBe('Három növényt ajánlok.');
  });

  it('a tool-partokat ELDOBJA — a CLI-ben a kártyából csak a szöveg marad', () => {
    const parts = [
      {
        type: 'tool-runSql',
        state: 'output-available',
        input: {},
        output: '[]',
      },
      { type: 'text', text: 'Nyolc kaktusz van készleten.' },
    ];

    expect(partsToText(parts)).toBe('Nyolc kaktusz van készleten.');
  });

  it('ismeretlen alakú részeken nem hasal el (a tár tartalma nem megbízható)', () => {
    expect(partsToText([null, 42, 'szöveg', { type: 'text' }])).toBe('');
  });

  it('a körút megőrzi a szöveget', () => {
    expect(partsToText(textToParts('árvíztűrő tükörfúrógép'))).toBe(
      'árvíztűrő tükörfúrógép',
    );
  });
});
