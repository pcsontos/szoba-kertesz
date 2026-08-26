// battery-markdown.ts — a futás EMBERI olvasata. Tiszta függvény, ezért unit-tesztelhető;
// a JSON marad a gépi igazságforrás, ez csak NÉZET. Ugyanaz a minta, mint a golden-report.ts.
import { type BatteryRun, summarize } from './battery-result.js';
import { formatUsd } from './cost.js';

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`;
}

/** NULL = nem mért érték. LÁTHATÓAN, nem 0-ként — különben a mérés hazudik. */
function optionalSeconds(ms: number | null): string {
  return ms === null ? 'n/a' : seconds(ms);
}

function truncate(text: string, limit = 400): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > limit ? `${clean.slice(0, limit)}…` : clean;
}

export function renderBatteryMarkdown(run: BatteryRun): string {
  const summary = summarize(run.results);
  const lines: string[] = [];

  lines.push('# Szoba-kertész — nehézségi létra riport');
  lines.push('');
  lines.push('> Generált fájl, a `pnpm autotest:battery` írta. Ne szerkeszd kézzel.');
  lines.push(`> Futás ideje: ${run.startedAt} · Felület: ${run.web}`);
  lines.push('');
  lines.push(
    `Esetek: **${summary.total}** · **${summary.failed} bukott** · ` +
      `átlag válaszidő **${seconds(summary.avgMs)}** · ` +
      `átlag TTFC **${optionalSeconds(summary.avgTtfcMs)}** ` +
      `(${summary.ttfcAvailable}/${summary.total} mérhető) · ` +
      `becsült költség **${formatUsd(summary.totalCostUsd)}**`,
  );
  lines.push('');
  lines.push('## Összegző tábla');
  lines.push('');
  lines.push('| # | Fok | Eset | Idő | TTFC | Token | Ítélet |');
  lines.push('|---|---|---|---|---|---|---|');
  run.results.forEach((result, index) => {
    const mark = result.verdict.accepted ? '✅' : `⚠️ ${result.flags.join('; ')}`;
    lines.push(
      `| ${index + 1} | ${result.tier} | ${truncate(result.q, 60)} | ${seconds(result.ms)} | ` +
        `${optionalSeconds(result.ttfcMs)} | ${result.tokens ?? 'n/a'} | ${mark} |`,
    );
  });

  if (run.consistency.length > 0) {
    lines.push('');
    lines.push('## Konzisztencia');
    lines.push('');
    lines.push('| Eset | Elfogadva | Egyetértés | Stabil |');
    lines.push('|---|---|---|---|');
    for (const entry of run.consistency) {
      lines.push(
        `| ${entry.id} | ${entry.acceptedCount}/${entry.runs} | ` +
          `${Math.round(entry.agreement * 100)}% | ${entry.stable ? 'igen' : '**INGADOZIK**'} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Esetek');
  lines.push('');
  run.results.forEach((result, index) => {
    lines.push(`### ${index + 1}. [${result.tier}] ${result.q}`);
    lines.push('');
    lines.push(`*${result.verdict.reason}*`);
    if (result.truth !== undefined) {
      lines.push('');
      lines.push(`**Ground truth:** ${result.truth}`);
    }
    lines.push('');
    lines.push(`> ${truncate(result.answer, 800).replace(/\n/g, '\n> ')}`);
    lines.push('');
  });

  return lines.join('\n');
}
