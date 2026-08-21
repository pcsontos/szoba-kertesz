import { describe, expect, it } from 'vitest';
import { loadGoldenSet, parseGoldenSet } from './golden-questions.js';

describe('parseGoldenSet', () => {
  const valid = [
    {
      id: 'sargulo-level',
      question: 'Miért sárgulnak a növényem levelei?',
      language: 'hu',
      kind: 'thematic',
      why: 'Klasszikus gondozási kérdés, több cikk is érinti.',
    },
  ];

  it('érvényes listát átenged, olvashatóan tipizálva', () => {
    const parsed = parseGoldenSet(valid);

    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.language).toBe('hu');
    expect(parsed[0]?.kind).toBe('thematic');
  });

  it('ismeretlen `kind` értéket ELUTASÍT — elgépelés ne csússzon át némán', () => {
    const broken = [{ ...valid[0], kind: 'tematikus' }];

    expect(() => parseGoldenSet(broken)).toThrowError(/kind/);
  });

  it('üres kérdés-szöveget elutasít', () => {
    const broken = [{ ...valid[0], question: '' }];

    expect(() => parseGoldenSet(broken)).toThrowError();
  });
});

describe('loadGoldenSet', () => {
  // KÉT negatív kérdés van, és ez mérés eredménye, nem ízlés: az autós kérdést az agent
  // 0 tool-hívással utasítja el (a szerep határa), tehát a keresésig el sem jut — azzal
  // a grounding-szabály nem próbálható. A légycsapós kérdés növénygondozásról szól,
  // ezért lefut a keresés, miközben a korpuszban egyetlen cikk sem szól róla.
  it('a valódi seed/golden-set.json 9 kérdést ad, közte PONTOSAN két negatívval', () => {
    const questions = loadGoldenSet();

    expect(questions).toHaveLength(9);
    expect(questions.filter((q) => q.kind === 'negative')).toHaveLength(2);
    expect(questions.filter((q) => q.language === 'en')).toHaveLength(2);
    // Az azonosítók egyediek — a jelentés ezekre hivatkozik.
    expect(new Set(questions.map((q) => q.id)).size).toBe(9);
  });
});
