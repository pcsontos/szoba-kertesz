/**
 * REGRESSZIÓS MANIFESZT (core) — a saját kiegészítések, amiknek nincs
 * megfelelője a kurzus-repóban.
 *
 * A csomag PUBLIKUS felületén keresztül dolgozik (`../index.js`), nem belső
 * fájlútvonalon: így egy refaktor, ami fájlokat mozgat, vagy zölden átmegy
 * (az index újraexportál), vagy hangosan törik — de némán nem tud eltűnni.
 *
 * NE TÖRÖLD refaktornál. Ha egy kurzus-lépés törölné, az T3-eltérés:
 * megállás és jelzés, nem felülírás.
 */
import { describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LIST_CATEGORIES_TOOL_NAME,
  SYSTEM_PROMPT,
  buildSystemPrompt,
  executeListCategoriesTool,
  executeRunSqlTool,
  executeTool,
  askAgent,
  getSessionLogFilePath,
  guardSql,
  logInteraction,
} from '../index.js';

describe('saját kiegészítés 1 — listCategories tool', () => {
  it('a katalógus valódi kategórialistáját adja vissza', async () => {
    const result = await executeListCategoriesTool({});

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.categories.length).toBeGreaterThan(0);
    expect(result.categories).toContain('szobanövény');
  });

  it('be van kötve az executeTool dispatchbe', async () => {
    // Ez a lényegi regressziós állítás: a refaktor után is a NEVÉN keresztül
    // elérhető, nem "Ismeretlen tool"-t kapunk vissza.
    const outcome = await executeTool('listCategories', {});

    expect(outcome.ok).toBe(true);
    expect(outcome.resultSummary).toContain('szobanövény');
  });

  it('ismeretlen toolra hibaszöveget ad, nem dob kivételt', async () => {
    const outcome = await executeTool('nincsIlyenTool', {});

    expect(outcome.ok).toBe(false);
    expect(outcome.resultSummary).toContain('Ismeretlen tool');
  });
});

describe('saját kiegészítés 2 — SELECT INTO tiltás', () => {
  it('elutasítja a SELECT ... INTO formát', () => {
    const result = guardSql('SELECT * INTO backup FROM products');

    expect(result.allowed).toBe(false);
    if (result.allowed) return;

    expect(result.reason.length).toBeGreaterThan(0);
  });
});

describe('saját kiegészítés 3 — LIMIT subquery-be csomagolva', () => {
  it('LIMIT nélküli SELECT-re is sor-korlátozott SQL-t ad vissza', () => {
    const result = guardSql('SELECT * FROM products');

    expect(result.allowed).toBe(true);
    if (!result.allowed) return;

    expect(result.sql.toUpperCase()).toContain('LIMIT');
  });

  it('a záró sorvégi kommentes megkerülést is megfogja (a plafon él)', async () => {
    // Pont az a támadás, ami ellen a subquery-be csomagolás készült: a
    // hozzáfűzött LIMIT egy `--` kommentbe csúszna, és 200 sort kapnánk.
    const result = await executeRunSqlTool({
      query: 'SELECT * FROM generate_series(1, 200) AS g --x',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.rows.length).toBeLessThanOrEqual(50);
    expect(result.rowCount).toBe(result.rows.length);
  });
});

describe('saját kiegészítés 5 — javított system prompt', () => {
  it('előírja a visszakérdezést találgatás helyett', () => {
    expect(SYSTEM_PROMPT).toContain('KÉRDEZZ vissza');
  });

  it('előírja a COALESCE(sale_price, price) árlogikát', () => {
    expect(SYSTEM_PROMPT).toContain('COALESCE(sale_price, price)');
  });

  it('a buildSystemPrompt() wrapper pontosan a konstanst adja vissza', () => {
    // A 03. alkalom hívási alakja — a bájtazonosság a konstanson marad.
    expect(buildSystemPrompt()).toBe(SYSTEM_PROMPT);
  });
});

describe('beszélgetés-memória (03. alkalom, c00055a)', () => {
  it('a history a kérdés ELÉ fűződik, így a modell látja az előzményt', async () => {
    const create = vi.fn().mockResolvedValue({
      id: 'msg',
      type: 'message',
      role: 'assistant',
      model: 'teszt',
      content: [{ type: 'text', text: 'ok', citations: null }],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await askAgent('És olcsóbbat?', {
      client: { messages: { create } } as never,
      config: {
        anthropicApiKey: 'sk-ant-test',
        anthropicModel: 'teszt',
        databaseUrlReadonly: 'postgresql://ro:ro@localhost:5433/teszt',
      },
      log: async () => undefined,
      print: false,
      persistTrace: false,
      history: [
        { role: 'user', content: 'Ajánlj egy pozsgást.' },
        { role: 'assistant', content: 'Íme az Echeveria.' },
      ],
    });

    const sent = create.mock.calls[0]?.[0] as {
      messages: { role: string; content: unknown }[];
    };
    expect(sent.messages).toHaveLength(3);
    expect(sent.messages[0]?.content).toBe('Ajánlj egy pozsgást.');
    expect(sent.messages[2]?.content).toBe('És olcsóbbat?');
  });
});

describe('saját kiegészítés 6 — JSONL-logger token usage-dzsel', () => {
  it('JSONL sort ír a megadott fájlba, benne a token usage', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'szk-manifest-'));
    const filePath = join(dir, 'interaction.jsonl');

    await logInteraction(
      {
        systemPrompt: SYSTEM_PROMPT,
        messages: [],
        answer: 'teszt',
        usage: { inputTokens: 11, outputTokens: 22 },
        toolSteps: [],
      },
      filePath,
    );

    const written = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(written.trim().split('\n')[0]);

    expect(parsed).toHaveProperty('timestamp');
    // A token usage tényleg naplózva van — ez a HF3 költségbecslés alapja.
    expect(JSON.stringify(parsed)).toContain('11');
    expect(JSON.stringify(parsed)).toContain('22');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 04. alkalom — manifeszt-keményítés a framework-migráció ELŐTT.
//
// A következő három blokk azt a három drótot rögzíti, amit a Vercel AI SDK-ra
// állás elvágna. SZÁNDÉKOSAN típus- és névszinten állítanak, NEM az askAgent
// belső injektálási mechanizmusán (`deps.client`) — így a migráció után is
// változtatás nélkül érvényesek maradnak.
// ─────────────────────────────────────────────────────────────────────────────

describe('saját kiegészítés 7 — a --show-prompt adatforrása', () => {
  it('az askAgent eredménye típusszinten hordozza a systemPrompt-ot', async () => {
    // Fordítási idejű állítás: ha az AskResult-ból kiesik a systemPrompt, ez a
    // sor NEM fordul le, és a typecheck bukik — nem csak a teszt.
    type Result = Awaited<ReturnType<typeof askAgent>>;
    const readSystemPrompt = (result: Result): string => result.systemPrompt;

    expect(typeof readSystemPrompt).toBe('function');
  });
});

describe('saját kiegészítés 6 — a JSONL-logger a csomag felületén marad', () => {
  it('a logInteraction és a session-fájl útja exportált marad', () => {
    expect(typeof logInteraction).toBe('function');
    expect(typeof getSessionLogFilePath).toBe('function');
    // A .jsonl kiterjesztés a Trace .json nyomától való elkülönülés garanciája:
    // a kettő egymás MELLETT él, nem váltja ki egymást.
    expect(getSessionLogFilePath()).toMatch(/\.jsonl$/);
  });
});

describe('saját kiegészítés 1 — a listCategories neve nem tűnhet el', () => {
  it('a tool neve exportált konstans, és pontosan "listCategories"', () => {
    expect(LIST_CATEGORIES_TOOL_NAME).toBe('listCategories');
  });
});
