import { describe, expect, it, vi } from 'vitest';
import type { AskResult } from '../../agents/agent-loop.js';
import type { ToolOutcome } from '../tool-outcome.js';
import { ASK_INFO_AGENT_TOOL_NAME, askInfoAgentTool } from './ask-info-agent-tool.js';

const infoResult = (answer: string): AskResult => ({
  answer,
  systemPrompt: '<role>info</role>',
  messages: [],
  usage: { inputTokens: 10, outputTokens: 20 },
  toolSteps: [],
  stopReason: 'stop',
});

const callTool = async (
  tool: ReturnType<typeof askInfoAgentTool>,
  input: { question: string },
): Promise<string> => {
  const execute = tool.execute as unknown as (
    input: { question: string },
    context: { toolCallId: string; messages: [] },
  ) => Promise<string>;
  return execute(input, { toolCallId: 'call_1', messages: [] });
};

describe('askInfoAgent', () => {
  it('továbbadja a kérdést az info-agentnek MINDIG customer szerepben, és a válaszát adja vissza', async () => {
    const run = vi.fn().mockResolvedValue(infoResult('A Monstera közepes fényt szeret.'));
    const tool = askInfoAgentTool(undefined, { run, print: false, persistTrace: false });

    const content = await callTool(tool, { question: 'Mennyi fényt szeret a Monstera?' });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toBe('Mennyi fényt szeret a Monstera?');
    expect(run.mock.calls[0]?.[1]).toMatchObject({ role: 'customer' });
    expect(content).toContain('Monstera');
  });

  it('a Trace-nek nem-hibás outcome-ot jelent, SQL nélkül', async () => {
    const reported: ToolOutcome[] = [];
    const tool = askInfoAgentTool(
      (_id, name, _input, outcome) => {
        expect(name).toBe(ASK_INFO_AGENT_TOOL_NAME);
        reported.push(outcome);
      },
      { run: async () => infoResult('Kész.') },
    );

    await callTool(tool, { question: 'Van pozsgás 5000 alatt?' });

    expect(reported).toHaveLength(1);
    expect(reported[0]?.isError).toBe(false);
    expect(reported[0]?.sql).toBeNull();
  });

  it('a beágyazott agent hibája NEM dönti le a hívó loopot', async () => {
    const tool = askInfoAgentTool(undefined, {
      run: async () => {
        throw new Error('DATABASE_URL_READONLY hiányzik');
      },
    });

    const content = await callTool(tool, { question: 'kérdés' });

    expect(content).toContain('DATABASE_URL_READONLY');
  });

  it('üres kérdést meg sem próbál feltenni', async () => {
    const run = vi.fn();
    const tool = askInfoAgentTool(undefined, { run });

    const content = await callTool(tool, { question: '   ' });

    expect(run).not.toHaveBeenCalled();
    expect(content).toMatch(/üres/i);
  });

  it('injektált futtató nélkül a VALÓDI askAgent-et kötné be', () => {
    const tool = askInfoAgentTool();
    expect(typeof tool.execute).toBe('function');
  });
});
