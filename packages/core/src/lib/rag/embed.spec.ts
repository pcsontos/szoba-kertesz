import { describe, expect, it } from 'vitest';
import { MockEmbeddingModelV4 } from 'ai/test';
import { EMBEDDING_DIMENSIONS, embedBatch, embedText } from './embed.js';

/**
 * Az embedding az EGYETLEN nem-Anthropic hívás a rendszerben. A tesztek
 * mock-modellel futnak (`ai/test`), tehát se kulcs, se hálózat nem kell —
 * de a produkciós út alapértelmezésben be van kötve (a `deps.model` csak
 * felülírja), ugyanaz a minta, mint a delegateToIngest `run` opciója.
 */

const vector = (fill: number): number[] =>
  Array.from({ length: EMBEDDING_DIMENSIONS }, () => fill);

const mockModel = (embeddings: number[][]) =>
  new MockEmbeddingModelV4({
    doEmbed: async () => ({ embeddings, warnings: [] }),
  });

describe('embed', () => {
  it('a dimenziószám 1536 — ugyanaz, mint a tábla vector(1536) oszlopa', () => {
    expect(EMBEDDING_DIMENSIONS).toBe(1536);
  });

  it('egy szövegből egy vektort ad', async () => {
    const embedding = await embedText('sárgulnak a levelek', {
      model: mockModel([vector(0.5)]),
    });

    expect(embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(embedding[0]).toBe(0.5);
  });

  it('sok szövegből sok vektort ad, a bemenet SORRENDJÉBEN', async () => {
    // Az embedMany KÖTEGEL: a mock alapértelmezett maxEmbeddingsPerCall-ja 1,
    // tehát két hívás megy ki. A mock ezért a KAPOTT értékekből számol — így a
    // teszt a kötegelésen át is a sorrendet bizonyítja, nem a mock tömbjét.
    const fills: Record<string, number> = { első: 0.1, második: 0.2 };
    const embeddings = await embedBatch(['első', 'második'], {
      model: new MockEmbeddingModelV4({
        doEmbed: async ({ values }) => ({
          embeddings: values.map((value) => vector(fills[value] ?? 0)),
          warnings: [],
        }),
      }),
    });

    expect(embeddings).toHaveLength(2);
    expect(embeddings[0]?.[0]).toBe(0.1);
    expect(embeddings[1]?.[0]).toBe(0.2);
  });

  it('kulcs nélkül ÉRTHETŐ magyar hibát dob, nem SDK-hibát', async () => {
    await expect(
      embedText('bármi', {
        config: {
          anthropicApiKey: 'sk-ant-test',
          anthropicModel: 'claude-sonnet-4-6',
          databaseUrlReadonly: 'postgresql://ro:ro@localhost:5433/teszt',
        },
      }),
    ).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
