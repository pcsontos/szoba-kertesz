import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { ToolOutcome, ToolReporter } from '../tool-outcome.js';
import { askAgent, type AskAgentOptions } from '../../agents/query-agent/query-agent.js';
import type { AskResult } from '../../agents/agent-loop.js';

// ask-info-agent-tool.ts — a package-agent SAJÁT toolja a katalógus/tudásbázis/ügyfél
// eléréséhez: a delegateToIngestTool mintáját követi (agent-mint-tool), de MINDIG
// role: 'customer'-ként hívja az askAgent-et, FÜGGETLENÜL a külső beszélgetés szerepétől —
// egy köztes info-lekérdezés sosem kaphatja meg a delegateToIngest képességet.

export const ASK_INFO_AGENT_TOOL_NAME = 'askInfoAgent';

export interface AskInfoAgentOptions {
  readonly print?: boolean;
  readonly persistTrace?: boolean;
  readonly run?: (
    question: string,
    options?: AskAgentOptions,
  ) => Promise<AskResult>;
}

export const askInfoAgentTool = (
  report?: ToolReporter,
  options: AskInfoAgentOptions = {},
): Tool<{ question: string }, string> => {
  const run = options.run ?? askAgent;

  return tool({
    description:
      'Kérdés a katalógus/tudásbázis/ügyfél-szakértő (info) agentnek — katalógus-tényekhez ' +
      '(ár, készlet, kategória), gondozási tudáshoz, vagy ügyfélprofilhoz. A question legyen ' +
      'önmagában értelmezhető: a másik agent NEM látja a csomag-építés eddigi menetét.',
    inputSchema: z.object({
      question: z.string().describe('Önmagában értelmezhető kérdés az info-agentnek.'),
    }),
    execute: async (input, { toolCallId }) => {
      const question = input.question.trim();
      if (question === '') {
        const outcome: ToolOutcome = {
          content: 'Üres kérdést nem lehet feltenni az info-agentnek.',
          isError: true,
          summary: null,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ASK_INFO_AGENT_TOOL_NAME, input, outcome);
        return outcome.content;
      }
      try {
        const result = await run(question, {
          role: 'customer',
          print: options.print,
          persistTrace: options.persistTrace,
        });
        const outcome: ToolOutcome = {
          content: result.answer,
          isError: false,
          summary: `info-agent · ${result.toolSteps.length} tool-lépés`,
          sql: null,
          rowCount: null,
        };
        report?.(toolCallId, ASK_INFO_AGENT_TOOL_NAME, input, outcome);
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
        report?.(toolCallId, ASK_INFO_AGENT_TOOL_NAME, input, outcome);
        return outcome.content;
      }
    },
  });
};
