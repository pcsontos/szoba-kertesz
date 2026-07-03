import { SYSTEM_PROMPT } from './system-prompt.js';

describe('SYSTEM_PROMPT', () => {
  it('is XML-tagged with <role>, <task>, <schema>, <rules>, <behavior> and <tools> sections', () => {
    expect(SYSTEM_PROMPT).toMatch(/<role>[\s\S]*<\/role>/);
    expect(SYSTEM_PROMPT).toMatch(/<task>[\s\S]*<\/task>/);
    expect(SYSTEM_PROMPT).toMatch(/<schema>[\s\S]*<\/schema>/);
    expect(SYSTEM_PROMPT).toMatch(/<rules>[\s\S]*<\/rules>/);
    expect(SYSTEM_PROMPT).toMatch(/<behavior>[\s\S]*<\/behavior>/);
    expect(SYSTEM_PROMPT).toMatch(/<tools>[\s\S]*<\/tools>/);
  });

  it('describes the Szobakertész interior-design persona in Hungarian', () => {
    expect(SYSTEM_PROMPT).toMatch(/Szobakertesz/);
    expect(SYSTEM_PROMPT).toMatch(/lakberendező/);
  });

  it('lists every products column referenced in the domain model', () => {
    const schemaMatch = SYSTEM_PROMPT.match(/<schema>([\s\S]*)<\/schema>/);
    expect(schemaMatch).not.toBeNull();
    const schemaText = schemaMatch?.[1] ?? '';

    for (const column of [
      'id',
      'name',
      'latin_name',
      'category',
      'location',
      'price',
      'sale_price',
      'stock',
      'light',
      'watering',
      'difficulty',
      'current_height_cm',
      'max_height_cm',
      'current_pot_cm',
      'pet_safe',
      'kid_safe',
      'air_purifying',
      'rating',
      'reviews_count',
      'description',
    ]) {
      expect(schemaText).toContain(column);
    }
  });

  it('mandates SELECT-only, an always-present LIMIT, ILIKE search and COALESCE pricing', () => {
    const rulesMatch = SYSTEM_PROMPT.match(/<rules>([\s\S]*)<\/rules>/);
    expect(rulesMatch).not.toBeNull();
    const rulesText = rulesMatch?.[1] ?? '';

    expect(rulesText).toMatch(/CSAK SELECT/);
    expect(rulesText).toMatch(/INSERT\/UPDATE\/DELETE\/DDL tilos/);
    expect(rulesText).toMatch(/LIMIT/);
    expect(rulesText).toMatch(/ILIKE/);
    expect(rulesText).toMatch(/COALESCE\(sale_price, price\)/);
    expect(rulesText).toMatch(/stock > 0/);
  });

  it('instructs the model to ask a clarifying question instead of guessing', () => {
    const behaviorMatch = SYSTEM_PROMPT.match(/<behavior>([\s\S]*)<\/behavior>/);
    expect(behaviorMatch).not.toBeNull();
    const behaviorText = behaviorMatch?.[1] ?? '';

    expect(behaviorText).toMatch(/KÉRDEZZ vissza/);
    expect(behaviorText).toMatch(/Ne találj ki nem létező oszlopot vagy táblát/);
  });

  it('describes the runSql tool for read-only SQL execution', () => {
    const toolsMatch = SYSTEM_PROMPT.match(/<tools>([\s\S]*)<\/tools>/);
    expect(toolsMatch).not.toBeNull();
    const toolsText = toolsMatch?.[1] ?? '';

    expect(toolsText).toMatch(/runSql\(query\)/);
    expect(toolsText).toMatch(/read-only/i);
  });

  it('describes the listCategories tool for distinct category lookup', () => {
    const toolsMatch = SYSTEM_PROMPT.match(/<tools>([\s\S]*)<\/tools>/);
    expect(toolsMatch).not.toBeNull();
    const toolsText = toolsMatch?.[1] ?? '';

    expect(toolsText).toMatch(/listCategories\(\)/);
    expect(toolsText).toMatch(/SELECT DISTINCT category/);
  });
});
