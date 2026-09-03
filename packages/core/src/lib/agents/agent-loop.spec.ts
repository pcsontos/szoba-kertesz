import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { askAgent, MAX_TOOL_ITERATIONS } from './query-agent/query-agent.js';
import { runAgentLoop } from './agent-loop.js';

/**
 * A KÖZÖS agent-loop (`agent-loop.ts`) tesztjei — a query-agenten keresztül
 * meghajtva, mert a loopot mindig egy agent futtatja (prompt + toolok + loop).
 * Amit itt állítunk (kör-limit, tool-váltás, usage-összegzés, üzenet-görgetés),
 * az a loop viselkedése, nem a query-agenté; az ingest-agent ugyanezt kapja.
 *
 * A tesztek az AI SDK 7 mock-modelljén (`ai/test`) futnak. Ez a
 * `deps.client` Anthropic-mock utódja: a `@ai-sdk/anthropic@4`
 * `specificationVersion`-je `'v4'`, ezért `MockLanguageModelV4` kell (a V3
 * is fut, de nem a valódi providert modellezi).
 *
 * FIGYELEM: a 05. alkalomtól a loop `streamText`-tel fut, tehát a mock a
 * `doStream` oldalt szolgálja ki (a `doGenerate` utódja). A darabok
 * PROVIDER-szintűek, nem ai-szintűek — a `finishReason` objektum
 * (`{ unified }`), a `usage` ágyazott, a szövegmező neve pedig `delta` (az
 * ai-szintű `onChunk`-ban ugyanez `text`). Lapos alakkal a token-számok és a
 * finishReason NÉMÁN `undefined`-ek lennének, és a tesztek hamis zöldet
 * mutatnának.
 *
 * A `runSql`-t meghajtó esetek VALÓDI read-only adatbázist hívnak (a
 * tool-factory a produkciós utat köti be) — futó, seedelt DB kell hozzájuk,
 * ugyanúgy, mint a `db-readonly.spec.ts`-hez.
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

/**
 * A `doGenerate` utódja: a loop a 05. alkalomtól `streamText`-tel fut, tehát a
 * mock a STREAM oldalt szolgálja ki. A darabok PROVIDER-szintűek: a szövegmező
 * neve itt `delta`, az ai-szintű `onChunk`-ban ugyanez `text`.
 */
const streamOf = (chunks: readonly unknown[]) =>
  simulateReadableStream({
    chunks: chunks as never,
    initialDelayInMs: 0,
    chunkDelayInMs: 0,
  });

const textStepChunks = (text: string | readonly string[]) => {
  const parts = typeof text === 'string' ? [text] : text;
  return [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' },
    ...parts.map((delta) => ({ type: 'text-delta', id: 't1', delta })),
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: { unified: 'stop' }, usage: usage(10, 20) },
  ];
};

const toolStepChunks = (
  toolCallId: string,
  toolName: string,
  input: unknown,
) => [
  { type: 'stream-start', warnings: [] },
  { type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) },
  {
    type: 'finish',
    finishReason: { unified: 'tool-calls' },
    usage: usage(15, 25),
  },
];

/** Egymás utáni köröket kiszolgáló mock. Az utolsó választ ismétli, ha elfogy. */
function mockModel(...steps: readonly (readonly unknown[])[]) {
  let index = 0;
  const doStream = vi.fn(async () => ({
    stream: streamOf(steps[Math.min(index++, steps.length - 1)] ?? []),
  }));
  return {
    model: new MockLanguageModelV4({ doStream: doStream as never }),
    doStream,
  };
}

const baseDeps = {
  config: TEST_CONFIG,
  print: false,
  persistTrace: false,
};

describe('askAgent — AI SDK 7 loop', () => {
  it('egy körben válaszol, ha a modell nem kér toolt', async () => {
    const { model, doStream } = mockModel(
      textStepChunks('Egy szobanövény fényigénye az eredeti élőhelyétől függ.'),
    );
    const log = vi.fn().mockResolvedValue(undefined);

    const result = await askAgent('Mitől függ egy növény fényigénye?', {
      ...baseDeps,
      model,
      log,
    });

    expect(doStream).toHaveBeenCalledTimes(1);
    expect(result.answer).toContain('élőhelyétől');
    expect(result.systemPrompt).toMatch(/<role>/);
    expect(result.toolSteps).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(result.stopReason).toBe('stop');
    // Saját kiegészítés #6: a JSONL-logger a loop végén MINDIG lefut.
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('mind a NÉGY toolt felkínálja a modellnek', async () => {
    let seenTools: string[] = [];
    const model = new MockLanguageModelV4({
      doStream: (async (options: { tools?: { name: string }[] }) => {
        seenTools = (options.tools ?? []).map((tool) => tool.name);
        return { stream: streamOf(textStepChunks('kész')) };
      }) as never,
    });

    await askAgent('kérdés', {
      ...baseDeps,
      model,
      log: async () => undefined,
    });

    // Saját kiegészítés #1: a listCategories ott van a toolkészletben — a
    // kurzusnál csak kettő tool van, nálunk a searchKnowledge-dzsel együtt négy.
    expect(seenTools).toEqual([
      'runSql',
      'listCategories',
      'queryCustomers',
      'searchKnowledge',
    ]);
  });

  it('többkörös tool-váltás után ad végső választ, és naplózza a tool-lépést', async () => {
    const { model, doStream } = mockModel(
      toolStepChunks('call_1', 'runSql', {
        query: 'SELECT id, name FROM products WHERE pet_safe = true',
      }),
      textStepChunks('Íme néhány pet-safe növény.'),
    );

    const result = await askAgent('Mutass pet-safe növényeket', {
      ...baseDeps,
      model,
      log: async () => undefined,
    });

    expect(doStream).toHaveBeenCalledTimes(2);
    expect(result.toolSteps).toHaveLength(1);
    expect(result.toolSteps[0]?.toolName).toBe('runSql');
    expect(result.toolSteps[0]?.ok).toBe(true);
    // A guard a modell nyers query-jét subquery-be csomagolja, LIMIT-tel.
    expect(result.toolSteps[0]?.sql).toMatch(/LIMIT/i);
    // A token usage az ÖSSZES kör összege (15+10 / 25+20).
    expect(result.usage).toEqual({ inputTokens: 25, outputTokens: 45 });
  });

  it('a listCategories kör lefut és naplózódik', async () => {
    const { model } = mockModel(
      toolStepChunks('call_cat', 'listCategories', {}),
      textStepChunks('A katalógusban több kategória is van.'),
    );

    const result = await askAgent('Milyen kategóriák vannak?', {
      ...baseDeps,
      model,
      log: async () => undefined,
    });

    expect(result.toolSteps[0]?.toolName).toBe('listCategories');
    expect(result.toolSteps[0]?.ok).toBe(true);
    expect(result.toolSteps[0]?.resultSummary).toContain('szobanövény');
  });

  it('a nem-SQL tool lépésébe NEM kerül SQL a naplóba', async () => {
    const { model } = mockModel(
      toolStepChunks('call_cat', 'listCategories', {}),
      textStepChunks('A katalógusban több kategória is van.'),
    );

    const result = await askAgent('Milyen kategóriák vannak?', {
      ...baseDeps,
      model,
      log: async () => undefined,
    });

    // A ToolStep.sql szerződése: "a ténylegesen lefuttatott (LIMIT-tel
    // kiegészített) SQL". A listCategories nem a modell inputjából épít SQL-t,
    // tehát a mezőnek ÜRESEN kell maradnia — nem a Trace-nek szánt humán
    // összegzésnek ("8 kategória"). A JSONL a költségbecslés bizonyítékbázisa,
    // ott az "sql" mező nem jelenthet két különböző dolgot.
    expect(result.toolSteps[0]?.sql).toBeUndefined();
  });

  it('a guard elutasít egy írási kísérletet, és a modell javítani tud belőle', async () => {
    const { model } = mockModel(
      toolStepChunks('call_evil', 'runSql', { query: 'DELETE FROM products' }),
      textStepChunks(
        'Sajnálom, nem törölhetek adatot — csak lekérdezésre van jogosultságom.',
      ),
    );

    const result = await askAgent('töröld az összes növényt', {
      ...baseDeps,
      model,
      log: async () => undefined,
    });

    expect(result.toolSteps).toHaveLength(1);
    expect(result.toolSteps[0]?.ok).toBe(false);
    expect(result.toolSteps[0]?.resultSummary).toMatch(/SELECT/i);
    expect(result.answer).toMatch(/Sajnálom/);
  });

  it('ismeretlen tool nevére sem dob kivételt', async () => {
    const { model } = mockModel(
      toolStepChunks('call_x', 'deleteEverything', {}),
      textStepChunks('Ezt a toolt nem ismerem.'),
    );

    await expect(
      askAgent('kérdés', {
        ...baseDeps,
        model,
        log: async () => undefined,
      }),
    ).resolves.toBeDefined();
  });

  it('a beszélgetés-előzmény tartalmazza a TELJES tool-váltást', async () => {
    const { model } = mockModel(
      toolStepChunks('call_1', 'listCategories', {}),
      textStepChunks('Nyolc kategória van.'),
    );

    const result = await askAgent('Milyen kategóriák vannak?', {
      ...baseDeps,
      model,
      log: async () => undefined,
    });

    // ⚠️ Ez a teszt fogja el, ha valaki `result.responseMessages` helyett
    // `result.response.messages`-t ír: az AI SDK 7-ben az utóbbi CSAK az utolsó
    // kört adja vissza, a 'tool' szerepű üzenet eltűnne, és az interaktív
    // beszélgetés-memória némán megromlana.
    expect(result.messages.map((m) => m.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
  });

  it('a kör-limitet nem lépi túl, és nem hurkol örökké', async () => {
    // Minden kör toolt kér → a stopWhen állítja meg, nem a modell.
    const { model, doStream } = mockModel(
      toolStepChunks('call_loop', 'runSql', { query: 'SELECT 1' }),
    );

    const result = await askAgent('kérdés', {
      ...baseDeps,
      model,
      log: async () => undefined,
    });

    expect(doStream).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS);
    // VISELKEDÉSVÁLTOZÁS a kézi loophoz képest: nem dob, hanem magyarázó
    // szöveget ad vissza (az AI SDK a limitnél csendben megáll).
    expect(result.answer).toMatch(/megengedett lépésszámon belül/);
  });

  it('az SDK hibáját nem nyeli el', async () => {
    const model = new MockLanguageModelV4({
      doStream: (async () => {
        throw new Error('API hiba');
      }) as never,
    });

    await expect(
      askAgent('kérdés', { ...baseDeps, model, log: async () => undefined }),
    ).rejects.toThrow('API hiba');
  });

  it('elhasalt futásnál is naplóz, mielőtt továbbdobja a hibát', async () => {
    const model = new MockLanguageModelV4({
      doStream: (async () => {
        throw new Error('API hiba');
      }) as never,
    });
    const log = vi.fn().mockResolvedValue(undefined);

    await expect(
      askAgent('kérdés', { ...baseDeps, model, log }),
    ).rejects.toThrow('API hiba');

    // Saját kiegészítés #6: a tokenek egy elhasalt futásnál is elmennek, tehát
    // a futásnak nyoma KELL maradjon — különben a költségbecslés alulmér.
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('a hiba ELŐTT elköltött tokeneket és tool-lépéseket is naplózza', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: (async () => {
        call += 1;
        if (call === 1) {
          return {
            stream: streamOf(
              toolStepChunks('call_1', 'runSql', {
                query: 'SELECT id, name FROM products',
              }),
            ),
          };
        }
        throw new Error('API hiba a második körben');
      }) as never,
    });
    const log = vi.fn().mockResolvedValue(undefined);

    await expect(
      askAgent('kérdés', { ...baseDeps, model, log }),
    ).rejects.toThrow('API hiba a második körben');

    const entry = log.mock.calls[0]?.[0];
    // Az első kör usage-e (15/25) már elment — ennek a naplóban a helye.
    expect(entry?.usage).toEqual({ inputTokens: 15, outputTokens: 25 });
    // És a lefutott tool-lépés sem veszhet el.
    expect(entry?.toolSteps).toHaveLength(1);
  });

  it('a napló hibája sem akadályozhatja meg a Trace lezárását', async () => {
    const { model } = mockModel(textStepChunks('Kész a válasz.'));
    const writes: string[] = [];
    const spy = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: unknown) => {
        writes.push(String(chunk));
        return true;
      });

    try {
      await expect(
        askAgent('kérdés', {
          ...baseDeps,
          print: true,
          model,
          log: async () => {
            throw new Error('napló hiba');
          },
        }),
      ).rejects.toThrow('napló hiba');
    } finally {
      spy.mockRestore();
    }

    // A két nyom FÜGGETLEN egymástól (CLAUDE.md: "két, egymást kiegészítő
    // nyom, egyik sem váltja ki a másikat") — a JSONL bukása nem viheti
    // magával a Trace lezárását.
    expect(writes.join('')).toContain('VÁLASZ');
  });

  it('üres kérdést nem fogad el', async () => {
    await expect(askAgent('   ', baseDeps)).rejects.toThrow(/Üres kérdés/);
  });

  it('a szöveget darabonként adja tovább az onTextDelta-nak', async () => {
    const { model } = mockModel(
      textStepChunks(['Nyolc ', 'kategória ', 'van.']),
    );
    const deltas: string[] = [];

    const result = await askAgent('Milyen kategóriák vannak?', {
      ...baseDeps,
      model,
      log: async () => undefined,
      onTextDelta: (delta) => deltas.push(delta),
    });

    // A streamelés lényege: a darabok MENET KÖZBEN érkeznek, és a végén
    // ugyanaz az egész válasz áll össze, mint korábban.
    expect(deltas).toEqual(['Nyolc ', 'kategória ', 'van.']);
    expect(result.answer).toBe('Nyolc kategória van.');
  });

  it('az EREDETI hibaüzenetet dobja, nem az SDK becsomagolt üzenetét', async () => {
    const model = new MockLanguageModelV4({
      doStream: (async () => {
        throw new Error('API hiba');
      }) as never,
    });

    // ⚠️ MÉRT VISELKEDÉS: a streamText `result.text`-je itt a
    // "No output generated. Check the stream for errors." üzenettel rejectelne,
    // és az eredeti ok elveszne. A loop az onError-ból dobja tovább az igazit.
    await expect(
      askAgent('kérdés', { ...baseDeps, model, log: async () => undefined }),
    ).rejects.toThrow('API hiba');
  });

  it('MÁSODIK körben elhasalt streamnél is naplóz és dob', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: (async () => {
        call += 1;
        if (call === 1) {
          return {
            stream: streamOf(toolStepChunks('call_1', 'listCategories', {})),
          };
        }
        throw new Error('API hiba a második körben');
      }) as never,
    });
    const log = vi.fn().mockResolvedValue(undefined);

    // ⚠️ MÉRT CSAPDA: itt a `result.text` NEM rejectel — kezeletlenül a futás
    // sikeresnek látszana, üres válasszal, és a [MEGSZAKADT] naplósor
    // NÉMÁN eltűnne. A költségbecslés alulmérne (saját kiegészítés #6).
    await expect(
      askAgent('kérdés', { ...baseDeps, model, log }),
    ).rejects.toThrow('API hiba a második körben');

    const entry = log.mock.calls[0]?.[0];
    expect(entry?.answer).toMatch(/^\[MEGSZAKADT\]/);
    expect(entry?.usage).toEqual({ inputTokens: 15, outputTokens: 25 });
    expect(entry?.toolSteps).toHaveLength(1);
  });
});

describe('onStream — az ÜZENET-csatorna', () => {
  it('a hívó kapja meg a stream eredményét, és a válasz ugyanaz marad', async () => {
    const { model } = mockModel(textStepChunks('Nyolc kategória.'));
    let handedOver = false;

    const result = await askAgent('kérdés', {
      ...baseDeps,
      model,
      onStream: (streamResult) => {
        handedOver = true;
        // A hívó dolga a fogyasztás — élesben ezt a szerver teszi a válaszba pipe-olva.
        void streamResult.consumeStream();
      },
    });

    expect(handedOver).toBe(true);
    expect(result.answer).toBe('Nyolc kategória.');
    expect(result.usage.inputTokens).toBeGreaterThan(0);
  });

  it('onStream MELLETT is lefut az onTextDelta — erre épül a szerver tartalék-válasza', async () => {
    const { model } = mockModel(textStepChunks('Kész.'));
    const deltas: string[] = [];

    await askAgent('kérdés', {
      ...baseDeps,
      model,
      onStream: (streamResult) => {
        void streamResult.consumeStream();
      },
      onTextDelta: (delta) => deltas.push(delta),
    });

    // Az onChunk hookot az SDK hívja a stream feldolgozásakor — mindegy, KI olvassa.
    expect(deltas.join('')).toBe('Kész.');
  });
});

describe('askAgent — AgentDefinition.toolChoice (Task 11)', () => {
  it("meg nem adott toolChoice esetén az SDK alapértelmezése marad 'auto' (a meglévő agentek viselkedése változatlan)", async () => {
    let capturedToolChoice: unknown;
    const model = new MockLanguageModelV4({
      doStream: (async (options: { toolChoice?: unknown }) => {
        capturedToolChoice = options.toolChoice;
        return { stream: streamOf(textStepChunks('kész')) };
      }) as never,
    });

    await askAgent('kérdés', {
      config: TEST_CONFIG,
      model,
      print: false,
      persistTrace: false,
      log: async () => undefined,
    });

    // Amikor az AgentDefinition-ben nincs beállítva a toolChoice, az SDK
    // alapértelmezése ('auto') marad — a meglévő agentek ezt kapják, és így
    // viselkedésük nem változik.
    expect(capturedToolChoice).toEqual({ type: 'auto' });
  });
});

describe('runAgentLoop — toolChoice threading (Task 11)', () => {
  it('a megadott toolChoice a PROVIDER-szintű alakban ({type: "required"}) ér célba', async () => {
    let capturedToolChoice: unknown;
    const model = new MockLanguageModelV4({
      doStream: (async (options: { toolChoice?: unknown }) => {
        capturedToolChoice = options.toolChoice;
        return { stream: streamOf(textStepChunks('kész')) };
      }) as never,
    });

    await runAgentLoop(
      'kérdés',
      {
        systemPrompt: 'system',
        buildTools: () => ({}),
        maxSteps: 1,
        maxOutputTokens: 100,
        emptyAnswer: 'üres',
        toolChoice: 'required',
      },
      { config: TEST_CONFIG, model, print: false, persistTrace: false, log: async () => undefined },
    );

    expect(capturedToolChoice).toEqual({ type: 'required' });
  });
});
