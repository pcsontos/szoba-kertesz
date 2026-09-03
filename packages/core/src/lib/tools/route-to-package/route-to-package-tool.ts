import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { askPackageAgent } from '../../agents/package-agent/package-agent.js';
import type { AskOptions, AskResult, Message } from '../../agents/agent-loop.js';

// route-to-package-tool.ts — az ORCHESTRÁTOR toolja: átirányítja a beszélgetést a
// package-agentnek. A delegateToIngestTool mintáját követi (agent-mint-tool), de a bemeneti
// sémája ÜRES: a question/history nem a MODELLTŐL jön (mint delegateToIngest instruction
// mezője), hanem az orchestrator-agent.ts zárja le a factory-hívásban — így a package-agent
// a TELJES, hiteles beszélgetést kapja, nem egy a modell által újrafogalmazott rövidítést.

export const ROUTE_TO_PACKAGE_AGENT_TOOL_NAME = 'routeToPackageAgent';

export interface RouteToPackageAgentOptions {
  readonly question: string;
  readonly history: readonly Message[];
  readonly print?: boolean;
  readonly persistTrace?: boolean;
  readonly run?: (question: string, options?: AskOptions) => Promise<AskResult>;
}

export const routeToPackageAgentTool = (
  report: ToolReporter | undefined,
  options: RouteToPackageAgentOptions,
): Tool<Record<string, never>, string> => {
  const run = options.run ?? askPackageAgent;

  return tool({
    description:
      'Átirányítja a beszélgetést a csomag-építő (package) agentnek: a felhasználó egy ' +
      'növénycsomagot szeretne összeállítani (szoba, büdzsé, igények alapján) — akár most ' +
      'kezdi, akár folytatja. Nincs bemeneti paramétere.',
    inputSchema: z.object({}),
    execute: async (_input, { toolCallId }) => {
      try {
        const result = await run(options.question, {
          history: options.history,
          print: options.print,
          persistTrace: options.persistTrace,
        });
        const outcome: ToolOutcome = {
          content: result.answer,
          isError: false,
          summary: `package-agent · ${result.toolSteps.length} tool-lépés`,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ROUTE_TO_PACKAGE_AGENT_TOOL_NAME, {}, outcome);
        return outcome.content;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const outcome: ToolOutcome = {
          content: `A csomag-építő agent futása nem sikerült: ${message}`,
          isError: true,
          summary: null,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ROUTE_TO_PACKAGE_AGENT_TOOL_NAME, {}, outcome);
        return outcome.content;
      }
    },
  });
};
