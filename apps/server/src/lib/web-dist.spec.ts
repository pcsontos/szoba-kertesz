import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveWebDist } from './web-dist.js';

/**
 * Miért van erre külön modul és teszt? Mert a hibája NEM pirosat ad: ha az út rossz, a
 * szerver elindul, az /api működik, és a felhasználó egy 404-es üres oldalt kap —
 * a hiba csak élesben, böngészőben derülne ki.
 */

describe('resolveWebDist', () => {
  it('létező könyvtárra abszolút utat ad', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'webdist-'));
    await writeFile(join(dir, 'index.html'), '<html></html>', 'utf8');
    expect(resolveWebDist(dir)).toBe(dir);
  });

  it('nem létező útra null', () => {
    expect(resolveWebDist(join(tmpdir(), 'nincs-ilyen-konyvtar-remelem'))).toBeNull();
  });

  it('index.html nélküli könyvtárra null — a puszta létezés nem elég', async () => {
    // Egy üres dist ugyanolyan rossz, mint a hiányzó: a SPA-fallback 404-et adna.
    const dir = await mkdtemp(join(tmpdir(), 'webdist-ures-'));
    expect(resolveWebDist(dir)).toBeNull();
  });

  it('undefined-ra null', () => {
    expect(resolveWebDist(undefined)).toBeNull();
  });
});
