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
// beágyazott agent-loopot futtat (ugyanaz az agent-mint-tool minta, mint a delegateToIngest).
//
// EGYETLEN kör (maxSteps: 1), NEM kettő: a toolChoice: 'required' MINDEN lépésen érvényes
// marad (az agent-loop nem térít el rajta lépésenként), tehát egy második kör a modellt ÚJRA
// tool-hívásra kényszerítené, sosem szövegre. A válasz ezért NEM a modell szövegéből jön,
// hanem magából a lefutott route-tool jelentéséből (result.toolSteps[].resultSummary — a
// tool ToolOutcome.content-je), ami úgyis szó szerint a route-olt agent válasza. Egy kör
// helyett kettő pluszban fizetne egy LLM-hívást azért, hogy a modell begépelje ugyanazt.
//
// onTextDelta/onStream: SZÁNDÉKOSAN nem megy az orchestrátor SAJÁT streamText-hívásának —
// az sosem generál szöveget (lásd fent), tehát a szerver csak egy üres "routeToInfoAgent"
// kártyát ÉS duplán a választ látná. Ehelyett a route-tool-oknak adjuk tovább, azok viszik be
// a BEÁGYAZOTT agent-futásba — onnan jön a valódi token-stream és a valódi tool-kártyák
// (tool-runSql, tool-searchKnowledge, stb.).
//
// A FLOW-LOCK a költség miatt kritikus: ha a history-ban a legutóbbi jelző-tool
// routeToPackageAgent (a package-flow tehát nyitva van), az orchestrátor LLM-hívása KI SEM
// MEGY — egyenesen a package-agentet hívjuk. Egy N-köríves csomag-építés így egyetlen plusz
// LLM-hívásba kerül (az elsőbe), nem N-be, és ez az ág a teljes options-t (onStream-mel
// együtt) egyből a package-agentnek adja — nincs orchestrátor-loop, nincs mit kivenni belőle.

export const MAX_ORCHESTRATOR_STEPS = 1;
const MAX_TOKENS = 1024;
const ROUTE_TOOL_NAMES: readonly string[] = ['routeToPackageAgent', 'routeToInfoAgent'];

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

  // A streaming-mezők a route-olt agent BEÁGYAZOTT futásához tartoznak, nem az orchestrátor
  // saját route-döntéséhez — lásd a fenti megjegyzést.
  const { onTextDelta, onStream, ...loopOptions } = options;

  const result = await runAgentLoop(
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
          onTextDelta,
          onStream,
        }),
        routeToInfoAgent: routeToInfoAgentTool(report, {
          question: trimmed,
          history,
          role,
          print: options.print,
          persistTrace: options.persistTrace,
          run: options.runInfoAgent,
          onTextDelta,
          onStream,
        }),
      }),
      maxSteps: MAX_ORCHESTRATOR_STEPS,
      maxOutputTokens: MAX_TOKENS,
      toolChoice: 'required',
      emptyAnswer:
        'Nem sikerült eldönteni, hova irányítsam a kérdést. Pontosítsd, mire vagy kíváncsi: ' +
        'katalógus/gondozás, vagy egy növénycsomag összeállítása.',
    },
    loopOptions,
  );

  // A válasz magából a route-tool jelentéséből jön (szó szerint), nem a modell szövegéből —
  // lásd a fenti megjegyzést. A route-tool SOSEM dob, tehát ha lefutott, van jelentése.
  const routeStep = result.toolSteps.find((step) => ROUTE_TOOL_NAMES.includes(step.toolName));
  return routeStep ? { ...result, answer: routeStep.resultSummary } : result;
}
