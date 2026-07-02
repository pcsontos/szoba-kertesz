import type Anthropic from '@anthropic-ai/sdk';
import type { Pool } from 'pg';
import { askAgent, MAX_TOOL_ITERATIONS } from './agent.js';
import type { LogEntryInput } from './logger.js';

const TEST_CONFIG = {
  anthropicApiKey: 'sk-ant-test',
  anthropicModel: 'claude-sonnet-4-6',
  databaseUrlReadonly: 'postgresql://ro:ro@localhost:5433/szoba-kertesz-test',
};

interface MockResponse {
  readonly id: string;
  readonly type: 'message';
  readonly role: 'assistant';
  readonly model: string;
  readonly content: ReadonlyArray<
    | { readonly type: 'text'; readonly text: string; readonly citations: null }
    | {
        readonly type: 'tool_use';
        readonly id: string;
        readonly name: string;
        readonly input: unknown;
        readonly caller: { readonly type: 'direct' };
      }
  >;
  readonly stop_reason: string;
  readonly stop_sequence: null;
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}

function textOnlyResponse(text: string): MockResponse {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [{ type: 'text', text, citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 20 },
  };
}

function toolUseResponse(
  toolUseId: string,
  query: string,
  toolName = 'runSql',
): MockResponse {
  return {
    id: 'msg_tool',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-6',
    content: [
      {
        type: 'tool_use',
        id: toolUseId,
        name: toolName,
        input: { query },
        caller: { type: 'direct' },
      },
    ],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: { input_tokens: 15, output_tokens: 25 },
  };
}

function createClient(...responses: readonly MockResponse[]): Anthropic {
  const create = vi.fn();
  for (const response of responses) {
    create.mockResolvedValueOnce(response);
  }
  return { messages: { create } } as unknown as Anthropic;
}

function createFakePool(rows: readonly Record<string, unknown>[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows, rowCount: rows.length }),
  } as unknown as Pool;
}

describe('askAgent', () => {
  it('answers directly (no tool call) when the model resolves on the first turn', async () => {
    const client = createClient(
      textOnlyResponse('Egy szobanövény fényigénye az eredeti élőhelyétől függ.'),
    );
    const log = vi.fn().mockResolvedValue(undefined);

    const result = await askAgent('Mitől függ egy növény fényigénye?', {
      client,
      config: TEST_CONFIG,
      log,
    });

    expect(client.messages.create).toHaveBeenCalledTimes(1);
    const call = (client.messages.create as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(call.model).toEqual('claude-sonnet-4-6');
    expect(call.max_tokens).toEqual(1024);
    expect(call.system).toMatch(/<schema>/);
    expect(call.tools).toEqual([
      expect.objectContaining({ name: 'runSql' }),
    ]);
    expect(call.messages).toEqual([
      { role: 'user', content: 'Mitől függ egy növény fényigénye?' },
    ]);

    expect(result.answer).toEqual(
      'Egy szobanövény fényigénye az eredeti élőhelyétől függ.',
    );
    expect(result.systemPrompt).toMatch(/<role>/);
    expect(result.toolSteps).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it('runs a multi-turn tool_use -> tool_result -> final-text exchange', async () => {
    const fakeRows = [
      { id: 1, name: 'Aloe vera', pet_safe: true },
      { id: 2, name: 'Zamioculcas', pet_safe: true },
    ];
    const client = createClient(
      toolUseResponse('toolu_1', 'SELECT id, name, pet_safe FROM products WHERE pet_safe = true'),
      textOnlyResponse('Íme 2 pet-safe növény: Aloe vera és Zamioculcas.'),
    );
    const dbPool = createFakePool(fakeRows);
    const log = vi.fn().mockResolvedValue(undefined);

    const result = await askAgent('Mutass pet-safe növényeket', {
      client,
      config: TEST_CONFIG,
      log,
      dbPool,
    });

    expect(client.messages.create).toHaveBeenCalledTimes(2);

    // A DB-nek a guard által becsomagolt (külső LIMIT-tel ellátott) SQL-t
    // kell látnia, nem a modell nyers query-jét.
    expect(dbPool.query).toHaveBeenCalledWith(
      'SELECT * FROM (\nSELECT id, name, pet_safe FROM products WHERE pet_safe = true\n) AS _q LIMIT 50',
    );

    const secondCall = (client.messages.create as ReturnType<typeof vi.fn>)
      .mock.calls[1]?.[0];
    expect(secondCall.messages).toEqual([
      { role: 'user', content: 'Mutass pet-safe növényeket' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'runSql',
            input: { query: 'SELECT id, name, pet_safe FROM products WHERE pet_safe = true' },
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: JSON.stringify(fakeRows),
            is_error: false,
          },
        ],
      },
    ]);

    expect(result.answer).toEqual(
      'Íme 2 pet-safe növény: Aloe vera és Zamioculcas.',
    );
    expect(result.toolSteps).toEqual([
      {
        toolName: 'runSql',
        input: { query: 'SELECT id, name, pet_safe FROM products WHERE pet_safe = true' },
        sql: 'SELECT * FROM (\nSELECT id, name, pet_safe FROM products WHERE pet_safe = true\n) AS _q LIMIT 50',
        ok: true,
        rowCount: 2,
        resultSummary: JSON.stringify(fakeRows),
      },
    ]);
    expect(result.usage).toEqual({ inputTokens: 25, outputTokens: 45 });

    expect(log).toHaveBeenCalledTimes(1);
    const loggedEntry = (log as ReturnType<typeof vi.fn<(entry: LogEntryInput) => Promise<void>>>)
      .mock.calls[0]?.[0] as LogEntryInput;
    expect(loggedEntry.toolSteps).toEqual(result.toolSteps);
    expect(loggedEntry.answer).toEqual(result.answer);
  });

  it('surfaces a guard-rejected write attempt as an error tool_result and lets the model recover', async () => {
    const client = createClient(
      toolUseResponse('toolu_evil', 'DELETE FROM products'),
      textOnlyResponse(
        'Sajnálom, nem törölhetek adatot — csak lekérdezésre van jogosultságom.',
      ),
    );
    const dbPool = createFakePool([]);

    const result = await askAgent('töröld az összes növényt', {
      client,
      config: TEST_CONFIG,
      log: vi.fn().mockResolvedValue(undefined),
      dbPool,
    });

    // A guard elutasítja MIELŐTT bármi eljutna a DB-hez.
    expect(dbPool.query).not.toHaveBeenCalled();
    expect(client.messages.create).toHaveBeenCalledTimes(2);

    const secondCall = (client.messages.create as ReturnType<typeof vi.fn>)
      .mock.calls[1]?.[0];
    const toolResultBlock = secondCall.messages[2].content[0];
    expect(toolResultBlock.type).toEqual('tool_result');
    expect(toolResultBlock.is_error).toBe(true);
    expect(toolResultBlock.content).toMatch(/SELECT/i);

    expect(result.toolSteps).toEqual([
      {
        toolName: 'runSql',
        input: { query: 'DELETE FROM products' },
        sql: 'DELETE FROM products',
        ok: false,
        rowCount: undefined,
        resultSummary: expect.stringMatching(/SELECT/i),
      },
    ]);
    expect(result.answer).toMatch(/Sajnálom/);
  });

  it('rejects an unknown tool name as an error tool_result without crashing', async () => {
    const client = createClient(
      toolUseResponse('toolu_x', '', 'deleteEverything'),
      textOnlyResponse('Ezt a tool-t nem ismerem.'),
    );

    const result = await askAgent('kérdés', {
      client,
      config: TEST_CONFIG,
      log: vi.fn().mockResolvedValue(undefined),
      dbPool: createFakePool([]),
    });

    expect(result.answer).toEqual('Ezt a tool-t nem ismerem.');
  });

  it('caps tool-use round-trips and fails with a clear error instead of looping forever', async () => {
    const create = vi
      .fn()
      .mockResolvedValue(toolUseResponse('toolu_loop', 'SELECT 1'));
    const client = { messages: { create } } as unknown as Anthropic;
    const dbPool = createFakePool([{ '?column?': 1 }]);
    const log = vi.fn().mockResolvedValue(undefined);

    await expect(
      askAgent('kérdés', { client, config: TEST_CONFIG, log, dbPool }),
    ).rejects.toThrow(/maximális iterációszámot/i);

    expect(create).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from the underlying SDK call without swallowing them', async () => {
    const client = {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('API hiba')),
      },
    } as unknown as Anthropic;

    await expect(
      askAgent('kérdés', {
        client,
        config: TEST_CONFIG,
        log: vi.fn().mockResolvedValue(undefined),
      }),
    ).rejects.toThrow('API hiba');
  });
});
