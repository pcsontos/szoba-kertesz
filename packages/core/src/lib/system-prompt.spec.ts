import { SYSTEM_PROMPT } from './system-prompt.js';

describe('SYSTEM_PROMPT', () => {
  it('is XML-tagged with <role>, <task> and <constraint> sections', () => {
    expect(SYSTEM_PROMPT).toMatch(/<role>[\s\S]*<\/role>/);
    expect(SYSTEM_PROMPT).toMatch(/<task>[\s\S]*<\/task>/);
    expect(SYSTEM_PROMPT).toMatch(/<constraint>[\s\S]*<\/constraint>/);
  });

  it('describes the Szobakertész interior-design persona in Hungarian', () => {
    expect(SYSTEM_PROMPT).toMatch(/Szobakertész/);
    expect(SYSTEM_PROMPT).toMatch(/lakberendező/);
  });

  it('explicitly states it has no database access and must not invent catalogue data', () => {
    const constraintMatch = SYSTEM_PROMPT.match(
      /<constraint>([\s\S]*)<\/constraint>/,
    );
    expect(constraintMatch).not.toBeNull();
    const constraintText = constraintMatch?.[1] ?? '';

    expect(constraintText).toMatch(/nincs adatbázis-hozzáférés/i);
    expect(constraintText).toMatch(/ne találj ki/i);
  });

  it('does not mention SQL, runSql or the products table (that is the B3 tool-based prompt)', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/runSql/i);
    expect(SYSTEM_PROMPT).not.toMatch(/\bSQL\b/i);
    expect(SYSTEM_PROMPT).not.toMatch(/products\s*\(/i);
  });
});
