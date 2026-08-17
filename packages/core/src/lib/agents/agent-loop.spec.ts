import { describe, expect, it, vi } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { askAgent, MAX_TOOL_ITERATIONS } from './query-agent/query-agent.js';

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
 * FIGYELEM: a `doGenerate` PROVIDER-szintű alakot ad vissza, nem az
 * ai-szintűt — a `finishReason` objektum (`{ unified }`), a `usage` pedig
 * ágyazott. Lapos alakkal a token-számok és a finishReason NÉMÁN
 * `undefined`-ek lennének, és a tesztek hamis zöldet mutatnának.
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

const textStep = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const },
  usage: usage(10, 20),
  warnings: [],
});

const toolStep = (toolCallId: string, toolName: string, input: unknown) => ({
  content: [
    {
      type: 'tool-call' as const,
      toolCallId,
      toolName,
      input: JSON.stringify(input),
    },
  ],
  finishReason: { unified: 'tool-calls' as const },
  usage: usage(15, 25),
  warnings: [],
});

/** Egymás utáni köröket kiszolgáló mock. Az utolsó választ ismétli, ha elfogy. */
function mockModel(...steps: readonly unknown[]) {
  let index = 0;
  const doGenerate = vi.fn(
    async () => steps[Math.min(index++, steps.length - 1)],
  );
  return {
    model: new MockLanguageModelV4({
      doGenerate: doGenerate as never,
    }),
    doGenerate,
  };
}

const baseDeps = {
  config: TEST_CONFIG,
  print: false,
  persistTrace: false,
};

describe('askAgent — AI SDK 7 loop', () => {
  it('egy körben válaszol, ha a modell nem kér toolt', async () => {
    const { model, doGenerate } = mockModel(
      textStep('Egy szobanövény fényigénye az eredeti élőhelyétől függ.'),
    );
    const log = vi.fn().mockResolvedValue(undefined);

    const result = await askAgent('Mitől függ egy növény fényigénye?', {
      ...baseDeps,
      model,
      log,
    });

    expect(doGenerate).toHaveBeenCalledTimes(1);
    expect(result.answer).toContain('élőhelyétől');
    expect(result.systemPrompt).toMatch(/<role>/);
    expect(result.toolSteps).toEqual([]);
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(result.stopReason).toBe('stop');
    // Saját kiegészítés #6: a JSONL-logger a loop végén MINDIG lefut.
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('mindhárom toolt felkínálja a modellnek', async () => {
    let seenTools: string[] = [];
    const model = new MockLanguageModelV4({
      doGenerate: (async (options: { tools?: { name: string }[] }) => {
        seenTools = (options.tools ?? []).map((tool) => tool.name);
        return textStep('kész');
      }) as never,
    });

    await askAgent('kérdés', {
      ...baseDeps,
      model,
      log: async () => undefined,
    });

    // Saját kiegészítés #1: a listCategories ott van a toolkészletben — a
    // kurzusnál csak kettő tool van, nálunk három.
    expect(seenTools).toEqual([
      'runSql',
      'listCategories',
      'getClientPreferences',
    ]);
  });

  it('többkörös tool-váltás után ad végső választ, és naplózza a tool-lépést', async () => {
    const { model, doGenerate } = mockModel(
      toolStep('call_1', 'runSql', {
        query: 'SELECT id, name FROM products WHERE pet_safe = true',
      }),
      textStep('Íme néhány pet-safe növény.'),
    );

    const result = await askAgent('Mutass pet-safe növényeket', {
      ...baseDeps,
      model,
      log: async () => undefined,
    });

    expect(doGenerate).toHaveBeenCalledTimes(2);
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
      toolStep('call_cat', 'listCategories', {}),
      textStep('A katalógusban több kategória is van.'),
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
      toolStep('call_cat', 'listCategories', {}),
      textStep('A katalógusban több kategória is van.'),
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
      toolStep('call_evil', 'runSql', { query: 'DELETE FROM products' }),
      textStep(
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
      toolStep('call_x', 'deleteEverything', {}),
      textStep('Ezt a toolt nem ismerem.'),
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
      toolStep('call_1', 'listCategories', {}),
      textStep('Nyolc kategória van.'),
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
    const { model, doGenerate } = mockModel(
      toolStep('call_loop', 'runSql', { query: 'SELECT 1' }),
    );

    const result = await askAgent('kérdés', {
      ...baseDeps,
      model,
      log: async () => undefined,
    });

    expect(doGenerate).toHaveBeenCalledTimes(MAX_TOOL_ITERATIONS);
    // VISELKEDÉSVÁLTOZÁS a kézi loophoz képest: nem dob, hanem magyarázó
    // szöveget ad vissza (az AI SDK a limitnél csendben megáll).
    expect(result.answer).toMatch(/megengedett lépésszámon belül/);
  });

  it('az SDK hibáját nem nyeli el', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: (async () => {
        throw new Error('API hiba');
      }) as never,
    });

    await expect(
      askAgent('kérdés', { ...baseDeps, model, log: async () => undefined }),
    ).rejects.toThrow('API hiba');
  });

  it('elhasalt futásnál is naplóz, mielőtt továbbdobja a hibát', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: (async () => {
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
      doGenerate: (async () => {
        call += 1;
        if (call === 1) {
          return toolStep('call_1', 'runSql', {
            query: 'SELECT id, name FROM products',
          });
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
    const { model } = mockModel(textStep('Kész a válasz.'));
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
});
