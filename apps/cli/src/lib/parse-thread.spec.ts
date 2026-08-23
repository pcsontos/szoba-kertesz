import { describe, expect, it } from 'vitest';
import { parseThreadId } from './parse-thread.js';

describe('parseThreadId — a --thread validálása a rendszerhatáron', () => {
  it('érvényes UUID-t átenged', () => {
    const id = '99999999-9999-4999-8999-999999999999';

    expect(parseThreadId(id)).toBe(id);
  });

  it('érvénytelen értékre rövid magyar hibát dob (API-hívás előtt)', () => {
    expect(() => parseThreadId('nem-uuid')).toThrow(/beszélgetés-azonosító/i);
  });

  it('hiányzó értékre is dob, nem ad vissza undefined-ot', () => {
    expect(() => parseThreadId(undefined)).toThrow(/beszélgetés-azonosító/i);
  });
});
