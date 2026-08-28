import { Console } from 'node:console';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureStdout } from './capture-stdout.js';

// Ez a spec azt a hibaosztályt fedi, ami NEM pirosat adna, hanem néma protokoll-leállást:
// ha a captureStdout elromlik, a szerver csendben használhatatlanná válik. Mindhárom állítás
// a valódi process.stdout/stderr-en mér, ezért a patch-et minden teszt után visszaállítjuk.

const originalStdoutWrite = process.stdout.write;

afterEach(() => {
  process.stdout.write = originalStdoutWrite;
  vi.restoreAllMocks();
});

describe('captureStdout', () => {
  it('a patchelt process.stdout.write a STDERR-re megy (a protokoll nem sérül)', () => {
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    captureStdout();
    process.stdout.write('ez nem mehet a protokoll-csatornára\n');

    expect(stderrSpy).toHaveBeenCalledWith('ez nem mehet a protokoll-csatornára\n');
  });

  it('a patch ELŐTT létrejött Console fecsegése is a stderr-re kerül', () => {
    // Ez a valósághű eset: a globális console a Node indulásakor jön létre, jóval a
    // captureStdout() előtt — mégis a PATCHELT write-ot kell használnia, mert a Node
    // híváskor nézi meg a stream.write-ot, nem konstruáláskor.
    //
    // Miért nem a globális `console.log`-gal mérünk? Mert a Vitest elfogja a globális
    // console-t a saját riportjához, így az el sem jutna a process.stdout.write-ig — a
    // teszt a Vitestet mérné, nem a kódunkat.
    const early = new Console(process.stdout);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    captureStdout();
    early.log('egy függőség fecsegése');

    expect(stderrSpy).toHaveBeenCalled();
    const written = stderrSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
    expect(written).toContain('egy függőség fecsegése');
  });

  it('a visszaadott Writable az EREDETI stdout-ra ír, nem a stderr-re', () => {
    const writes: string[] = [];
    // Az eredeti write-ot cseréljük le a patchelés ELŐTT, hogy lássuk, mi jutna ki rajta.
    process.stdout.write = ((chunk: Buffer | string): boolean => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

    const protocolOut = captureStdout();
    protocolOut.write('{"jsonrpc":"2.0"}\n');

    expect(writes).toEqual(['{"jsonrpc":"2.0"}\n']);
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('a protokoll-stream write-callbackje lefut (különben a transport megállna)', async () => {
    process.stdout.write = (((
      _chunk: Buffer | string,
      _encoding: unknown,
      callback?: () => void,
    ): boolean => {
      callback?.();
      return true;
    }) as unknown) as typeof process.stdout.write;

    const protocolOut = captureStdout();

    await new Promise<void>((resolve, reject) => {
      protocolOut.write('teszt\n', (error) => (error ? reject(error) : resolve()));
    });

    expect(true).toBe(true);
  });
});
