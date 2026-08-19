import { describe, expect, it } from 'vitest';
import { executeSearchKnowledge } from './search-knowledge-tool.js';
import type { RetrieveResult } from '../../rag/retrieve.js';

/**
 * A tool SZERZŐDÉSE: soha nem dob, mindig ToolOutcome-ot ad vissza, és az `sql`
 * mezője MINDIG null — a vektorkeresés SQL-jét nem a modell írta, tehát nem
 * tartozik a napló `sql` oszlopába (lásd tool-outcome.ts).
 */

const result = (titles: string[]): RetrieveResult => ({
  searchText: 'kitalált válasz',
  hits: titles.map((title, index) => ({
    id: index + 1,
    source: `https://teszt.local/${index}`,
    title,
    category: 'teszt',
    chunkIndex: index,
    content: `${title} — a részlet szövege.`,
    distance: 0.123 + index / 100,
    score: 9 - index,
  })),
});

describe('executeSearchKnowledge', () => {
  it('a találatokat FORRÁSSAL együtt adja vissza a modellnek', async () => {
    const outcome = await executeSearchKnowledge(
      { question: 'miért sárgul a monstera?' },
      { retrieve: async () => result(['Monstera care', 'Root rot']) },
    );

    const payload = JSON.parse(outcome.content) as {
      results: { title: string; source: string; distance: number }[];
    };

    expect(outcome.isError).toBe(false);
    expect(payload.results).toHaveLength(2);
    expect(payload.results[0]?.title).toBe('Monstera care');
    expect(payload.results[0]?.source).toBe('https://teszt.local/0');
    expect(payload.results[0]?.distance).toBe(0.123);
    expect(outcome.rowCount).toBe(2);
  });

  it('az `sql` mező MINDIG null — nem a modell írta lekérdezés', async () => {
    const outcome = await executeSearchKnowledge(
      { question: 'kérdés' },
      { retrieve: async () => result(['A']) },
    );

    expect(outcome.sql).toBeNull();
  });

  it('találat nélkül KIMONDJA, hogy nincs információ — nem hagyja találgatni', async () => {
    const outcome = await executeSearchKnowledge(
      { question: 'van-e kutyám?' },
      { retrieve: async () => ({ hits: [], searchText: 'x' }) },
    );

    expect(outcome.isError).toBe(false);
    expect(outcome.rowCount).toBe(0);
    expect(outcome.content).toMatch(/nincs/i);
  });

  it('hibás bemenetre magyar hibaszöveget ad, nem dob', async () => {
    const outcome = await executeSearchKnowledge(
      { kerdes: 'elgépelt mezőnév' },
      { retrieve: async () => result(['A']) },
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.content).toMatch(/tool-bemenet/i);
  });

  it('a retrieval hibája is szöveg lesz a modellnek, nem kivétel', async () => {
    const outcome = await executeSearchKnowledge(
      { question: 'kérdés' },
      {
        retrieve: async () => {
          throw new Error('Hiányzó OPENAI_API_KEY');
        },
      },
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain('Hiányzó OPENAI_API_KEY');
  });
});
