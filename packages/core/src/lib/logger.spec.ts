import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getSessionLogFilePath, logInteraction } from './logger.js';

describe('logInteraction', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'szoba-kertesz-logger-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('creates the target directory and writes one JSON line per call', async () => {
    const filePath = join(tempDir, 'nested', 'session.jsonl');

    await logInteraction(
      {
        systemPrompt: 'system prompt szövege',
        messages: [{ role: 'user', content: 'mitől függ a fényigény?' }],
        answer: 'A fényigény a növény eredeti élőhelyétől függ.',
        usage: { inputTokens: 12, outputTokens: 34 },
        toolSteps: [],
      },
      filePath,
    );

    const content = await readFile(filePath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(1);

    const entry = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(entry).toMatchObject({
      systemPrompt: 'system prompt szövege',
      messages: [{ role: 'user', content: 'mitől függ a fényigény?' }],
      answer: 'A fényigény a növény eredeti élőhelyétől függ.',
      usage: { inputTokens: 12, outputTokens: 34 },
      toolSteps: [],
    });
    expect(typeof entry.timestamp).toBe('string');
  });

  it('appends multiple interactions as separate JSONL lines to the same file', async () => {
    const filePath = join(tempDir, 'session.jsonl');

    await logInteraction(
      {
        systemPrompt: 'sp',
        messages: [{ role: 'user', content: 'első kérdés' }],
        answer: 'első válasz',
        usage: { inputTokens: 1, outputTokens: 2 },
        toolSteps: [],
      },
      filePath,
    );
    await logInteraction(
      {
        systemPrompt: 'sp',
        messages: [{ role: 'user', content: 'második kérdés' }],
        answer: 'második válasz',
        usage: { inputTokens: 3, outputTokens: 4 },
        toolSteps: [],
      },
      filePath,
    );

    const content = await readFile(filePath, 'utf8');
    const lines = content.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0])).toMatchObject({ answer: 'első válasz' });
    expect(JSON.parse(lines[1])).toMatchObject({ answer: 'második válasz' });
  });

  it('logs generated SQL and the tool-step outcome (B3.6)', async () => {
    const filePath = join(tempDir, 'session-with-tools.jsonl');

    await logInteraction(
      {
        systemPrompt: 'sp',
        messages: [
          { role: 'user', content: 'mutass 3 pet-safe növényt' },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'toolu_1',
                name: 'runSql',
                input: { query: 'SELECT * FROM products WHERE pet_safe' },
              },
            ],
          },
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_1',
                content: '[{"id":1,"name":"Pozsgás"}]',
              },
            ],
          },
        ],
        answer: 'Íme 3 pet-safe növény.',
        usage: { inputTokens: 5, outputTokens: 6 },
        toolSteps: [
          {
            toolName: 'runSql',
            input: { query: 'SELECT * FROM products WHERE pet_safe' },
            sql: 'SELECT * FROM products WHERE pet_safe LIMIT 50',
            ok: true,
            rowCount: 1,
            resultSummary: '[{"id":1,"name":"Pozsgás"}]',
          },
        ],
      },
      filePath,
    );

    const content = await readFile(filePath, 'utf8');
    const entry = JSON.parse(content.trim()) as Record<string, unknown>;
    expect(entry.toolSteps).toEqual([
      {
        toolName: 'runSql',
        input: { query: 'SELECT * FROM products WHERE pet_safe' },
        sql: 'SELECT * FROM products WHERE pet_safe LIMIT 50',
        ok: true,
        rowCount: 1,
        resultSummary: '[{"id":1,"name":"Pozsgás"}]',
      },
    ]);
  });
});

describe('getSessionLogFilePath', () => {
  it('returns a logs/<timestamp>.jsonl path relative to process.cwd(), memoized within the process', () => {
    const first = getSessionLogFilePath();
    const second = getSessionLogFilePath();

    expect(first).toEqual(second);
    expect(first.endsWith('.jsonl')).toBe(true);
    expect(first).toContain(`${join('logs', '')}`.slice(0, -1));
    expect(first.startsWith(process.cwd())).toBe(true);
  });
});
