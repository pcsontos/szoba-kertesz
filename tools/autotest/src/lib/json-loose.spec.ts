import { describe, expect, it } from 'vitest';
import { coerceArray, parseJsonLoose } from './json-loose.js';

describe('parseJsonLoose', () => {
  it('a tiszta JSON-t parse-olja', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it('a kódfence-t leszedi', () => {
    expect(parseJsonLoose('```json\n[{"supported":true}]\n```')).toEqual([
      { supported: true },
    ]);
  });

  it('a JSON elé és mögé írt prózát átugorja', () => {
    const text = 'Íme az eredmény:\n[{"covered": false}]\nRemélem segített!';
    expect(parseJsonLoose(text)).toEqual([{ covered: false }]);
  });

  it('a LEGELÖL álló nyitó zárójelből indul, nem a belsőből', () => {
    // Ha a belső tömböt vágnánk ki, az answerRelevancy némán 0-t adna.
    expect(parseJsonLoose('{"questions":["a","b"]}')).toEqual({
      questions: ['a', 'b'],
    });
  });

  it('a stringben lévő zárójelet nem számolja', () => {
    expect(parseJsonLoose('[{"reason":"a } jel a szövegben"}]')).toEqual([
      { reason: 'a } jel a szövegben' },
    ]);
  });

  it('csonka válaszra null, nem kivétel', () => {
    expect(parseJsonLoose('[{"supported": tr')).toBeNull();
  });

  it('JSON nélküli szövegre null', () => {
    expect(parseJsonLoose('Sajnálom, nem tudom eldönteni.')).toBeNull();
  });
});

describe('coerceArray', () => {
  it('a tömböt változatlanul adja vissza', () => {
    expect(coerceArray<number>([1, 2])).toEqual([1, 2]);
  });

  it('az objektumba csomagolt tömböt kibontja', () => {
    // A judge néha {"claims":[...]} alakot ad — bare-tömb feltételezéssel minden állítás
    // "nem támogatott" lenne, ami hamis 1.00 noise sensitivityt adna.
    expect(coerceArray<{ supported: boolean }>({ claims: [{ supported: true }] })).toEqual([
      { supported: true },
    ]);
  });

  it('null-ra és tömb nélküli objektumra üres tömb', () => {
    expect(coerceArray(null)).toEqual([]);
    expect(coerceArray({ a: 1 })).toEqual([]);
  });
});
