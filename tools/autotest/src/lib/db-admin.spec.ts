import { describe, expect, it, vi } from 'vitest';
import {
  countMessages,
  deleteThreads,
  listThreadIds,
  queryNames,
  type AdminQuery,
} from './db-admin.js';

/** Teszt-szeam: a valódi pg-pool helyett előre megadott sorokat ad vissza. */
function fakeQuery(rows: Record<string, unknown>[]): AdminQuery {
  return vi.fn(async () => ({ rows }));
}

describe('queryNames', () => {
  it('a name oszlopot string-tömbbé alakítja', async () => {
    const query = fakeQuery([{ name: 'Bazsalikom' }, { name: 'Muskátli' }]);
    await expect(queryNames('SELECT name FROM products', { query })).resolves.toEqual([
      'Bazsalikom',
      'Muskátli',
    ]);
  });

  it('DB-hiba esetén NULL-t ad, nem üres tömböt', async () => {
    // A [] azt hazudná, hogy a referencia-halmaz üres — a battery 0 F1-et számolna
    // AGENT-hibaként, holott infra-hiba. A null megkülönböztethető.
    const query: AdminQuery = async () => {
      throw new Error('connection refused');
    };
    await expect(queryNames('SELECT name FROM products', { query })).resolves.toBeNull();
  });

  it('a nem-string name-et kihagyja', async () => {
    const query = fakeQuery([{ name: 'Aloe vera' }, { name: null }]);
    await expect(queryNames('…', { query })).resolves.toEqual(['Aloe vera']);
  });
});

describe('a szerep-szétválasztás', () => {
  it('a queryNames a READONLY változóra köt, a takarítás az adminra', async () => {
    // A #10 PR-review 4. tétele: a referencia-SQL csak SELECT, tehát nem való admin
    // kapcsolatra — egy bemásolt DELETE adminként lefutott volna. Ugyanaz a minta, mint a
    // core rag/knowledge-store.ts-ében: keresés _ro-n, írás adminon.
    const source = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('./db-admin.ts', import.meta.url), 'utf8'),
    );
    const readonlyBlock = source.slice(
      source.indexOf('function readonlyPool'),
      source.indexOf('function queryOn'),
    );
    expect(readonlyBlock).toContain('DATABASE_URL_READONLY');
    const namesBlock = source.slice(
      source.indexOf('export async function queryNames'),
      source.indexOf('export async function listThreadIds'),
    );
    expect(namesBlock).toContain('queryOn(readonlyPool');
    expect(namesBlock).not.toContain('adminPool');
  });
});

describe('deleteThreads', () => {
  it('üres listánál NEM kérdez az adatbázistól', async () => {
    const query = fakeQuery([]);
    await expect(deleteThreads([], { query })).resolves.toBe(0);
    expect(query).not.toHaveBeenCalled();
  });

  it('a messages-t a threads ELŐTT törli, paraméterezve', async () => {
    // Fordított sorrendben a külső kulcs miatt bukna; a beszúrt id pedig SQL-injection.
    const calls: { sql: string; params?: readonly unknown[] }[] = [];
    const query: AdminQuery = async (sql, params) => {
      calls.push({ sql, params });
      return { rows: [] };
    };
    await deleteThreads(['11111111-1111-1111-1111-111111111111'], { query });
    expect(calls).toHaveLength(2);
    expect(calls[0]?.sql).toMatch(/DELETE FROM messages/i);
    expect(calls[1]?.sql).toMatch(/DELETE FROM threads/i);
    expect(calls[0]?.sql).toContain('$1');
    expect(calls[0]?.params).toEqual([['11111111-1111-1111-1111-111111111111']]);
  });

  it('a törölt threadek számát adja vissza', async () => {
    await expect(deleteThreads(['a', 'b'], { query: fakeQuery([]) })).resolves.toBe(2);
  });
});

describe('listThreadIds', () => {
  it('az id oszlopot adja vissza', async () => {
    const query = fakeQuery([{ id: 'x' }, { id: 'y' }]);
    await expect(listThreadIds({ query })).resolves.toEqual(['x', 'y']);
  });
});

describe('countMessages', () => {
  it('a count értéket számmá alakítja (a pg stringként adja a bigintet)', async () => {
    const query = fakeQuery([{ count: '4' }]);
    await expect(countMessages('t', { query })).resolves.toBe(4);
  });

  it('hiányzó sornál 0', async () => {
    await expect(countMessages('t', { query: fakeQuery([]) })).resolves.toBe(0);
  });
});
