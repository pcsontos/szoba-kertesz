import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { askIngestAgent } from './ingest-agent.js';

/**
 * Az ÍRÓ agent toolkészletének pinningje (a 04. PR-review #5 tétele). Ennek az
 * agentnek van írási joga — pont itt a legfontosabb, hogy pontosan tudjuk, mi
 * van a kezében. A listCategories SZÁNDÉKOSAN nincs köztük.
 */

const TEST_CONFIG = {
  anthropicApiKey: 'sk-ant-test',
  anthropicModel: 'claude-sonnet-4-6',
  databaseUrlReadonly: 'postgresql://ro:ro@localhost:5433/szoba-kertesz-test',
  databaseUrlReadWrite: 'postgresql://rw:rw@localhost:5433/szoba-kertesz-test',
};

describe('askIngestAgent — toolkészlet', () => {
  it('pontosan runSql + fetchFeed + upsertProduct megy ki', async () => {
    const seen: string[] = [];
    const model = new MockLanguageModelV4({
      // A loop 05-től streamText-tel fut, tehát a mock a doStream oldalt adja.
      doStream: (async (options: { tools?: { name: string }[] }) => {
        seen.push(...(options.tools ?? []).map((tool) => tool.name));
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start', warnings: [] },
              { type: 'text-start', id: 't1' },
              { type: 'text-delta', id: 't1', delta: 'kész' },
              { type: 'text-end', id: 't1' },
              {
                type: 'finish',
                finishReason: { unified: 'stop' },
                usage: {
                  inputTokens: {
                    total: 10,
                    noCache: 10,
                    cacheRead: 0,
                    cacheWrite: 0,
                  },
                  outputTokens: { total: 20, text: 20, reasoning: 0 },
                  totalTokens: 30,
                },
              },
            ] as never,
            initialDelayInMs: 0,
            chunkDelayInMs: 0,
          }),
        };
      }) as never,
    });

    await askIngestAgent('utasítás', {
      config: TEST_CONFIG,
      print: false,
      persistTrace: false,
      model,
      log: async () => undefined,
    });

    expect(seen).toEqual(['runSql', 'fetchFeed', 'upsertProduct']);
    // Az író agent NEM kap delegálási jogot: nincs kör-körbe delegálás.
    expect(seen).not.toContain('delegateToIngest');
  });
});
