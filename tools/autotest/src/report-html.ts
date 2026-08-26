// report-html.ts — a battery JSON-jából HTML-riport. VÉKONY belépő: a renderelés a
// lib/battery-html.ts dolga (tesztelhető), itt csak fájl-IO és böngésző-nyitás van.
//
// A javaslat-fájl az AGENTÉ, nem a szkripté: a skill 2. lépésében az agent olvassa a futás
// JSON-ját, és ő írja a suggestions.json-t. A generátor csak megjeleníti — de VALIDÁLJA,
// mert kívülről jövő fájl.
//
// Használat:
//   pnpm autotest:report logs/autotest/<ts>-battery.json [suggestions.json] [--no-open]
import { readFileSync, writeFileSync } from 'node:fs';
import { BatteryRunSchema } from './lib/battery-result.js';
import {
  renderBatteryHtml,
  type Suggestion,
  SuggestionsSchema,
} from './lib/battery-html.js';
import { openInBrowser } from './lib/html.js';

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function main(): void {
  const args = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const runPath = args[0];
  if (runPath === undefined) {
    throw new Error(
      'Használat: pnpm autotest:report <battery.json> [suggestions.json] [--no-open]',
    );
  }

  const run = BatteryRunSchema.parse(readJson(runPath));

  let suggestions: Suggestion[] = [];
  const suggestionsPath = args[1];
  if (suggestionsPath !== undefined) {
    suggestions = SuggestionsSchema.parse(readJson(suggestionsPath)).suggestions;
  }

  const outPath = runPath.replace(/\.json$/, '-report.html');
  writeFileSync(outPath, renderBatteryHtml(run, suggestions), 'utf8');
  console.log(`Riport: ${outPath}`);

  if (!process.argv.includes('--no-open')) {
    openInBrowser(outPath);
  }
}

main();
