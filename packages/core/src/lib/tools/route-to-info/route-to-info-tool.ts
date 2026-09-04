import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { askAgent, type AskAgentOptions } from '../../agents/query-agent/query-agent.js';
import type { AskResult, Message } from '../../agents/agent-loop.js';
import type { UserRole } from '../../user-role/user-role.js';

// route-to-info-tool.ts — az ORCHESTRÁTOR másik toolja: átirányítja a beszélgetést a
// katalógus/tudásbázis/ügyfél-szakértő (info) agentnek — vagyis a MEGLÉVŐ askAgent-nek. A
// role-t TOVÁBBADJA a külső hívásból (az orchestrator-agent.ts zárja le): egy admin
// beszélgetés info-útja is megkapja a delegateToIngest-et, ahogy ma is, orchestrátor nélkül.
//
// onTextDelta/onStream: lásd route-to-package-tool.ts — ugyanaz az elv, a valódi streaming
// ebben a beágyazott futásban keletkezik, nem az orchestrátor saját loopjában.

export const ROUTE_TO_INFO_AGENT_TOOL_NAME = 'routeToInfoAgent';

export interface RouteToInfoAgentOptions {
  readonly question: string;
  readonly history: readonly Message[];
  readonly role: UserRole;
  readonly print?: boolean;
  readonly persistTrace?: boolean;
  readonly run?: (
    question: string,
    options?: AskAgentOptions,
  ) => Promise<AskResult>;
  readonly onTextDelta?: AskAgentOptions['onTextDelta'];
  readonly onStream?: AskAgentOptions['onStream'];
}

export const routeToInfoAgentTool = (
  report: ToolReporter | undefined,
  options: RouteToInfoAgentOptions,
): Tool<Record<string, never>, string> => {
  const run = options.run ?? askAgent;

  return tool({
    description:
      'Átirányítja a beszélgetést a katalógus/tudásbázis/ügyfél szakértő (info) agentnek: a ' +
      'felhasználó terméket, árat, gondozást vagy ügyfelet érintő kérdést tett fel, NEM ' +
      'csomagot épít. Nincs bemeneti paramétere.',
    inputSchema: z.object({}),
    execute: async (_input, { toolCallId }) => {
      try {
        const result = await run(options.question, {
          role: options.role,
          history: options.history,
          print: options.print,
          persistTrace: options.persistTrace,
          onTextDelta: options.onTextDelta,
          onStream: options.onStream,
        });
        const outcome: ToolOutcome = {
          content: result.answer,
          isError: false,
          summary: `info-agent · ${result.toolSteps.length} tool-lépés`,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ROUTE_TO_INFO_AGENT_TOOL_NAME, {}, outcome);
        return outcome.content;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const outcome: ToolOutcome = {
          content: `Az info-agent futása nem sikerült: ${message}`,
          isError: true,
          summary: null,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ROUTE_TO_INFO_AGENT_TOOL_NAME, {}, outcome);
        return outcome.content;
      }
    },
  });
};
