import { describe, expect, it } from 'vitest';
import { buildIngestPrompt } from './ingest-prompt.js';
import { buildQueryPrompt } from '../query-agent/query-prompt.js';

describe('buildIngestPrompt', () => {
  it('a szerkesztő szerepet írja le, nem a vásárlói kérdés-választ', () => {
    expect(buildIngestPrompt()).toMatch(/katalógus-kezelő/i);
  });

  it('kimondja, hogy írni CSAK az upsertProduct-tal lehet', () => {
    expect(buildIngestPrompt()).toMatch(/upsertProduct/);
    expect(buildIngestPrompt()).toMatch(
      /runSql csak SELECT|nyers módosító SQL-t NE/i,
    );
  });

  it('NEM említi a listCategories toolt — az a query-agenté', () => {
    expect(buildIngestPrompt()).not.toMatch(/listCategories/);
  });

  it('külön prompt a query-agentétől', () => {
    expect(buildIngestPrompt()).not.toBe(buildQueryPrompt());
  });
});
