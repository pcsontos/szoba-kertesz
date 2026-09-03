import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { askPackageAgent } from './package-agent.js';

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

const textStepChunks = (text: string) => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: text },
  { type: 'text-end', id: 't1' },
  { type: 'finish', finishReason: { unified: 'stop' }, usage: usage(10, 20) },
];

function toolNameProbe() {
  const seen: string[] = [];
  const model = new MockLanguageModelV4({
    doStream: (async (options: { tools?: { name: string }[] }) => {
      seen.push(...(options.tools ?? []).map((tool) => tool.name));
      return {
        stream: simulateReadableStream({
          chunks: textStepChunks('kész') as never,
          initialDelayInMs: 0,
          chunkDelayInMs: 0,
        }),
      };
    }) as never,
  });
  return { model, seen };
}

describe('askPackageAgent — toolkészlet', () => {
  it('a NÉGY tool megy ki: askInfoAgent, validatePackage, savePackage, cancelPackage', async () => {
    const { model, seen } = toolNameProbe();

    await askPackageAgent('Állíts össze egy csomagot', {
      config: TEST_CONFIG,
      model,
      print: false,
      persistTrace: false,
      log: async () => undefined,
    });

    expect(seen).toEqual([
      'askInfoAgent',
      'validatePackage',
      'savePackage',
      'cancelPackage',
    ]);
  });

  it('a system prompt tartalmazza a megerősítés-kényszert', async () => {
    const { model } = toolNameProbe();

    const result = await askPackageAgent('kérdés', {
      config: TEST_CONFIG,
      model,
      print: false,
      persistTrace: false,
      log: async () => undefined,
    });

    expect(result.systemPrompt).toContain('EXPLICIT MEGERŐSÍTÉST');
    expect(result.systemPrompt).toContain('SOSEM hívd a savePackage-et');
  });

  it('üres kérdést nem fogad el', async () => {
    await expect(
      askPackageAgent('   ', { config: TEST_CONFIG, print: false, persistTrace: false }),
    ).rejects.toThrow(/üres/i);
  });
});
