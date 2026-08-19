import { describe, expect, it } from 'vitest';
import { chunkMarkdown } from './chunk.js';

/**
 * A darabolás a RAG ELSŐ döntése, és a leggyakrabban elrontott. Ezek a tesztek
 * azt a SZABÁLYT rögzítik, amiért egyáltalán írtunk saját chunkolót: a darab-
 * határ soha ne vágjon ketté egy gondolatot.
 */
describe('chunkMarkdown', () => {
  it('üres szövegből nem csinál darabot', () => {
    expect(chunkMarkdown('')).toEqual([]);
    expect(chunkMarkdown('   \n\n  ')).toEqual([]);
  });

  it('rövid szövegből egyetlen darab lesz, 0-s indexszel', () => {
    const chunks = chunkMarkdown('Csak egy bekezdés.');

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.content).toBe('Csak egy bekezdés.');
    expect(chunks[0]?.index).toBe(0);
  });

  it('ALCÍMNÉL új darabot kezd — a szakasz egy gondolati egység', () => {
    const chunks = chunkMarkdown(
      'Első bekezdés.\n\n## Alcím\n\nMásodik bekezdés.',
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.content).toBe('Első bekezdés.');
    expect(chunks[1]?.content).toBe('## Alcím\n\nMásodik bekezdés.');
    expect(chunks.map((chunk) => chunk.index)).toEqual([0, 1]);
  });

  it('a méretkeret betelésekor ÁTVISZI az utolsó bekezdést (átfedés)', () => {
    const a = 'a'.repeat(10);
    const b = 'b'.repeat(10);
    const c = 'c'.repeat(20);

    const chunks = chunkMarkdown(`${a}\n\n${b}\n\n${c}`, { maxChars: 30 });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.content).toBe(`${a}\n\n${b}`);
    // A határon álló bekezdés MINDKÉT darabban ott van — enélkül a következő
    // darab első mondatának elveszne a kontextusa ("Ezt hetente ismételd." — mit is?).
    expect(chunks[1]?.content).toBe(`${b}\n\n${c}`);
  });

  it('overlap: false esetén nincs átfedés', () => {
    const a = 'a'.repeat(10);
    const b = 'b'.repeat(10);
    const c = 'c'.repeat(20);

    const chunks = chunkMarkdown(`${a}\n\n${b}\n\n${c}`, {
      maxChars: 30,
      overlap: false,
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[1]?.content).toBe(c);
  });

  it('a túl hosszú bekezdést MONDATHATÁRON vágja, nem karakterre', () => {
    const chunks = chunkMarkdown(
      'Első mondat. Második mondat. Harmadik mondat.',
      { maxChars: 20 },
    );

    expect(chunks).toHaveLength(3);
    // Egyetlen darab sem végződhet félbevágott mondattal.
    for (const chunk of chunks) {
      expect(chunk.content.endsWith('.')).toBe(true);
    }
  });
});
