// rag-html.ts — a RAG-mérés HTML-nézete. KÜLÖN riport a batteryétől: más a kérdés, amit
// megválaszol. A battery azt méri, hogy a felület jól viselkedik-e; ez azt, hogy a retrieval
// és a generálás jó-e — és a kettőt külön kell tudni hibáztatni.
import { bar, esc, htmlDocument, md } from './html.js';
import {
  averageMetric,
  METRIC_LABELS,
  type MetricName,
  type RagRun,
} from './rag-result.js';

/** A noise sensitivity fordított skálájú: ott a KEVESEBB a jobb. */
function tone(metric: MetricName): 'good' | 'bad' {
  return metric === 'noiseSensitivity' ? 'bad' : 'good';
}

function metricRow(metric: MetricName, label: string, value: number | null): string {
  // A `bar` NaN-ra „n/a"-t ad — a null-t ezért NaN-ra fordítjuk, nem 0-ra.
  return (
    `<tr><td>${esc(label)}</td><td>${bar(value === null ? Number.NaN : value, tone(metric))}</td></tr>`
  );
}

export function renderRagHtml(run: RagRun): string {
  const head =
    `<h1>Szoba-kertész — RAG-kiértékelés</h1>` +
    `<p class="muted">${esc(run.startedAt)} · válasz: <code>${esc(run.answerModel)}</code> · ` +
    `ítélő: <code>${esc(run.judgeModel)}</code></p>` +
    `<div class="card"><p><strong>${run.cases.length}</strong> eset · ` +
    `RAGAS-stílusú metrikák, hibrid ítélővel: ahol determinisztikusan mérhető (koszinusz), ` +
    `ott a SZÁM látszik; ahol nem, ott LLM dönt — indoklással.</p></div>`;

  const summary =
    `<h2>Átlagok</h2><div class="tbl-wrap"><table><thead><tr>` +
    `<th>Metrika</th><th>Átlag</th></tr></thead><tbody>` +
    METRIC_LABELS.map(({ key, label }) =>
      metricRow(key, label, averageMetric(run, key)),
    ).join('') +
    `</tbody></table></div>` +
    `<p class="muted">A <em>n/a</em> azt jelenti, hogy a metrikát NEM SIKERÜLT megmérni ` +
    `(a judge nem adott értékelhető választ) — nem azt, hogy nulla lett.</p>`;

  const cases =
    `<h2>Esetek</h2>` +
    run.cases
      .map((entry) => {
        const metrics =
          `<div class="tbl-wrap"><table><thead><tr><th>Metrika</th><th>Érték</th></tr></thead><tbody>` +
          METRIC_LABELS.map(({ key, label }) =>
            metricRow(key, label, entry.metrics[key]),
          ).join('') +
          `</tbody></table></div>`;

        const chunks =
          entry.chunks.length === 0
            ? '<p class="muted">Nem jött vissza chunk.</p>'
            : `<div class="tbl-wrap"><table><thead><tr>` +
              `<th>#</th><th>Forrás</th><th>Távolság</th><th>Koszinusz</th><th>Releváns?</th>` +
              `<th>A judge indoklása</th></tr></thead><tbody>` +
              entry.chunks
                .map(
                  (chunk, index) =>
                    `<tr><td>${index + 1}</td><td>${esc(chunk.title)}<br>` +
                    `<span class="muted">${esc(chunk.source)}</span></td>` +
                    `<td>${chunk.distance.toFixed(3)}</td><td>${chunk.sim.toFixed(2)}</td>` +
                    `<td>${
                      chunk.relevant
                        ? '<span class="ok">igen</span>'
                        : '<span class="bad">nem</span>'
                    }</td>` +
                    `<td>${esc(chunk.reason)}</td></tr>`,
                )
                .join('') +
              `</tbody></table></div>`;

        return (
          `<details class="card" open><summary>${esc(entry.id)} — ${esc(entry.question)}</summary>` +
          metrics +
          `<h4>A válasz (kizárólag a kontextusból)</h4>${md(entry.answer)}` +
          `<h4>Kurált referencia (ground truth)</h4>${md(entry.groundTruth)}` +
          `<h4>Visszakapott chunkok</h4>${chunks}` +
          `<p class="muted">${(entry.latencyMs / 1000).toFixed(1)} s · ${entry.tokens} token</p>` +
          `</details>`
        );
      })
      .join('');

  return htmlDocument('Szoba-kertész — RAG-kiértékelés', head + summary + cases);
}
