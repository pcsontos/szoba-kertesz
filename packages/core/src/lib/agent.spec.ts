import type Anthropic from '@anthropic-ai/sdk';
import { askAgent } from './agent.js';
import type { LogEntryInput } from './logger.js';

const TEST_CONFIG = {
  anthropicApiKey: 'sk-ant-test',
  anthropicModel: 'claude-sonnet-4-6',
};

function createMockClient(responseText: string): Anthropic {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-6',
        content: [{ type: 'text', text: responseText, citations: null }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 20 },
      }),
    },
  } as unknown as Anthropic;
}

describe('askAgent', () => {
  it('sends a single messages.create call with the no-tool system prompt and the question', async () => {
    const client = createMockClient(
      'Egy szobanövény fényigénye az eredeti élőhelyétől függ.',
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
    expect(call.system).toMatch(/<constraint>/);
    expect(call.messages).toEqual([
      { role: 'user', content: 'Mitől függ egy növény fényigénye?' },
    ]);

    expect(result.answer).toEqual(
      'Egy szobanövény fényigénye az eredeti élőhelyétől függ.',
    );
    expect(result.systemPrompt).toMatch(/<role>/);
    expect(result.messages).toEqual([
      { role: 'user', content: 'Mitől függ egy növény fényigénye?' },
    ]);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
  });

  it('joins multiple text content blocks into a single trimmed answer', async () => {
    const client = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            { type: 'text', text: '  Első rész.', citations: null },
            { type: 'text', text: 'Második rész.  ', citations: null },
          ],
          usage: { input_tokens: 5, output_tokens: 6 },
        }),
      },
    } as unknown as Anthropic;

    const result = await askAgent('kérdés', {
      client,
      config: TEST_CONFIG,
      log: vi.fn().mockResolvedValue(undefined),
    });

    expect(result.answer).toEqual('Első rész.\nMásodik rész.');
  });

  it('logs the interaction with the system prompt, messages, answer and usage', async () => {
    const client = createMockClient('válasz');
    const log = vi
      .fn<(entry: LogEntryInput) => Promise<void>>()
      .mockResolvedValue(undefined);

    await askAgent('kérdés', {
      client,
      config: TEST_CONFIG,
      log,
    });

    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({
      systemPrompt: expect.stringContaining('<role>'),
      messages: [{ role: 'user', content: 'kérdés' }],
      answer: 'válasz',
      usage: { inputTokens: 10, outputTokens: 20 },
    });
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
