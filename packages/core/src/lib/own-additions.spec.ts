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
import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  SYSTEM_PROMPT,
  executeListCategoriesTool,
  executeRunSqlTool,
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
