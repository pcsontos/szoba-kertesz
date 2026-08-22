import { splitAssistantParts } from './assistant-parts.js';

describe('splitAssistantParts — mi kerül kártyára, mi szövegbe, mi a vezérlés', () => {
  it('a tool-részeket és a szöveget szétválogatja', () => {
    const tool = {
      type: 'tool-runSql',
      state: 'output-available',
      output: '[]',
    };
    const split = splitAssistantParts([
      tool,
      { type: 'text', text: 'Nyolc ' },
      { type: 'text', text: 'kaktusz.' },
    ]);

    expect(split.toolParts).toEqual([tool]);
    expect(split.text).toBe('Nyolc kaktusz.');
  });

  it('a data-thread részből kiolvassa az azonosítót, és NEM teszi kártyára', () => {
    const id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const split = splitAssistantParts([
      { type: 'data-thread', data: { threadId: id } },
      { type: 'text', text: 'Kész.' },
    ]);

    expect(split.threadId).toBe(id);
    expect(split.toolParts).toEqual([]);
    expect(split.text).toBe('Kész.');
  });

  it('hiányzó vagy rossz alakú data-thread résztől nem hasal el', () => {
    const split = splitAssistantParts([{ type: 'data-thread', data: null }]);

    expect(split.threadId).toBeUndefined();
  });

  it('üres részlistára üres eredményt ad', () => {
    expect(splitAssistantParts([])).toEqual({
      toolParts: [],
      text: '',
      threadId: undefined,
    });
  });
});
