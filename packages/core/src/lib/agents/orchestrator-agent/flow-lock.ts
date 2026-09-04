import type { Message } from '../agent-loop.js';

// flow-lock.ts — TISZTA függvény: a beszélgetés-history tool-hívásaiból olvassa ki, nyitva
// van-e egy csomag-flow. Ha igen, az orchestrator-agent.ts KI SEM HÍVJA az orchestrátor
// LLM-jét — egyenesen a package-agentet hívja. Ez a rövidzár tartja alacsonyan a költséget
// egy többköríves csomag-építésnél (docs/roi.md mért-költség kultúrája).

const FLOW_SIGNAL_TOOLS = ['routeToPackageAgent', 'savePackage', 'cancelPackage'] as const;
type FlowSignalTool = (typeof FLOW_SIGNAL_TOOLS)[number];

export type FlowLockState = 'package-open' | 'none';

function isFlowSignalTool(toolName: string): toolName is FlowSignalTool {
  return (FLOW_SIGNAL_TOOLS as readonly string[]).includes(toolName);
}

/**
 * A history-ban időrendben a LEGUTOLSÓ jelző-tool dönt: routeToPackageAgent → nyitva,
 * savePackage/cancelPackage → zárva, egyik sincs → zárva (alapállapot).
 */
export function findLastFlowSignal(history: readonly Message[]): FlowLockState {
  let last: FlowSignalTool | undefined;

  for (const message of history) {
    if (message.role !== 'assistant' || typeof message.content === 'string') {
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'tool-call' && isFlowSignalTool(part.toolName)) {
        last = part.toolName;
      }
    }
  }

  return last === 'routeToPackageAgent' ? 'package-open' : 'none';
}
