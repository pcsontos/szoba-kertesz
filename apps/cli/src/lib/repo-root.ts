import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// repo-root.ts — a repo gyökeréhez képesti utak feloldása, FELFELÉ keresve.
//
// Miért nem `process.cwd()`? Mert akkor a szkript csak a gyökérből indítva működne.
// Miért nem `import.meta.url`? Mert a CLI CJS-re buildel (esbuild format: cjs),
// és ott az import.meta fordítási hiba.

export function findRepoPath(...segments: string[]): string {
  let dir = process.cwd();
  for (;;) {
    const candidate = join(dir, ...segments);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Nem találom a(z) "${segments.join('/')}" utat: sehol nincs meg a jelenlegi ` +
          'könyvtár fölött. A parancsot a repón BELÜLRŐL kell futtatni.',
      );
    }
    dir = parent;
  }
}
