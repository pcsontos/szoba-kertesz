import { describe, expect, it, vi } from 'vitest';
import type { AskResult } from '../../agents/agent-loop.js';
import type { ToolOutcome } from '../tool-outcome.js';
import {
  DELEGATE_TO_INGEST_TOOL_NAME,
  delegateToIngestTool,
} from './delegate-to-ingest-tool.js';

const ingestResult = (answer: string): AskResult => ({
  answer,
  systemPrompt: '<role>ingest</role>',
  messages: [],
  usage: { inputTokens: 10, outputTokens: 20 },
  toolSteps: [
    {
      toolName: 'upsertProduct',
      input: {},
      ok: true,
      resultSummary: 'UPSERT products (created)',
    },
  ],
  stopReason: 'stop',
});

/** A tool `execute`-ja az AI SDK-tól kap egy második, kontextus-paramétert. */
const callTool = async (
  tool: ReturnType<typeof delegateToIngestTool>,
  input: { instruction: string },
): Promise<string> => {
  // A `Tool.execute` típusa opcionális és szélesebb (`ToolExecuteFunction<…, any>`),
  // ezért a szűkítés csak `unknown`-on át megy át a fordítón (TS2352).
  const execute = tool.execute as unknown as (
    input: { instruction: string },
    context: { toolCallId: string; messages: [] },
  ) => Promise<string>;
  return execute(input, { toolCallId: 'call_1', messages: [] });
};

describe('delegateToIngest', () => {
  it('továbbadja az utasítást az ingest-agentnek, és a válaszát adja vissza a modellnek', async () => {
    const run = vi
      .fn()
      .mockResolvedValue(
        ingestResult('Felvettem a Monstera Deliciosa Variegatát.'),
      );
    const tool = delegateToIngestTool(undefined, {
      run,
      print: false,
      persistTrace: false,
    });

    const content = await callTool(tool, {
      instruction: 'Vedd fel a katalógusba a Monstera Deliciosa Variegatát',
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0]?.[0]).toContain('Monstera Deliciosa Variegatá');
    // A print/persistTrace átmegy a beágyazott futásba — a Trace ne írjon
    // artifactot tesztben, és ne ugorjon be a színes nyom.
    expect(run.mock.calls[0]?.[1]).toMatchObject({
      print: false,
      persistTrace: false,
    });
    expect(content).toContain('Felvettem');
  });

  it('a Trace-nek nem-hibás outcome-ot jelent, SQL nélkül', async () => {
    const reported: ToolOutcome[] = [];
    const tool = delegateToIngestTool(
      (_id, name, _input, outcome) => {
        expect(name).toBe(DELEGATE_TO_INGEST_TOOL_NAME);
        reported.push(outcome);
      },
      { run: async () => ingestResult('Kész.') },
    );

    await callTool(tool, { instruction: 'Frissítsd az árakat a feedből' });

    expect(reported).toHaveLength(1);
    expect(reported[0]?.isError).toBe(false);
    // A ToolOutcome.sql szerződése: CSAK ténylegesen lefuttatott lekérdezés.
    // A delegálás nem az — a belső agent SQL-je a SAJÁT naplósorába megy.
    expect(reported[0]?.sql).toBeNull();
    expect(reported[0]?.summary).toContain('ingest');
  });

  it('a beágyazott agent hibája NEM dönti le a külső loopot', async () => {
    const reported: ToolOutcome[] = [];
    const tool = delegateToIngestTool(
      (_id, _name, _input, outcome) => reported.push(outcome),
      {
        run: async () => {
          throw new Error('DATABASE_URL_READWRITE hiányzik');
        },
      },
    );

    const content = await callTool(tool, {
      instruction: 'Vegyél fel egy terméket',
    });

    // Nem dob: a hibából a modell számára olvasható magyar szöveg lesz,
    // amiből tud javítani vagy magyarázni a felhasználónak.
    expect(content).toContain('DATABASE_URL_READWRITE');
    expect(reported[0]?.isError).toBe(true);
  });

  it('üres utasítást meg sem próbál delegálni', async () => {
    const run = vi.fn();
    const tool = delegateToIngestTool(undefined, { run });

    const content = await callTool(tool, { instruction: '   ' });

    expect(run).not.toHaveBeenCalled();
    expect(content).toMatch(/üres/i);
  });

  it('injektált futtató nélkül a VALÓDI ingest-agentet kötné be', () => {
    // Nem hívjuk meg (az API-t költene) — csak azt állítjuk, hogy a tool
    // felépíthető futtató nélkül is, tehát a produkciós út be van kötve.
    const tool = delegateToIngestTool();
    expect(typeof tool.execute).toBe('function');
  });
});
