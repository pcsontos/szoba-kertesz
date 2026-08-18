import { describe, expect, it } from 'vitest';
import { isNearBottom } from './scroll.js';

/**
 * Az okos auto-scroll magja, DOM nélkül tesztelhetően: a komponens csak a három
 * számot adja át. A szabály: stream közben CSAK akkor görgetünk, ha a felhasználó
 * amúgy is alul van — ha feljebb olvas, nem rángatjuk vissza.
 */
describe('isNearBottom', () => {
  it('alul állva igaz', () => {
    expect(
      isNearBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 }),
    ).toBe(true);
  });

  it('a küszöbön belül még igaz', () => {
    expect(
      isNearBottom({ scrollTop: 860, scrollHeight: 1000, clientHeight: 100 }),
    ).toBe(true);
  });

  it('feljebb olvasva hamis — ilyenkor nem rángatjuk vissza a nézetet', () => {
    expect(
      isNearBottom({ scrollTop: 200, scrollHeight: 1000, clientHeight: 100 }),
    ).toBe(false);
  });

  it('a küszöb állítható', () => {
    expect(
      isNearBottom(
        { scrollTop: 700, scrollHeight: 1000, clientHeight: 100 },
        250,
      ),
    ).toBe(true);
  });
});
