import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { askOrchestrator } from './orchestrator-agent.js';
import type { AskResult, Message } from '../agent-loop.js';

const TEST_CONFIG = {
  anthropicApiKey: 'sk-ant-test',
  anthropicModel: 'claude-sonnet-4-6',
  databaseUrlReadonly: 'postgresql://ro:ro@localhost:5433/szoba-kertesz-test',
};

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
  totalTokens: input + output,
});

const streamOf = (chunks: readonly unknown[]) =>
  simulateReadableStream({ chunks: chunks as never, initialDelayInMs: 0, chunkDelayInMs: 0 });

const textStepChunks = (text: string) => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: text },
  { type: 'text-end', id: 't1' },
  { type: 'finish', finishReason: { unified: 'stop' }, usage: usage(10, 20) },
];

const toolStepChunks = (toolCallId: string, toolName: string) => [
  { type: 'stream-start', warnings: [] },
  { type: 'tool-call', toolCallId, toolName, input: '{}' },
  { type: 'finish', finishReason: { unified: 'tool-calls' }, usage: usage(15, 25) },
];

function mockModel(...steps: readonly (readonly unknown[])[]) {
  let index = 0;
  const doStream = vi.fn(async () => ({
    stream: streamOf(steps[Math.min(index++, steps.length - 1)] ?? []),
  }));
  return { model: new MockLanguageModelV4({ doStream: doStream as never }), doStream };
}

const fakeResult = (answer: string): AskResult => ({
  answer,
  systemPrompt: '<role>x</role>',
  messages: [],
  usage: { inputTokens: 1, outputTokens: 1 },
  toolSteps: [],
  stopReason: 'stop',
});

const baseDeps = { config: TEST_CONFIG, print: false, persistTrace: false, log: async () => undefined };

describe('askOrchestrator — route-olás', () => {
  it('routeToPackageAgent hívásakor a package-agent futtatóját hívja, és a válaszát adja vissza', async () => {
    const { model } = mockModel(
      toolStepChunks('c1', 'routeToPackageAgent'),
      textStepChunks('Íme egy javaslat.'),
    );
    const runPackageAgent = vi.fn().mockResolvedValue(fakeResult('Íme egy javaslat.'));

    const result = await askOrchestrator('Állíts össze egy csomagot', {
      ...baseDeps,
      model,
      runPackageAgent,
    });

    expect(runPackageAgent).toHaveBeenCalledTimes(1);
    expect(runPackageAgent.mock.calls[0]?.[0]).toBe('Állíts össze egy csomagot');
    expect(result.answer).toBe('Íme egy javaslat.');
  });

  it('routeToInfoAgent hívásakor az info-agent futtatóját hívja, és a válaszát adja vissza', async () => {
    const { model } = mockModel(
      toolStepChunks('c1', 'routeToInfoAgent'),
      textStepChunks('3 pozsgás van.'),
    );
    const runInfoAgent = vi.fn().mockResolvedValue(fakeResult('3 pozsgás van.'));

    const result = await askOrchestrator('Hány pozsgás van?', {
      ...baseDeps,
      model,
      runInfoAgent,
    });

    expect(runInfoAgent).toHaveBeenCalledTimes(1);
    expect(runInfoAgent.mock.calls[0]?.[0]).toBe('Hány pozsgás van?');
    expect(result.answer).toBe('3 pozsgás van.');
  });

  it('mindkét route-tool fel van kínálva a modellnek, kényszerített választással', async () => {
    let offered: string[] = [];
    let toolChoice: unknown;
    const model = new MockLanguageModelV4({
      doStream: (async (options: { tools?: { name: string }[]; toolChoice?: unknown }) => {
        offered = (options.tools ?? []).map((tool) => tool.name);
        toolChoice = options.toolChoice;
        return { stream: streamOf(toolStepChunks('c1', 'routeToInfoAgent')) };
      }) as never,
    });

    await askOrchestrator('kérdés', {
      ...baseDeps,
      model,
      runInfoAgent: async () => fakeResult('kész'),
    });

    expect(offered).toEqual(['routeToPackageAgent', 'routeToInfoAgent']);
    expect(toolChoice).toEqual({ type: 'required' });
  });
});

describe('askOrchestrator — flow-lock rövidzár', () => {
  it('nyitott csomag-flow-nál NEM hívja az orchestrátor-modellt, egyenesen a package-agentet hívja', async () => {
    const doStream = vi.fn();
    const model = new MockLanguageModelV4({ doStream: doStream as never });
    const runPackageAgent = vi.fn().mockResolvedValue(fakeResult('Folytatom a csomagot.'));
    const openFlowHistory: readonly Message[] = [
      { role: 'user', content: 'csomagot kérek' },
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'routeToPackageAgent', input: {} }],
      },
    ];

    const result = await askOrchestrator('még egy pozsgást is', {
      ...baseDeps,
      model,
      history: openFlowHistory,
      runPackageAgent,
    });

    expect(doStream).not.toHaveBeenCalled();
    expect(runPackageAgent).toHaveBeenCalledTimes(1);
    expect(runPackageAgent.mock.calls[0]?.[0]).toBe('még egy pozsgást is');
    expect(result.answer).toBe('Folytatom a csomagot.');
  });

  it('lezárt flow-nál (savePackage után) IGENIS az orchestrátor-modellt hívja', async () => {
    const { model } = mockModel(
      toolStepChunks('c1', 'routeToInfoAgent'),
      textStepChunks('kész'),
    );
    const closedFlowHistory: readonly Message[] = [
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'savePackage', input: {} }],
      },
    ];

    const result = await askOrchestrator('másik kérdés', {
      ...baseDeps,
      model,
      history: closedFlowHistory,
      runInfoAgent: async () => fakeResult('kész'),
    });

    expect(result.answer).toBe('kész');
  });
});
