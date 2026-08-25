// battery-html.ts — a battery-futás HTML-nézete. TISZTA függvény: a fájl-IO és a
// böngésző-nyitás a report-html.ts dolga. Így a renderelés unit-tesztelhető, API és böngésző
// nélkül — pont az a kód, ami a demón látszik, és amit különben senki nem ellenőrizne.
import { z } from 'zod';
import { bar, chatThread, esc, htmlDocument } from './html.js';
import { type BatteryRun, summarize } from './battery-result.js';
import { formatUsd } from './cost.js';

const SuggestionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  area: z.enum(['prompt', 'tool', 'ux', 'infra']),
  rationale: z.string().min(1),
  /** Melyik esetre hivatkozik — enélkül a javaslat nem visszakereshető, és az ADR értelmét veszti. */
  evidence: z.string().min(1),
});

export const SuggestionsSchema = z.object({ suggestions: z.array(SuggestionSchema) });
export type Suggestion = z.infer<typeof SuggestionSchema>;

function seconds(ms: number | null): string {
  return ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)} s`;
}

export function renderBatteryHtml(
  run: BatteryRun,
  suggestions: readonly Suggestion[],
): string {
  const summary = summarize(run.results);
  const passRatio = summary.total === 0 ? 0 : (summary.total - summary.failed) / summary.total;

  const head =
    `<h1>Szoba-kertész — nehézségi létra</h1>` +
    `<p class="muted">${esc(run.startedAt)} · ${esc(run.web)}</p>` +
    `<div class="card">` +
    `<p><strong>${summary.total}</strong> eset · ` +
    `<span class="${summary.failed === 0 ? 'ok' : 'bad'}"><strong>${summary.failed}</strong> bukott</span> · ` +
    `átlag ${seconds(summary.avgMs)} · TTFC ${seconds(summary.avgTtfcMs)} ` +
    `(${summary.ttfcAvailable}/${summary.total} mérhető) · ` +
    `becsült költség <strong>${esc(formatUsd(summary.totalCostUsd))}</strong></p>` +
    `<p>Átmenő arány: ${bar(passRatio, summary.failed === 0 ? 'good' : 'bad')}</p>` +
    `</div>`;

  const table =
    `<h2>Összegző tábla</h2><div class="tbl-wrap"><table><thead><tr>` +
    `<th>#</th><th>Fok</th><th>Eset</th><th>Idő</th><th>TTFC</th><th>Token</th><th>Ítélet</th>` +
    `</tr></thead><tbody>` +
    run.results
      .map((result, index) => {
        const mark = result.verdict.accepted
          ? '<span class="ok">✅</span>'
          : `<span class="bad">⚠️ ${esc(result.flags.join('; '))}</span>`;
        return (
          `<tr><td>${index + 1}</td><td>${esc(result.tier)}</td><td>${esc(result.q)}</td>` +
          `<td>${seconds(result.ms)}</td><td>${seconds(result.ttfcMs)}</td>` +
          `<td>${result.tokens ?? 'n/a'}</td><td>${mark}</td></tr>`
        );
      })
      .join('') +
    `</tbody></table></div>`;

  const consistency =
    run.consistency.length === 0
      ? ''
      : `<h2>Konzisztencia</h2>` +
        `<p class="muted">Ugyanaz a kérdés többször. Az „INGADOZIK" azt jelenti, hogy az agent ` +
        `kód-változás nélkül más ítéletet kapott — ez az LLM nem-determinizmusa, nem hiba.</p>` +
        `<div class="tbl-wrap"><table><thead><tr>` +
        `<th>Eset</th><th>Elfogadva</th><th>Egyetértés</th><th>Stabil</th></tr></thead><tbody>` +
        run.consistency
          .map(
            (entry) =>
              `<tr><td>${esc(entry.id)}</td><td>${entry.acceptedCount}/${entry.runs}</td>` +
              `<td>${bar(entry.agreement)}</td>` +
              `<td>${
                entry.stable
                  ? '<span class="ok">igen</span>'
                  : '<span class="bad">INGADOZIK</span>'
              }</td></tr>`,
          )
          .join('') +
        `</tbody></table></div>`;

  const suggestionsHtml =
    suggestions.length === 0
      ? ''
      : `<h2>Javaslatok</h2>` +
        suggestions
          .map(
            (item) =>
              `<div class="card"><p><strong>${esc(item.id)} — ${esc(item.title)}</strong> ` +
              `<span class="muted">[${esc(item.severity)} · ${esc(item.area)}]</span></p>` +
              `<p>${esc(item.rationale)}</p>` +
              `<p class="muted">Bizonyíték: ${esc(item.evidence)}</p></div>`,
          )
          .join('');

  // Az esetek ALAPBÓL ÖSSZECSUKVA — 29 teljes átirat egyben olvashatatlan lenne. A bukottak
  // viszont nyitva: azokat kell elolvasni.
  const cases =
    `<h2>Esetek</h2>` +
    run.results
      .map(
        (result, index) =>
          `<details class="card"${result.verdict.accepted ? '' : ' open'}>` +
          `<summary>${index + 1}. [${esc(result.tier)}] ${esc(result.q)} — ` +
          `${
            result.verdict.accepted
              ? '<span class="ok">elfogadva</span>'
              : '<span class="bad">elutasítva</span>'
          }</summary>` +
          `<p class="muted">${esc(result.verdict.reason)}</p>` +
          (result.truth === undefined
            ? ''
            : `<p><strong>Ground truth:</strong> ${esc(result.truth)}</p>`) +
          chatThread(result.q, result.answer) +
          `</details>`,
      )
      .join('');

  return htmlDocument(
    'Szoba-kertész — nehézségi létra riport',
    head + table + consistency + suggestionsHtml + cases,
  );
}
