import { describe, expect, it } from 'vitest';
import { createColors } from './ansi.js';

// A `c` konstans a futásidejű TTY-detektálásra épül, ami tesztben NEM determinisztikus
// (vitest néha TTY-ba ír, néha pipe-ba). Ezért a viselkedést a `createColors` factoryn
// keresztül rögzítjük — az a kapcsoló, amit a `c` csak beköt.
describe('ansi — a közös szín-helper', () => {
  it('bekapcsolva ANSI escape-be csomagolja a szöveget', () => {
    expect(createColors(true).cyan('x')).toBe('\x1b[36mx\x1b[0m');
  });

  it('kikapcsolva érintetlenül adja vissza a szöveget', () => {
    expect(createColors(false).cyan('x')).toBe('x');
  });

  it('ugyanazokat a kódokat használja, amiket a trace.ts eddig', () => {
    const colors = createColors(true);
    expect(colors.dim('x')).toBe('\x1b[2mx\x1b[0m');
    expect(colors.bold('x')).toBe('\x1b[1mx\x1b[0m');
    expect(colors.red('x')).toBe('\x1b[31mx\x1b[0m');
    expect(colors.green('x')).toBe('\x1b[32mx\x1b[0m');
    expect(colors.yellow('x')).toBe('\x1b[33mx\x1b[0m');
    expect(colors.magenta('x')).toBe('\x1b[35mx\x1b[0m');
    expect(colors.white('x')).toBe('\x1b[37mx\x1b[0m');
  });
});
