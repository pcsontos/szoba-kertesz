import { guardSql } from './sql-guard.js';

describe('guardSql', () => {
  it('wraps a SELECT with an existing LIMIT in an outer bounding LIMIT too', () => {
    const result = guardSql('SELECT * FROM products WHERE stock > 0 LIMIT 10');

    expect(result).toEqual({
      allowed: true,
      sql: 'SELECT * FROM (\nSELECT * FROM products WHERE stock > 0 LIMIT 10\n) AS _q LIMIT 50',
    });
  });

  it('wraps a SELECT with no LIMIT in the same outer bounding LIMIT', () => {
    const result = guardSql('SELECT * FROM products WHERE category = $$');

    expect(result).toEqual({
      allowed: true,
      sql: 'SELECT * FROM (\nSELECT * FROM products WHERE category = $$\n) AS _q LIMIT 50',
    });
  });

  it('is case-insensitive for the leading SELECT keyword', () => {
    const result = guardSql('select id, name from products limit 5');

    expect(result.allowed).toBe(true);
    expect(result.allowed && result.sql).toEqual(
      'SELECT * FROM (\nselect id, name from products limit 5\n) AS _q LIMIT 50',
    );
  });

  it('strips a single trailing semicolon and still wraps with the outer LIMIT', () => {
    const result = guardSql('SELECT count(*) FROM products;');

    expect(result).toEqual({
      allowed: true,
      sql: 'SELECT * FROM (\nSELECT count(*) FROM products\n) AS _q LIMIT 50',
    });
  });

  it('rejects a query that is not a SELECT', () => {
    const result = guardSql('DROP TABLE products');

    expect(result.allowed).toBe(false);
    expect(!result.allowed && result.reason).toMatch(/SELECT/i);
  });

  it.each(['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'TRUNCATE'])(
    'rejects a SELECT-prefixed query containing a forbidden %s keyword',
    (keyword) => {
      const result = guardSql(
        `SELECT * FROM products; ${keyword} products SET stock = 0`,
      );

      expect(result.allowed).toBe(false);
    },
  );

  it('rejects UPDATE even when disguised inside a single statement', () => {
    const result = guardSql('SELECT * FROM products UPDATE stock = 0');

    expect(result.allowed).toBe(false);
    expect(!result.allowed && result.reason).toMatch(/UPDATE/i);
  });

  it('rejects SELECT ... INTO (creates and populates a new table — a genuine write disguised as SELECT)', () => {
    const result = guardSql(
      'SELECT id, name INTO new_table FROM products LIMIT 5',
    );

    expect(result.allowed).toBe(false);
    expect(!result.allowed && result.reason).toMatch(/INTO/i);
  });

  it('rejects SELECT ... INTO TEMP ... (the temp-table form of the same write)', () => {
    const result = guardSql('SELECT * INTO TEMP y FROM products LIMIT 5');

    expect(result.allowed).toBe(false);
    expect(!result.allowed && result.reason).toMatch(/INTO/i);
  });

  it('does not false-positive on "into" appearing inside a larger word (word-boundary match only)', () => {
    const result = guardSql(
      "SELECT * FROM products WHERE description ILIKE '%printout%' LIMIT 5",
    );

    expect(result.allowed).toBe(true);
  });

  it('rejects multi-statement input separated by a semicolon (SELECT ; DROP)', () => {
    const result = guardSql('SELECT 1; DROP TABLE products;');

    expect(result.allowed).toBe(false);
    expect(!result.allowed && result.reason).toMatch(/egyetlen|utasítás/i);
  });

  it('rejects empty or whitespace-only input', () => {
    const empty = guardSql('');
    const whitespace = guardSql('   \n\t  ');

    expect(empty.allowed).toBe(false);
    expect(whitespace.allowed).toBe(false);
  });

  it('rejects a lone semicolon (no statement at all)', () => {
    const result = guardSql(';');

    expect(result.allowed).toBe(false);
  });

  describe('LIMIT enforcement is immune to trailing-comment and string-literal tricks', () => {
    it('places the closing wrapper on its own line, so a trailing "--" line comment cannot swallow the outer LIMIT', () => {
      const result = guardSql(
        'SELECT g FROM generate_series(1,200) g --x LIMIT 50',
      );

      expect(result.allowed).toBe(true);
      const sql = result.allowed ? result.sql : '';

      // A "--x LIMIT 50" komment csak a saját sorát nyelheti el — a
      // zárójel-zárásnak és a külső LIMIT-nek egy KÖVETKEZŐ, önálló soron
      // kell lennie ahhoz, hogy a komment ne tudja megkerülni (lásd a
      // sql-guard.ts fájl-szintű doc-commentjét és
      // runsql-tool.spec.ts valódi, élő DB-n futtatott regressziós
      // tesztjét, ami ténylegesen leszámolja a visszakapott sorokat).
      const lines = sql.split('\n');
      const commentLineIndex = lines.findIndex((line) =>
        line.includes('--x'),
      );
      expect(commentLineIndex).toBeGreaterThanOrEqual(0);
      expect(lines[commentLineIndex + 1]).toEqual(') AS _q LIMIT 50');
    });

    it('still applies the outer LIMIT even when the inner statement contains "limit" inside a string literal', () => {
      const result = guardSql(
        "SELECT * FROM products WHERE description ILIKE '%limit%'",
      );

      expect(result.allowed).toBe(true);
      expect(result.allowed && result.sql).toMatch(/\) AS _q LIMIT 50$/);
    });
  });
});
