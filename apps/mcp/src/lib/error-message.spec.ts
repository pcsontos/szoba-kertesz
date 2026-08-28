import { describe, expect, it } from 'vitest';
import { errorMessage } from './error-message.js';

// A mért eset (Task 7 élő próbája, DB leállítva): a pg `AggregateError`-jének `.message`-e
// ÜRES, a valódi ok az `.errors`-ben van. Ez a spec pontosan azt az alakot pinneli.

describe('errorMessage', () => {
  it('kicsomagolja az ÜRES üzenetű AggregateError-t (ez volt a mért pg-eset)', () => {
    const aggregate = new AggregateError(
      [new Error('connect ECONNREFUSED 127.0.0.1:5433')],
      '',
    );

    expect(errorMessage(aggregate)).toBe('connect ECONNREFUSED 127.0.0.1:5433');
  });

  it('több belső hibát pontosvesszővel fűz össze', () => {
    const aggregate = new AggregateError([new Error('első'), new Error('második')], '');

    expect(errorMessage(aggregate)).toBe('első; második');
  });

  it('megtartja az AggregateError saját üzenetét is, ha van', () => {
    const aggregate = new AggregateError([new Error('belső ok')], 'külső cím');

    expect(errorMessage(aggregate)).toBe('külső cím: belső ok');
  });

  it('üres AggregateError-nál sem ad üres sztringet', () => {
    expect(errorMessage(new AggregateError([], ''))).toBe('AggregateError');
  });

  it('sima Error üzenetét változatlanul adja vissza', () => {
    expect(errorMessage(new Error('sima hiba'))).toBe('sima hiba');
  });

  it('üres üzenetű sima Error-nál az osztály nevére esik vissza', () => {
    expect(errorMessage(new TypeError(''))).toBe('TypeError');
  });

  it('nem-Error értéket stringgé alakít', () => {
    expect(errorMessage('csak egy szöveg')).toBe('csak egy szöveg');
    expect(errorMessage(42)).toBe('42');
  });
});
