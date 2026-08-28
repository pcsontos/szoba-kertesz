import { Writable } from 'node:stream';

// capture-stdout.ts — a stdio-transport LEGKRITIKUSABB mechanizmusa, ezért él külön fájlban és
// ezért van rá spec (a #11 review 2. tétele).
//
// stdio-n a JSON-RPC üzenetek a stdout-on mennek: EGYETLEN odaírt sor használhatatlanná teszi a
// szervert. A hibaosztály, amit ez a fájl kezel, nem pirosat ad, hanem NÉMA LEÁLLÁST — ugyanaz a
// fajta, amit a 08. kör a `data-testid`-ekkel pinnelt („egy törött selector NÉMA ZÖLDET adna").
// Amíg a függvény a main.ts-ben, exportálatlanul ült, semmi sem mérte.
//
// A megoldás: a protokoll megkapja az EREDETI stdout-ot egy külön Writable-ként, a program elől
// pedig elvesszük — minden `process.stdout.write` hívás a stderr-re megy, ahol a host naplózza.
// A Node `console.log`-ja futásidőben nézi meg a `stream.write`-ot, tehát az is a stderr-re kerül.

/**
 * Elveszi a stdout-ot a program elől, és visszaadja a protokollnak szánt, EREDETI stdout-ra
 * író streamet.
 *
 * @returns a `Writable`, amit a `StdioServerTransport`-nak kell átadni.
 */
export function captureStdout(): Writable {
  // A kötés a patchelés ELŐTT történik — különben a protokoll-stream is a stderr-re menne,
  // és a szerver egyáltalán nem tudna válaszolni.
  const rawWrite = process.stdout.write.bind(process.stdout);

  const protocolOut = new Writable({
    write(chunk, encoding, callback): void {
      rawWrite(chunk as Buffer | string, encoding, () => callback());
    },
  });

  process.stdout.write = ((chunk: Buffer | string, ...rest: unknown[]): boolean =>
    (process.stderr.write as (...args: unknown[]) => boolean)(
      chunk,
      ...rest,
    )) as typeof process.stdout.write;

  return protocolOut;
}
