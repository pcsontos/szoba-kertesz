import { describe, expect, it, vi } from 'vitest';
import type { AskResult, Message } from '../../agents/agent-loop.js';
import type { ToolOutcome } from '../tool-outcome.js';
import {
  ROUTE_TO_INFO_AGENT_TOOL_NAME,
  routeToInfoAgentTool,
} from './route-to-info-tool.js';

const infoResult = (answer: string): AskResult => ({
  answer,
  systemPrompt: '<role>info</role>',
  messages: [],
  usage: { inputTokens: 10, outputTokens: 20 },
  toolSteps: [],
  stopReason: 'stop',
});

const HISTORY: readonly Message[] = [{ role: 'user', content: 'előzmény' }];

const callTool = async (
  tool: ReturnType<typeof routeToInfoAgentTool>,
): Promise<string> => {
  const execute = tool.execute as unknown as (
    input: Record<string, never>,
    context: { toolCallId: string; messages: [] },
  ) => Promise<string>;
  return execute({}, { toolCallId: 'call_1', messages: [] });
};

describe('routeToInfoAgent', () => {
  it('a lezárt kérdést, history-t ÉS a külső szerepet adja át az info-agentnek', async () => {
    const run = vi.fn().mockResolvedValue(infoResult('3 pozsgás van 5000 alatt.'));
    const tool = routeToInfoAgentTool(undefined, {
      question: 'Hány pozsgás van 5000 alatt?',
      history: HISTORY,
      role: 'admin',
      run,
      print: false,
      persistTrace: false,
    });

    const content = await callTool(tool);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('Hány pozsgás van 5000 alatt?');
    expect(run.mock.calls[0]?.[1]).toMatchObject({ history: HISTORY, role: 'admin' });
    expect(content).toBe('3 pozsgás van 5000 alatt.');
  });

  it('a Trace-nek nem-hibás outcome-ot jelent', async () => {
    const reported: ToolOutcome[] = [];
    const tool = routeToInfoAgentTool(
      (_id, name, _input, outcome) => {
        expect(name).toBe(ROUTE_TO_INFO_AGENT_TOOL_NAME);
        reported.push(outcome);
      },
      { question: 'kérdés', history: [], role: 'customer', run: async () => infoResult('kész') },
    );

    await callTool(tool);

    expect(reported).toHaveLength(1);
    expect(reported[0]?.isError).toBe(false);
  });

  it('az onTextDelta/onStream mezőket is átadja a beágyazott futásnak', async () => {
    const run = vi.fn().mockResolvedValue(infoResult('kész'));
    const onTextDelta = vi.fn();
    const onStream = vi.fn();
    const tool = routeToInfoAgentTool(undefined, {
      question: 'kérdés',
      history: [],
      role: 'customer',
      run,
      onTextDelta,
      onStream,
    });

    await callTool(tool);

    expect(run.mock.calls[0]?.[1]).toMatchObject({ onTextDelta, onStream });
  });
});
