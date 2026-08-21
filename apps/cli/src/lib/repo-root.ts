import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

// repo-root.ts — a repo gyökeréhez képesti utak feloldása.
//
// Miért nem `process.cwd()`? Mert akkor a szkript csak a gyökérből indítva működne.
// Miért nem `import.meta.url`? Mert a CLI CJS-re buildel (esbuild format: cjs),
// és ott az import.meta fordítási hiba.
//
// Ezért felfelé keresünk — de a GYÖKERET keressük meg, nem a kért szegmenst. A
// különbség nem elméleti: a `findRepoPath('docs')` a szegmensre keresve az ELSŐ
// olyan könyvtárat fogadná el, ahol van `docs/` — akár a repón kívül, ha a repóban
// éppen nincs. Ugyanígy a `findRepoPath('package.json')` az `apps/cli`-ből futtatva
// az APP package.json-ját adná vissza a gyökéré helyett. A gyökér-marker egyértelmű.

/**
 * A repo gyökerének jele. A `pnpm-workspace.yaml` erre jobb, mint a `.git`: worktree-ben
 * és almodulban a `.git` fájl is lehet, és a monorepo definíció szerint ott kezdődik,
 * ahol a workspace.
 */
const ROOT_MARKER = 'pnpm-workspace.yaml';

/** A repo gyökere a jelenlegi könyvtárból felfelé keresve. */
export function findRepoRoot(): string {
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, ROOT_MARKER))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(
        `Nem találom a repo gyökerét: a jelenlegi könyvtár fölött sehol nincs ` +
          `"${ROOT_MARKER}". A parancsot a repón BELÜLRŐL kell futtatni.`,
      );
    }
    dir = parent;
  }
}

/** A repo GYÖKERÉHEZ képesti út. Dob, ha nincs meg — ne ENOENT-tel derüljön ki. */
export function findRepoPath(...segments: string[]): string {
  const root = findRepoRoot();
  const candidate = join(root, ...segments);
  if (!existsSync(candidate)) {
    throw new Error(
      `Nem találom a(z) "${segments.join('/')}" utat a repo gyökerében (${root}).`,
    );
  }
  return candidate;
}
