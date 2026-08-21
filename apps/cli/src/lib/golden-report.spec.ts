import { describe, expect, it } from 'vitest';
import { renderGoldenReport, type GoldenRow } from './golden-report.js';

const hit = (title: string, distance: number, score: number) => ({
  title,
  source: `https://example.com/${title}`,
  chunkIndex: 0,
  distance,
  score,
});

const row: GoldenRow = {
  question: {
    id: 'kigyonoveny-ontozes',
    question: 'Milyen gyakran öntözzem a kígyónövényt?',
    language: 'hu',
    kind: 'thematic',
    why: 'A címsor-útvonal próbája.',
  },
  raw: [hit('Pothos', 0.48, -1), hit('Snake Plant', 0.51, -1)],
  full: [hit('Snake Plant', 0.26, 9), hit('Pothos', 0.31, 4)],
};

describe('renderGoldenReport', () => {
  it('a fejlécben szerepel a label és a futás időpontja', () => {
    const report = renderGoldenReport(
      'regi-chunker',
      new Date('2026-08-20T10:00:00Z'),
      [row],
    );

    expect(report).toContain('regi-chunker');
    expect(report).toContain('2026-08-20');
  });

  it('kérdésenként MINDKÉT találati listát kiírja, egymás mellé téve', () => {
    const report = renderGoldenReport('x', new Date(), [row]);

    expect(report).toContain('Milyen gyakran öntözzem a kígyónövényt?');
    expect(report).toContain('nyers');
    expect(report).toContain('teljes');
    // A rerank-pontszám látszik, ahol van; a nyersnél (-1) NEM írunk hamis 0-t.
    expect(report).toContain('9/10');
    expect(report).not.toContain('-1/10');
  });

  it('a TOP-1 változását külön megjelöli', () => {
    const report = renderGoldenReport('x', new Date(), [row]);

    // A nyers top-1 Pothos volt, a teljesé Snake Plant — ezt a jelentésnek ki kell mondania.
    expect(report).toContain('| top-1 változott |');
    expect(report).toContain('MÁS darabot tett az élre');
  });

  it('a top-1 jelzés csak a TOP-1-et méri, a 2–5. hely cseréjét NEM', () => {
    // Az oszlop neve korábban „átrendezett" volt, a mérés viszont mindig is a top-1-re
    // szólt. Ha a rerank csak a lista alját forgatja, ide „nem" kerül — és a jelentésnek
    // ezt kell mondania, nem többet.
    const sameTopDifferentTail: GoldenRow = {
      ...row,
      raw: [hit('Snake Plant', 0.26, -1), hit('Pothos', 0.31, -1)],
      full: [hit('Snake Plant', 0.26, 9), hit('Fittonia', 0.4, 5)],
    };

    const report = renderGoldenReport('x', new Date(), [sameTopDifferentTail]);

    expect(report).toContain('| nem |');
    expect(report).toContain('_A top-1 találat nem változott._');
  });

  it('a negatív kérdésnél kiírja az AGENT válaszát, mert a grounding próbája az', () => {
    const negative: GoldenRow = {
      question: {
        id: 'negativ-auto',
        question: 'Hogyan cseréljek téli gumit az autómon?',
        language: 'hu',
        kind: 'negative',
        why: 'Nincs róla a korpuszban.',
      },
      raw: [hit('Snake Plant', 0.88, -1)],
      full: [hit('Snake Plant', 0.84, 0)],
      agentAnswer: 'Erről nincs információm a tudásbázisban.',
    };

    const report = renderGoldenReport('x', new Date(), [negative]);

    expect(report).toContain('NEGATÍV TESZT');
    expect(report).toContain('Erről nincs információm a tudásbázisban.');
  });

  it('ÜRES találati listát is kiír — a semmi is mérési eredmény', () => {
    // Valós ág: üres tudásbázison a `retrieveKnowledge` `hits: []`-t ad. Ilyenkor a
    // jelentés ne néma sorokat írjon, és az "átrendezett" oszlop ne mondjon IGEN-t
    // olyan sorrendről, ami nem is létezik.
    const empty: GoldenRow = { question: row.question, raw: [], full: [] };

    const report = renderGoldenReport('ures', new Date(), [empty]);

    expect(report).toContain('_nincs találat_');
    expect(report).toContain('| — | — | nem |');
    expect(report).toContain('_A top-1 találat nem változott._');
  });

  it('a kérdésben lévő | nem dobja szét a táblát', () => {
    const piped: GoldenRow = {
      ...row,
      question: { ...row.question, question: 'Fény | árnyék?' },
    };

    const report = renderGoldenReport('x', new Date(), [piped]);
    const summaryRow = report
      .split('\n')
      .find((line) => line.startsWith('| 1 |'));

    expect(summaryRow).toContain('Fény \\| árnyék?');
    // 6 oszlop = 7 NEM escapelt cellahatár. Escape nélkül 8 lenne, és elcsúszna a tábla.
    expect(summaryRow?.match(/(?<!\\)\|/g)).toHaveLength(7);
  });
});
