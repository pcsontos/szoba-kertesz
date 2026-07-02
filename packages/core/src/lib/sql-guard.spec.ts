import { guardSql } from './sql-guard.js';

describe('guardSql', () => {
  it('allows a simple SELECT and leaves an existing LIMIT untouched', () => {
    const result = guardSql('SELECT * FROM products WHERE stock > 0 LIMIT 10');

    expect(result).toEqual({
      allowed: true,
      sql: 'SELECT * FROM products WHERE stock > 0 LIMIT 10',
    });
  });

  it('auto-appends a default LIMIT when the query has none', () => {
    const result = guardSql('SELECT * FROM products WHERE category = $$');

    expect(result).toEqual({
      allowed: true,
      sql: 'SELECT * FROM products WHERE category = $$ LIMIT 50',
    });
  });

  it('is case-insensitive for the leading SELECT keyword', () => {
    const result = guardSql('select id, name from products limit 5');

    expect(result.allowed).toBe(true);
    expect(result.allowed && result.sql).toEqual(
      'select id, name from products limit 5',
    );
  });

  it('strips a single trailing semicolon and still appends LIMIT', () => {
    const result = guardSql('SELECT count(*) FROM products;');

    expect(result).toEqual({
      allowed: true,
      sql: 'SELECT count(*) FROM products LIMIT 50',
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
});
