import { writeFileSync } from 'node:fs';
import { embedBatch } from '@szoba-kertesz/core';

// embed-demo.ts — a szemléltetőhöz: VALÓDI embeddingek + VALÓDI koszinusz-távolságok.
// Futtatás: `pnpm embed:demo`
// A kimenet (embed-demo.json) az, amit az órán ki lehet vetíteni — nem kitalált számok,
// hanem az, amit a text-embedding-3-small ténylegesen mond.

try {
  process.loadEnvFile();
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

const SENTENCES = [
  // ── ugyanaz a kérdés, más szavakkal (ezeknek KÖZEL kell lenniük egymáshoz) ──
  'my monstera leaves are turning yellow',
  'leaves turning yellow on my plant',
  'why is my plant yellowing?',
  'sárgulnak a növényem levelei', // MAGYARUL — a modell többnyelvű: a JELENTÉS köti össze, nem a szó
  // ── rokon téma: öntözés ──
  'overwatering causes root rot',
  'how often should I water my fern?',
  // ── rokon téma: kártevők ──
  'fungus gnats in the soil',
  'spider mites on the underside of leaves',
  // ── rokon téma: fény és elhelyezés ──
  'best plants for a dark bathroom',
  // ── LAKBERENDEZÉS (a szobakertész célcsoportja) ──
  'which plants work best in a minimalist living room?',
  'tall statement plant for an empty corner',
  'milyen növény illik egy skandináv nappaliba?', // magyarul — a célcsoport így kérdez
  // ── teljesen más világ: bolti / logisztikai szöveg ──
  'gift card and return policy',
  'do you ship to Hungary?',
];

/** Koszinusz-távolság: 1 - cos(a, b). 0 = azonos jelentés, 1 = semmi köze. */
function cosineDistance(left: number[], right: number[]): number {
  let dot = 0;
  let normLeft = 0;
  let normRight = 0;
  for (let index = 0; index < left.length; index++) {
    dot += (left[index] as number) * (right[index] as number);
    normLeft += (left[index] as number) ** 2;
    normRight += (right[index] as number) ** 2;
  }
  return 1 - dot / (Math.sqrt(normLeft) * Math.sqrt(normRight));
}

async function main(): Promise<void> {
  const embeddings = await embedBatch([...SENTENCES]);

  const distances = SENTENCES.map((_unused, row) =>
    SENTENCES.map((_ignored, column) =>
      Number(
        cosineDistance(
          embeddings[row] as number[],
          embeddings[column] as number[],
        ).toFixed(4),
      ),
    ),
  );

  const output = {
    model: 'text-embedding-3-small',
    dimensions: embeddings[0]?.length ?? 0,
    sentences: SENTENCES,
    // Az első 8 szám mindegyik vektorból — hogy látszódjon, MIK ezek valójában.
    preview: embeddings.map((vector) =>
      vector.slice(0, 8).map((value) => Number(value.toFixed(4))),
    ),
    distances,
  };

  writeFileSync('embed-demo.json', JSON.stringify(output, null, 2));
  console.log(
    `${SENTENCES.length} mondat, ${output.dimensions} dimenzió → embed-demo.json`,
  );

  // Gyors ellenőrzés a konzolon: mi van közel az elsőhöz, és mi van messze?
  const first = distances[0] as number[];
  const ranked = SENTENCES.map((text, index) => ({
    text,
    distance: first[index] as number,
  }))
    .slice(1)
    .sort((left, right) => left.distance - right.distance);
  for (const { text, distance } of ranked) {
    console.log(`  ${distance.toFixed(3)}  ${text}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
