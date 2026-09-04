import { describe, expect, it, vi } from 'vitest';
import type { AskResult, Message } from '../../agents/agent-loop.js';
import type { ToolOutcome } from '../tool-outcome.js';
import {
  ROUTE_TO_PACKAGE_AGENT_TOOL_NAME,
  routeToPackageAgentTool,
} from './route-to-package-tool.js';

const packageResult = (answer: string): AskResult => ({
  answer,
  systemPrompt: '<role>package</role>',
  messages: [],
  usage: { inputTokens: 10, outputTokens: 20 },
  toolSteps: [],
  stopReason: 'stop',
});

const HISTORY: readonly Message[] = [{ role: 'user', content: 'előzmény' }];

const callTool = async (
  tool: ReturnType<typeof routeToPackageAgentTool>,
): Promise<string> => {
  const execute = tool.execute as unknown as (
    input: Record<string, never>,
    context: { toolCallId: string; messages: [] },
  ) => Promise<string>;
  return execute({}, { toolCallId: 'call_1', messages: [] });
};

describe('routeToPackageAgent', () => {
  it('a LEZÁRT (nem modell-adta) kérdést és history-t adja át a package-agentnek', async () => {
    const run = vi.fn().mockResolvedValue(packageResult('Íme egy javaslat.'));
    const tool = routeToPackageAgentTool(undefined, {
      question: 'Állíts össze egy csomagot',
      history: HISTORY,
      run,
      print: false,
      persistTrace: false,
    });

    const content = await callTool(tool);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('Állíts össze egy csomagot');
    expect(run.mock.calls[0]?.[1]).toMatchObject({ history: HISTORY });
    expect(content).toBe('Íme egy javaslat.');
  });

  it('a Trace-nek nem-hibás outcome-ot jelent', async () => {
    const reported: ToolOutcome[] = [];
    const tool = routeToPackageAgentTool(
      (_id, name, _input, outcome) => {
        expect(name).toBe(ROUTE_TO_PACKAGE_AGENT_TOOL_NAME);
        reported.push(outcome);
      },
      { question: 'kérdés', history: [], run: async () => packageResult('kész') },
    );

    await callTool(tool);

    expect(reported).toHaveLength(1);
    expect(reported[0]?.isError).toBe(false);
  });

  it('a beágyazott agent hibája NEM dönti le a hívó loopot', async () => {
    const tool = routeToPackageAgentTool(undefined, {
      question: 'kérdés',
      history: [],
      run: async () => {
        throw new Error('DATABASE_URL_PACKAGE hiányzik');
      },
    });

    const content = await callTool(tool);

    expect(content).toContain('DATABASE_URL_PACKAGE');
  });

  it('az onTextDelta/onStream mezőket is átadja a beágyazott futásnak', async () => {
    const run = vi.fn().mockResolvedValue(packageResult('kész'));
    const onTextDelta = vi.fn();
    const onStream = vi.fn();
    const tool = routeToPackageAgentTool(undefined, {
      question: 'kérdés',
      history: [],
      run,
      onTextDelta,
      onStream,
    });

    await callTool(tool);

    expect(run.mock.calls[0]?.[1]).toMatchObject({ onTextDelta, onStream });
  });
});
