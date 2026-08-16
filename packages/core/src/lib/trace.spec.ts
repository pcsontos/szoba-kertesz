import { describe, expect, it, vi } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Trace, setWatchLog, traceLog } from './trace.js';

// AI SDK 7 alakok: a Trace az `onStepEnd` lezárt köreit és a `prepareStep`
// kimenő üzeneteit kapja, nem az Anthropic SDK válasz-objektumát.
const modelStep = (text: string, finishReason: string) => ({
  finishReason,
  text,
  toolCalls: [] as { toolName: string; input: unknown }[],
  usage: { inputTokens: 10, outputTokens: 5 },
});

const toolCall = (query: string) => ({ toolName: 'runSql', input: { query } });

describe('Trace', () => {
  it('körről körre rögzíti a kontextus növekedését', () => {
    const t = new Trace({
      question: 'q',
      model: 'm',
      systemPrompt: 's',
      print: false,
    });

    t.request(1, {
      model: 'm',
      maxOutputTokens: 1024,
      system: 's',
      toolNames: [],
      messages: [{ role: 'user', content: 'q' }],
    });
    const turn1 = t.modelTurn(1, modelStep('', 'tool-calls'));
    t.toolStep(turn1, toolCall('SELECT 1'), {
      isError: false,
      summary: 'SELECT 1 LIMIT 50',
      rowCount: 1,
      content: '[{"x":1}]',
    });

    t.request(2, {
      model: 'm',
      maxOutputTokens: 1024,
      system: 's',
      toolNames: [],
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: [] },
        { role: 'user', content: [] },
      ],
    });
    t.modelTurn(2, modelStep('kész', 'stop'));

    const data = t.toJSON('kész', { inputTokens: 20, outputTokens: 10 });

    expect(data.turns).toHaveLength(2);
    // Ez a lecke lényege: a messages tömb körről körre nő.
    expect(data.turns[0]?.context.messages).toBe(1);
    expect(data.turns[1]?.context.messages).toBe(3);
    expect(data.turns[0]?.toolCalls[0]?.guardedSql).toBe('SELECT 1 LIMIT 50');
    expect(data.answer).toBe('kész');
  });

  it('a hibás tool-kimenetet isError-ként rögzíti', () => {
    const t = new Trace({
      question: 'q',
      model: 'm',
      systemPrompt: 's',
      print: false,
    });
    const turn = t.modelTurn(1, modelStep('', 'tool-calls'));

    t.toolStep(turn, toolCall('DROP TABLE products'), {
      isError: true,
      summary: null,
      rowCount: null,
      content: 'Csak SELECT futtatható.',
    });

    const data = t.toJSON('', { inputTokens: 1, outputTokens: 1 });
    expect(data.turns[0]?.toolCalls[0]?.isError).toBe(true);
    expect(data.turns[0]?.toolCalls[0]?.result).toBe('Csak SELECT futtatható.');
    expect(data.turns[0]?.toolCalls[0]?.guardedSql).toBeNull();
  });

  it('print: false esetén nem ír a konzolra', () => {
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    new Trace({
      question: 'q',
      model: 'm',
      systemPrompt: 's',
      print: false,
    });

    const called = writeSpy.mock.calls.length;
    writeSpy.mockRestore();
    expect(called).toBe(0);
  });

  it('a watch-logba akkor is ír, ha print: false', () => {
    const file = join(tmpdir(), `szobakertesz-watch-${process.pid}.log`);
    try {
      setWatchLog(file);
      const t = new Trace({
        question: 'q',
        model: 'm',
        systemPrompt: 's',
        print: false,
      });
      t.request(1, {
        model: 'm',
        maxOutputTokens: 1024,
        system: 's',
        toolNames: [],
        messages: [{ role: 'user', content: 'q' }],
      });

      const content = readFileSync(file, 'utf8');
      expect(content).toContain('HÍVÁS #1');
      expect(content).toContain('[user]');
    } finally {
      setWatchLog(null);
      rmSync(file, { force: true });
    }
  });

  it('a traceLog saját sort ír a watch-logba', () => {
    const file = join(tmpdir(), `szobakertesz-tracelog-${process.pid}.log`);
    const writeSpy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    try {
      setWatchLog(file);
      traceLog('saját log üzenet');
      expect(readFileSync(file, 'utf8')).toContain('saját log üzenet');
    } finally {
      setWatchLog(null);
      writeSpy.mockRestore();
      rmSync(file, { force: true });
    }
  });
});
