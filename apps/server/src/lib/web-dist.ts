import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

// web-dist.ts — HOL VAN A BUILDELT WEB. A 09. körig két service volt (Vite a 4200-on, Express
// a 3000-en); élesben EGY service szolgálja ki mindkettőt, mert így nincs cross-origin hívás,
// és a Basic auth a webes felületet is fedi.
//
// Az `index.html` meglétét is nézzük, nem csak a könyvtárét: egy üres vagy félig másolt dist
// ugyanolyan rossz, mint a hiányzó — a SPA-fallback 404-et adna, és a hiba csak böngészőben,
// élesben derülne ki.

export function resolveWebDist(candidate: string | undefined): string | null {
  if (candidate === undefined || candidate === '') {
    return null;
  }
  const absolute = isAbsolute(candidate)
    ? candidate
    : resolve(process.cwd(), candidate);
  return existsSync(resolve(absolute, 'index.html')) ? absolute : null;
}
