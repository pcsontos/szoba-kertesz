import { describe, expect, it } from 'vitest';
import { DEFAULT_LABEL, parseLabel } from './parse-label.js';

/**
 * A golden set futtatása FIZETŐS. Ezek a tesztek azt rögzítik, hogy a hibás kapcsoló
 * az ELSŐ API-hívás előtt, magyar üzenettel áll meg — és hogy a hiba nem folyik el
 * csendben egy default fájlnévbe, ami egy korábbi mérést írna felül.
 */
describe('parseLabel', () => {
  it('--label nélkül a default nevet adja', () => {
    expect(parseLabel([])).toBe(DEFAULT_LABEL);
    expect(parseLabel(['--quiet'])).toBe(DEFAULT_LABEL);
  });

  it('érvényes nevet visszaad', () => {
    expect(parseLabel(['--label', 'uj-chunker'])).toBe('uj-chunker');
    expect(parseLabel(['--quiet', '--label', 'v2'])).toBe('v2');
  });

  it('ÉRTÉK NÉLKÜLI --label hiba, nem csendes default', () => {
    expect(() => parseLabel(['--label'])).toThrowError(/név is kell/);
  });

  it('a --label utáni MÁSIK kapcsoló nem lesz név', () => {
    expect(() => parseLabel(['--label', '--quiet'])).toThrowError(
      /név is kell/,
    );
  });

  it('fájlnévbe nem való karakterre magyar hibát dob', () => {
    expect(() => parseLabel(['--label', 'Új Futás'])).toThrowError(
      /Érvénytelen label/,
    );
    expect(() => parseLabel(['--label', '../etc/passwd'])).toThrowError(
      /Érvénytelen label/,
    );
  });
});
