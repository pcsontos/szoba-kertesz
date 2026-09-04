import type { ToolSet } from 'ai';
import { ORCHESTRATOR_PROMPT } from './orchestrator-prompt.js';
import { findLastFlowSignal } from './flow-lock.js';
import { runAgentLoop, type AskOptions, type AskResult } from '../agent-loop.js';
import { type AskAgentOptions } from '../query-agent/query-agent.js';
import { askPackageAgent } from '../package-agent/package-agent.js';
import { routeToPackageAgentTool } from '../../tools/route-to-package/route-to-package-tool.js';
import { routeToInfoAgentTool } from '../../tools/route-to-info/route-to-info-tool.js';
import { CURRENT_ROLE } from '../../user-role/user-role.js';

// orchestrator-agent.ts — a NEGYEDIK agent, de más fajta: sosem válaszol saját szóval, csak
// IRÁNYÍT. Két tool-ja van (routeToPackageAgent, routeToInfoAgent), mindkettő egy TELJES
// beágyazott agent-loopot futtat (ugyanaz az agent-mint-tool minta, mint a delegateToIngest),
// és a promptja előírja: a tool eredményét SZÓ SZERINT add vissza.
//
// A FLOW-LOCK a költség miatt kritikus: ha a history-ban a legutóbbi jelző-tool
// routeToPackageAgent (a package-flow tehát nyitva van), az orchestrátor LLM-hívása KI SEM
// MEGY — egyenesen a package-agentet hívjuk. Egy N-köríves csomag-építés így egyetlen plusz
// LLM-hívásba kerül (az elsőbe), nem N-be.

export const MAX_ORCHESTRATOR_STEPS = 2;
const MAX_TOKENS = 1024;

export interface AskOrchestratorOptions extends AskAgentOptions {
  /** Teszt-szeam: a package-agent futtatója (a flow-lockos ág ÉS a route-tool is ezt hívja). */
  readonly runPackageAgent?: (
    question: string,
    options?: AskOptions,
  ) => Promise<AskResult>;
  /** Teszt-szeam: az info-agent (askAgent) futtatója a routeToInfoAgent tool mögött. */
  readonly runInfoAgent?: (
    question: string,
    options?: AskAgentOptions,
  ) => Promise<AskResult>;
}

export async function askOrchestrator(
  question: string,
  options: AskOrchestratorOptions = {},
): Promise<AskResult> {
  const trimmed = question.trim();
  if (trimmed === '') {
    throw new Error('Üres kérdést nem lehet feltenni.');
  }

  const role = options.role ?? CURRENT_ROLE;
  const history = options.history ?? [];

  // FLOW-LOCK RÖVIDZÁR: nyitott csomag-flow-nál nincs orchestrátor-hívás.
  if (findLastFlowSignal(history) === 'package-open') {
    const runPackage = options.runPackageAgent ?? askPackageAgent;
    return runPackage(trimmed, options);
  }

  return runAgentLoop(
    trimmed,
    {
      systemPrompt: ORCHESTRATOR_PROMPT,
      buildTools: (report): ToolSet => ({
        routeToPackageAgent: routeToPackageAgentTool(report, {
          question: trimmed,
          history,
          print: options.print,
          persistTrace: options.persistTrace,
          run: options.runPackageAgent,
        }),
        routeToInfoAgent: routeToInfoAgentTool(report, {
          question: trimmed,
          history,
          role,
          print: options.print,
          persistTrace: options.persistTrace,
          run: options.runInfoAgent,
        }),
      }),
      maxSteps: MAX_ORCHESTRATOR_STEPS,
      maxOutputTokens: MAX_TOKENS,
      toolChoice: 'required',
      emptyAnswer:
        'Nem sikerült eldönteni, hova irányítsam a kérdést. Pontosítsd, mire vagy kíváncsi: ' +
        'katalógus/gondozás, vagy egy növénycsomag összeállítása.',
    },
    { ...options, history: [] },
  );
}
