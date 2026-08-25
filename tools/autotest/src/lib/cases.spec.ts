import { describe, expect, it } from 'vitest';
import {
  loadBatteryCases,
  loadRagCases,
  parseBatteryCases,
  parseRagCases,
} from './cases.js';

describe('parseBatteryCases', () => {
  it('érvényes fokot elfogad', () => {
    const tiers = parseBatteryCases({
      tiers: [
        {
          name: '1 — Single-step',
          intent: 'egyszerű',
          questions: [{ id: 'a', q: 'Hány?' }],
        },
      ],
    });
    expect(tiers).toHaveLength(1);
    expect(tiers[0]?.questions?.[0]?.id).toBe('a');
  });

  it('az ELGÉPELT kulcsot elutasítja, nem engedi némán át', () => {
    // `redFlag` a `redFlags` helyett: enélkül az eset ELLENŐRZÉS NÉLKÜL futna, zölden.
    expect(() =>
      parseBatteryCases({
        tiers: [
          {
            name: 't',
            intent: 'i',
            questions: [{ id: 'a', q: 'Hány?', redFlag: ['x'] }],
          },
        ],
      }),
    ).toThrow();
  });

  it('a hibaüzenet MEGNEVEZI az elgépelt kulcsot', () => {
    // Egy „invalid input" üzenet 29 eset között használhatatlan.
    expect(() =>
      parseBatteryCases({
        tiers: [
          { name: 't', intent: 'i', questions: [{ id: 'a', q: 'Hány?', redFlag: ['x'] }] },
        ],
      }),
    ).toThrow(/redFlag/);
  });

  it('kötelezővé teszi a name/intent mezőt', () => {
    expect(() => parseBatteryCases({ tiers: [{ intent: 'i' }] })).toThrow();
  });

  it('beszélgetésnél nem enged üres steps tömböt', () => {
    expect(() =>
      parseBatteryCases({
        tiers: [
          {
            name: 't',
            intent: 'i',
            conversations: [{ id: 'c', title: 'T', steps: [] }],
          },
        ],
      }),
    ).toThrow();
  });

  it('elfogadja a restore és a verifyDb mezőt', () => {
    const tiers = parseBatteryCases({
      tiers: [
        {
          name: 't',
          intent: 'i',
          conversations: [
            {
              id: 'c',
              title: 'T',
              steps: ['egy', 'kettő'],
              restore: true,
              verifyDb: 'messages-saved',
              truth: 'mindkét kör elmentődik',
            },
          ],
        },
      ],
    });
    expect(tiers[0]?.conversations?.[0]?.restore).toBe(true);
  });

  it('az expectTool csak ismert tool-nevet enged', () => {
    expect(() =>
      parseBatteryCases({
        tiers: [
          { name: 't', intent: 'i', questions: [{ id: 'a', q: 'x', expectTool: 'nincsIlyen' }] },
        ],
      }),
    ).toThrow();
  });
});

describe('parseRagCases', () => {
  it('érvényes esetet elfogad', () => {
    const cases = parseRagCases({
      cases: [{ id: 'a', question: 'Miért?', groundTruth: 'Mert.' }],
    });
    expect(cases).toHaveLength(1);
  });

  it('a hiányzó groundTruth-t elutasítja', () => {
    // groundTruth nélkül a context recall értelmezhetetlen — némán 0 lenne.
    expect(() => parseRagCases({ cases: [{ id: 'a', question: 'Miért?' }] })).toThrow();
  });
});

describe('a VALÓDI cases-fájlok', () => {
  it('a battery-cases.json validál', () => {
    expect(loadBatteryCases().length).toBeGreaterThan(0);
  });

  it('a rag-cases.json validál', () => {
    expect(loadRagCases().length).toBeGreaterThan(0);
  });

  it('minden eset-azonosító egyedi a battery-ben', () => {
    const ids = loadBatteryCases().flatMap((tier) => [
      ...(tier.questions ?? []).map((question) => question.id),
      ...(tier.conversations ?? []).map((conversation) => conversation.id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('11 fokot és 29 esetet tart', () => {
    // A szám pinnelve: egy eset véletlen törlése némán szűkítené a mérést.
    const tiers = loadBatteryCases();
    expect(tiers).toHaveLength(11);
    const cases = tiers.flatMap((tier) => [
      ...(tier.questions ?? []),
      ...(tier.conversations ?? []),
    ]);
    expect(cases).toHaveLength(29);
  });

  it('minden expect-hez tartozik truth (a riport enélkül nem tud mit mutatni)', () => {
    for (const tier of loadBatteryCases()) {
      for (const question of tier.questions ?? []) {
        if (question.expect) {
          expect(question.expect.truth.length).toBeGreaterThan(10);
        }
      }
    }
  });
});
