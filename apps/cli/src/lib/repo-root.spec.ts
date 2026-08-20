import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findRepoPath } from './repo-root.js';

/**
 * A szkriptek a repo GYÖKERÉHEZ képesti fájlokat olvasnak (seed/knowledge, seed/golden-set.json).
 * A `process.cwd()`-hez kötve más könyvtárból indítva ENOENT-tel szállnának el, `import.meta.url`-hez
 * kötve pedig nem fordulnának: a CLI CJS-re buildel, ott az import.meta tilos. Ezért keresünk FELFELÉ.
 */
describe('findRepoPath', () => {
  it('megtalálja a korpuszt a repo bármely alkönyvtárából', () => {
    const found = findRepoPath('seed', 'knowledge');

    expect(existsSync(found)).toBe(true);
    expect(found.endsWith('seed/knowledge')).toBe(true);
  });

  it('fájlt is megtalál, nem csak könyvtárat', () => {
    expect(existsSync(findRepoPath('package.json'))).toBe(true);
  });

  it('nem létező útra ÉRTHETŐ MAGYAR hibát dob, nem ENOENT-et', () => {
    expect(() => findRepoPath('nincs-ilyen-konyvtar-xyz')).toThrowError(
      /Nem találom/,
    );
  });
});
