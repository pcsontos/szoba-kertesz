// parse-label.ts — a `--label` kapcsoló validálása a rendszer HATÁRÁN.
//
// Miért itt, és miért nem a szkriptben? Mert a golden set futtatása FIZETŐS: kérdésenként
// 2 embedding + 1 HyDE + 1 rerank. Egy elgépelt kapcsoló ne az utolsó API-hívás után
// derüljön ki, és főleg ne CSENDBEN essen vissza egy default fájlnévre — a `futas-futas.md`
// felülírása pont azt a mérést törölné, amiért a szkript egyáltalán fut.

/** Ha nincs `--label` a parancssorban, ez a fájlnév. */
export const DEFAULT_LABEL = 'futas';

/** A név FÁJLNÉVBE kerül (`docs/golden/futas-<név>.md`), ezért szűk a karakterkészlet. */
const LABEL_PATTERN = /^[a-z0-9-]+$/;

/**
 * `--label <név>` kiolvasása az argv-ből. Hiányzó kapcsoló → `DEFAULT_LABEL`;
 * MEGADOTT, de érvénytelen érték → hiba. A kettő nem ugyanaz: a kapcsoló elhagyása
 * választás, a hiányzó vagy hibás értéke elgépelés.
 */
export function parseLabel(argv: readonly string[]): string {
  const index = argv.indexOf('--label');
  if (index === -1) {
    return DEFAULT_LABEL;
  }

  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(
      'A --label kapcsolóhoz név is kell: `pnpm golden:run --label <név>`. ' +
        'Csak kisbetű, szám és kötőjel használható — a név fájlnévbe kerül.',
    );
  }

  if (!LABEL_PATTERN.test(value)) {
    throw new Error(
      `Érvénytelen label: "${value}". Csak kisbetű, szám és kötőjel használható — a név fájlnévbe kerül.`,
    );
  }

  return value;
}
