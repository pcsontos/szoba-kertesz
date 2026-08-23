// ansi.ts — MINIMÁLIS ANSI szín-helper, függőség nélkül. EGY stílus az egész projektben.
//
// Eddig két stílus élt egymás mellett: a `trace.ts` egy rendes `c` objektumot tartott
// (NO_COLOR-t betartva), a `rag/retrieve.ts` viszont nyers escape-eket írt bele a
// sablonokba — tehát a RAG-nyom SZÍNES MARADT olyan környezetben is, ahol a felhasználó
// kifejezetten kikapcsolta a színezést, és csővezetékbe írva olvashatatlan szemetet adott.
//
// A `createColors(enabled)` azért van kivezetve a `c` mellé, hogy a viselkedés
// TESZTELHETŐ legyen: a `c` a futásidejű TTY-detektálásra épül, ami tesztben nem
// determinisztikus.

export interface Colors {
  readonly dim: (s: string) => string;
  readonly bold: (s: string) => string;
  readonly red: (s: string) => string;
  readonly green: (s: string) => string;
  readonly yellow: (s: string) => string;
  readonly magenta: (s: string) => string;
  readonly cyan: (s: string) => string;
  readonly white: (s: string) => string;
}

export function createColors(enabled: boolean): Colors {
  const wrap =
    (code: number) =>
    (s: string): string =>
      enabled ? `\x1b[${code}m${s}\x1b[0m` : s;

  return {
    dim: wrap(2),
    bold: wrap(1),
    red: wrap(31),
    green: wrap(32),
    yellow: wrap(33),
    magenta: wrap(35),
    cyan: wrap(36),
    white: wrap(37),
  };
}

/** Színezünk-e: csak igazi terminálba, és csak ha a NO_COLOR nem tiltja. */
export const colorsEnabled =
  Boolean(process.stdout.isTTY) && !process.env['NO_COLOR'];

/** A projekt közös szín-objektuma. Ezt importálja a trace.ts és a rag/retrieve.ts is. */
export const c = createColors(colorsEnabled);
