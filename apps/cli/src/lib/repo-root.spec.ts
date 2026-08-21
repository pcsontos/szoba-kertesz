import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findRepoPath, findRepoRoot } from './repo-root.js';

/**
 * A szkriptek a repo GYÖKERÉHEZ képesti fájlokat olvasnak (seed/knowledge, seed/golden-set.json).
 * A `process.cwd()`-hez kötve más könyvtárból indítva ENOENT-tel szállnának el, `import.meta.url`-hez
 * kötve pedig nem fordulnának: a CLI CJS-re buildel, ott az import.meta tilos. Ezért keresünk FELFELÉ —
 * de a GYÖKERET keressük meg, nem a kért szegmens első előfordulását.
 */
describe('findRepoPath', () => {
  it('megtalálja a korpuszt a repo bármely alkönyvtárából', () => {
    const found = findRepoPath('seed', 'knowledge');

    expect(existsSync(found)).toBe(true);
    expect(found.endsWith('seed/knowledge')).toBe(true);
  });

  it('a GYÖKÉR package.json-ját adja, nem a legközelebbit', () => {
    // A tesztek az apps/cli-ből futnak, ahol VAN package.json. A szegmensre keresve
    // azt kapnánk vissza; a gyökér-markerre keresve a workspace gyökerét kapjuk.
    const found = findRepoPath('package.json');

    expect(dirname(found)).toBe(findRepoRoot());
    expect(existsSync(join(dirname(found), 'pnpm-workspace.yaml'))).toBe(true);

    const pkg: unknown = JSON.parse(readFileSync(found, 'utf8'));
    expect((pkg as { name?: string }).name).toBe('@szoba-kertesz/source');
  });

  it('nem létező útra ÉRTHETŐ MAGYAR hibát dob, nem ENOENT-et', () => {
    expect(() => findRepoPath('nincs-ilyen-konyvtar-xyz')).toThrowError(
      /Nem találom/,
    );
  });
});
