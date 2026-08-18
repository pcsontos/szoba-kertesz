import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { askAgent } from './query-agent.js';

/**
 * A toolkészlet PINNINGJE. Ez a teszt nem viselkedést mér, hanem szerződést
 * rögzít: MELYIK szerep MIT kap a kezébe. A képesség-kapcsolás lényege, hogy a
 * tool vásárlónál NINCS OTT — nem "le van tiltva". Ha egy későbbi refaktor
 * feltétel nélkül szúrná be a delegateToIngest-et, ez a teszt fogja el.
 *
 * (A 04. alkalom PR-review #5 tétele: a toolkészleteket semmi nem pinnelte.)
 */

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

/** Egyetlen szöveges kör STREAM-darabjai (a loop 05-től streamText-tel fut). */
const textStepChunks = (text: string) => [
  { type: 'stream-start', warnings: [] },
  { type: 'text-start', id: 't1' },
  { type: 'text-delta', id: 't1', delta: text },
  { type: 'text-end', id: 't1' },
  { type: 'finish', finishReason: { unified: 'stop' }, usage: usage(10, 20) },
];

/** Egy körben szöveggel válaszoló mock, ami elteszi a felkínált toolneveket. */
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

const baseDeps = {
  config: TEST_CONFIG,
  print: false,
  persistTrace: false,
  log: async () => undefined,
};

describe('askAgent — szerep szerinti toolkészlet', () => {
  it('vásárlóként HÁROM tool megy ki, delegateToIngest NÉLKÜL', async () => {
    const { model, seen } = toolNameProbe();

    await askAgent('kérdés', { ...baseDeps, model, role: 'customer' });

    expect(seen).toEqual(['runSql', 'listCategories', 'getClientPreferences']);
  });

  it('adminként NÉGY tool megy ki, a delegateToIngest-tel', async () => {
    const { model, seen } = toolNameProbe();

    await askAgent('kérdés', { ...baseDeps, model, role: 'admin' });

    expect(seen).toEqual([
      'runSql',
      'listCategories',
      'getClientPreferences',
      'delegateToIngest',
    ]);
  });

  it('szerep nélkül az alapértelmezés a vásárló (CURRENT_ROLE)', async () => {
    const { model, seen } = toolNameProbe();

    await askAgent('kérdés', { ...baseDeps, model });

    expect(seen).not.toContain('delegateToIngest');
  });
});
