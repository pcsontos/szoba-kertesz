import type { ToolSet } from 'ai';
import { buildPackagePrompt } from './package-prompt.js';
import { runAgentLoop, type AskOptions, type AskResult } from '../agent-loop.js';
import { askInfoAgentTool } from '../../tools/ask-info-agent/ask-info-agent-tool.js';
import { validatePackageTool } from '../../tools/package/validate-package-tool.js';
import { savePackageTool } from '../../tools/package/save-package-tool.js';
import { cancelPackageTool } from '../../tools/package/cancel-package-tool.js';

// package-agent.ts — a CSOMAG-ÉPÍTŐ agent. A projekt saját nevének ad tartalmat: egy szoba
// növénycsomagjának összeállítása, ügyfélre szabva, validálással és mentés előtti
// megerősítéssel. Nem fut SQL-t közvetlenül — mindent az askInfoAgent tooljával olvas.
//   prompt:  package-prompt.ts
//   toolok:  askInfoAgent + validatePackage + savePackage + cancelPackage
//   loop:    a közös agent-loop (../agent-loop.ts)

/** Több lépés kell: ügyfél-azonosítás → keresés (több kör is lehet) → validálás → mentés. */
export const MAX_PACKAGE_STEPS = 10;
const MAX_TOKENS = 2048;

export async function askPackageAgent(
  question: string,
  options: AskOptions = {},
): Promise<AskResult> {
  const trimmed = question.trim();
  if (trimmed === '') {
    throw new Error('Üres kérdést nem lehet feltenni.');
  }

  return runAgentLoop(
    trimmed,
    {
      systemPrompt: buildPackagePrompt(),
      buildTools: (report): ToolSet => ({
        askInfoAgent: askInfoAgentTool(report, {
          print: options.print,
          persistTrace: options.persistTrace,
        }),
        validatePackage: validatePackageTool(report),
        savePackage: savePackageTool(report),
        cancelPackage: cancelPackageTool(report),
      }),
      maxSteps: MAX_PACKAGE_STEPS,
      maxOutputTokens: MAX_TOKENS,
      emptyAnswer:
        'Nem sikerült befejezni a csomag-összeállítást a megengedett lépésszámon belül. Pontosítsd a kérést.',
    },
    options,
  );
}
