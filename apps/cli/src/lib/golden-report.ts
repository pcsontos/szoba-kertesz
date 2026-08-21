import type { GoldenQuestion } from './golden-questions.js';

// golden-report.ts — a mérés → markdown. TISZTA FÜGGVÉNY: se DB, se API, se fájlrendszer.
// Ezért tesztelhető ingyen, és ezért nem a futtató szkriptben lakik.
//
// Amit a jelentés GENERÁL, és amit NEM: itt a nyers adat áll (mit hozott a két mód).
// Az ELEMZÉS — miért jobb az új sorrend, mit adott a HyDE — a docs/golden-set.md-ben,
// kézzel. Elemzést nem lehet generálni.

export interface GoldenHit {
  readonly title: string;
  readonly source: string;
  readonly chunkIndex: number;
  readonly distance: number;
  /** A reranker pontszáma 0-10, vagy -1, ha nem futott (nyers mód) vagy kiesett. */
  readonly score: number;
}

export interface GoldenRow {
  readonly question: GoldenQuestion;
  readonly raw: readonly GoldenHit[];
  readonly full: readonly GoldenHit[];
  /** Csak a negatív kérdésnél: az agent TELJES válasza — ez a grounding bizonyítéka. */
  readonly agentAnswer?: string;
}

/**
 * Markdown-táblacellába kerülő szöveg. A `|` a cellahatár: escape nélkül EGY kérdőjeles
 * kérdés szétdobná a teljes összefoglaló táblát. A golden set ma verziókövetett, tehát
 * ez nem éles kockázat — de a jelentés generált fájl, amit senki nem néz át kézzel.
 */
const cell = (text: string): string => text.replaceAll('|', '\\|');

function formatHits(hits: readonly GoldenHit[]): string {
  if (hits.length === 0) {
    return '_nincs találat_';
  }
  return hits
    .map((hit, position) => {
      // A -1 azt jelenti: NINCS pontszám (nem pontozták), nem azt, hogy nulla.
      const score = hit.score >= 0 ? ` · rerank ${hit.score}/10` : '';
      return `${position + 1}. **${hit.title}** #${hit.chunkIndex} · dist ${hit.distance.toFixed(3)}${score}`;
    })
    .join('\n');
}

/** Átrendezett-e a rerank? A top-1 cím + darab-index változása a legolvashatóbb jel. */
function reordered(row: GoldenRow): boolean {
  const rawTop = row.raw[0];
  const fullTop = row.full[0];
  if (!rawTop || !fullTop) {
    return false;
  }
  return (
    rawTop.title !== fullTop.title || rawTop.chunkIndex !== fullTop.chunkIndex
  );
}

export function renderGoldenReport(
  label: string,
  runAt: Date,
  rows: readonly GoldenRow[],
): string {
  const lines: string[] = [
    `# Golden set — futás: \`${label}\``,
    '',
    `> Generált fájl, a \`pnpm golden:run --label ${label}\` írta. Ne szerkeszd kézzel.`,
    `> Futás ideje: ${runAt.toISOString()}`,
    '',
    '## Összefoglaló',
    '',
    '| # | kérdés | nyelv | nyers top-1 | teljes top-1 | átrendezett |',
    '|---|---|---|---|---|---|',
  ];

  for (const [position, row] of rows.entries()) {
    const rawTop = row.raw[0]?.title ?? '—';
    const fullTop = row.full[0]?.title ?? '—';
    lines.push(
      `| ${position + 1} | ${cell(row.question.question)} | ${row.question.language} | ` +
        `${cell(rawTop)} | ${cell(fullTop)} | ${reordered(row) ? 'IGEN — átrendezte' : 'nem'} |`,
    );
  }

  for (const row of rows) {
    lines.push(
      '',
      '---',
      '',
      `## ${row.question.kind === 'negative' ? 'NEGATÍV TESZT — ' : ''}${row.question.question}`,
      '',
      `\`${row.question.id}\` · nyelv: ${row.question.language} · típus: ${row.question.kind}`,
      '',
      `**Miért van a listában:** ${row.question.why}`,
      '',
      '### Nyers vektorkeresés (HyDE és rerank NÉLKÜL)',
      '',
      formatHits(row.raw),
      '',
      '### Teljes pipeline (HyDE + rerank)',
      '',
      formatHits(row.full),
      '',
      reordered(row)
        ? '**A rerank átrendezte a sorrendet** — a két lista top-1 találata különbözik.'
        : '_A top-1 találat nem változott._',
    );

    if (row.agentAnswer !== undefined) {
      lines.push(
        '',
        '### Az agent válasza (a grounding próbája)',
        '',
        '> ' + row.agentAnswer.split('\n').join('\n> '),
      );
    }
  }

  return lines.join('\n') + '\n';
}
