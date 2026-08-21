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

  // ── Címsor-útvonal (HF3) ──────────────────────────────────────────────────
  //
  // MIÉRT: a korpusz 112 gondozási cikke azonos szerkezetű — a cím a növény neve,
  // alatta Sunlight / Water / Humidity / … szakaszok. Mérve: 54 cikkben van külön
  // "Water" címsor, 56-ban "Humidity", és a NÖVÉNY NEVE egyikben sincs benne. A darabok
  // 42%-ából hiányzik a saját cikkük címének kulcsszava, tehát a vektortérben
  // megkülönböztethetetlenek. A címsorok SZINTJE nem egységes (a korpusz leggyakoribb
  // szintje az h5), ezért a teszt is több szinten próbálja az útvonalat.

  it('docTitle NÉLKÜL a kimenet változatlan — az előtag nem szivárog be', () => {
    const chunks = chunkMarkdown(
      'Első bekezdés.\n\n## Alcím\n\nMásodik bekezdés.',
    );

    expect(chunks[0]?.content).toBe('Első bekezdés.');
    expect(chunks[1]?.content).toBe('## Alcím\n\nMásodik bekezdés.');
  });

  it('docTitle-lel MINDEN darab elé kerül a címsor-útvonal', () => {
    const chunks = chunkMarkdown('Bevezető.\n\n## Water\n\nHetente egyszer.', {
      docTitle: 'Snake Plant',
    });

    expect(chunks[0]?.content).toBe('Snake Plant\n\nBevezető.');
    expect(chunks[1]?.content).toBe(
      'Snake Plant › Water\n\n## Water\n\nHetente egyszer.',
    );
  });

  it('a folytatás-darab a BEÁGYAZÓ szakaszt kapja, nem a záró alcímet', () => {
    // Egy hosszú szakasz több darabra esik. A második darabban már NINCS benne a
    // "## Water" sor — az előtag az egyetlen, ami megmondja, miről szól.
    const long = 'x'.repeat(60);
    const chunks = chunkMarkdown(`## Water\n\n${long}\n\n${long}\n\n${long}`, {
      docTitle: 'Snake Plant',
      maxChars: 100,
      overlap: false,
    });

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.startsWith('Snake Plant › Water\n\n')).toBe(true);
    }
  });

  it('a h1 NEM duplázódik a dokumentum címével', () => {
    const chunks = chunkMarkdown('# Snake Plant\n\nA leírás.', {
      docTitle: 'Snake Plant',
    });

    expect(chunks[0]?.content).toBe(
      'Snake Plant\n\n# Snake Plant\n\nA leírás.',
    );
  });

  it('a TÖRZS NÉLKÜLI darab kiesik, és az indexek hézagmentesek maradnak', () => {
    // A korpuszban 75 üres címsor-bekezdés van ("###"). Előtaggal ezekből
    // "Cím › " kezdetű, JÓL EMBEDDELŐDŐ darab lenne — ÜRES tartalommal.
    const chunks = chunkMarkdown(
      'Első.\n\n###\n\n## Igazi szakasz\n\nA tartalom.',
      { docTitle: 'Cikk' },
    );

    expect(chunks.map((chunk) => chunk.content)).toEqual([
      'Cikk\n\nElső.',
      'Cikk › Igazi szakasz\n\n## Igazi szakasz\n\nA tartalom.',
    ]);
    expect(chunks.map((chunk) => chunk.index)).toEqual([0, 1]);
  });

  it('a MÉLY címsorszinteket is követi, és a kihagyott szinteket átugorja', () => {
    // A korpuszban a leggyakoribb címsorszint az h5 (767 db), h2 alatt közvetlenül —
    // a köztes h3/h4 szintek hiányoznak. Az útvonalban ezek nem hagyhatnak lyukat.
    const chunks = chunkMarkdown(
      '## Learn More\n\nBevezető.\n\n##### Water\n\nHetente egyszer.',
      { docTitle: 'Snake Plant' },
    );

    expect(chunks[0]?.content).toBe(
      'Snake Plant › Learn More\n\n## Learn More\n\nBevezető.',
    );
    expect(chunks[1]?.content).toBe(
      'Snake Plant › Learn More › Water\n\n##### Water\n\nHetente egyszer.',
    );
  });
});
