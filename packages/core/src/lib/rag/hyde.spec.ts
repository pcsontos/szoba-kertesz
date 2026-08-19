import { describe, expect, it } from 'vitest';
import { MockLanguageModelV4 } from 'ai/test';
import { hypotheticalAnswer } from './hyde.js';

/**
 * A HyDE lényege: NEM a kérdést keressük, hanem egy kitalált VÁLASZT — mert a
 * kérdés és a válasz nem ugyanazon a nyelven beszél. A tesztek azt rögzítik,
 * hogy a keresés SOSEM áll meg a HyDE hibáján: ilyenkor az eredeti kérdéssel megy tovább.
 *
 * A mock PROVIDER-szintű alakot ad vissza (finishReason objektum, ágyazott usage) —
 * lapos alakkal a számok némán undefined-ek lennének.
 */

const usage = (input: number, output: number) => ({
  inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
  totalTokens: input + output,
});

const textModel = (text: string) =>
  new MockLanguageModelV4({
    doGenerate: (async () => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: 'stop' as const },
      usage: usage(20, 40),
      warnings: [],
    })) as never,
  });

describe('hypotheticalAnswer', () => {
  it('a kitalált választ adja vissza, nem a kérdést', async () => {
    const answer = await hypotheticalAnswer('miért sárgulnak a leveleim?', {
      model: textModel(
        '  Yellowing leaves are commonly caused by overwatering.  ',
      ),
    });

    expect(answer).toBe(
      'Yellowing leaves are commonly caused by overwatering.',
    );
  });

  it('HIBA esetén az eredeti kérdést adja vissza — a keresés menjen tovább', async () => {
    const failing = new MockLanguageModelV4({
      doGenerate: (async () => {
        throw new Error('rate limit');
      }) as never,
    });

    const answer = await hypotheticalAnswer('miért sárgul?', {
      model: failing,
    });

    expect(answer).toBe('miért sárgul?');
  });

  it('üres válasznál is az eredeti kérdés megy tovább', async () => {
    const answer = await hypotheticalAnswer('miért sárgul?', {
      model: textModel('   '),
    });

    expect(answer).toBe('miért sárgul?');
  });
});
