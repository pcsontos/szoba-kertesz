import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createDebugKnowledgeRouter,
  type DebugKnowledgeDeps,
} from './debug-knowledge.js';

/**
 * A debug-végpontok azért vannak, hogy a RAG két fele KÜLÖN legyen hibáztatható:
 * a RETRIEVAL (mit talált) és a GENERÁLÁS (mit mondott). A tesztek injektált
 * magokkal futnak — se DB, se API-kulcs, ahogy a többi server-spec.
 */

let server: Server | null = null;

async function start(deps: DebugKnowledgeDeps): Promise<string> {
  const app = express();
  app.use('/debug/knowledge', createDebugKnowledgeRouter(deps));
  const listening = app.listen(0);
  server = listening;
  await new Promise<void>((resolve) =>
    listening.once('listening', () => resolve()),
  );
  const { port } = listening.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  const running = server;
  server = null;
  if (running) {
    await new Promise<void>((resolve) => running.close(() => resolve()));
  }
});

const source = {
  source: 'https://www.thesill.com/blogs/plants-101/monstera',
  title: 'Monstera care',
  category: 'plants-101',
  chunkCount: 3,
  totalChars: 2400,
};

describe('/debug/knowledge', () => {
  it('a /sources a dokumentumokat rövid azonosítóval adja vissza', async () => {
    const url = await start({ listSources: async () => [source] });

    const response = await fetch(`${url}/debug/knowledge/sources`);
    const body = (await response.json()) as {
      count: number;
      totalChunks: number;
      sources: { id: string; chunks: number }[];
    };

    expect(body.count).toBe(1);
    expect(body.totalChunks).toBe(3);
    // Az azonosító a forrás-URL utolsó szelete — ezzel lehet a /sources/:id-t hívni.
    expect(body.sources[0]?.id).toBe('monstera');
  });

  it('ismeretlen dokumentumra 404-et ad, magyar üzenettel', async () => {
    const url = await start({ listSources: async () => [source] });

    const response = await fetch(`${url}/debug/knowledge/sources/nincs-ilyen`);
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(404);
    expect(body.error).toMatch(/Nincs ilyen dokumentum/);
  });

  it('a NYERS keresés csak embeddinget és vektortávolságot használ — LLM nélkül', async () => {
    const retrieve = vi.fn();
    const url = await start({
      embed: async () => Array.from({ length: 1536 }, () => 0.1),
      search: async () => [
        {
          id: 1,
          source: source.source,
          title: source.title,
          category: source.category,
          chunkIndex: 0,
          content: 'Monstera care basics.',
          distance: 0.234,
        },
      ],
      retrieve: retrieve as never,
    });

    const response = await fetch(
      `${url}/debug/knowledge/chunks?search=monstera`,
    );
    const body = (await response.json()) as {
      embeddingDimensions: number;
      hits: { distance: number }[];
    };

    expect(body.embeddingDimensions).toBe(1536);
    expect(body.hits[0]?.distance).toBe(0.234);
    // A drága út (HyDE + rerank) NEM futott le.
    expect(retrieve).not.toHaveBeenCalled();
  });

  /**
   * A `topK` a külvilágból jön, tehát a HATÁRON validálandó (docs/konvenciók.md).
   * Validálás nélkül `Number('abc')` = NaN, és a `&pipeline=full` úton ez azt
   * jelentette, hogy a végpont KIFIZET egy HyDE- és egy rerank-hívást, majd a
   * `slice(0, NaN)` miatt ÜRES listát ad 200-cal. A #6 PR review 3. tétele.
   */
  it('érvénytelen topK-ra 400-at ad, és NEM indít fizetős hívást', async () => {
    const retrieve = vi.fn();
    const embed = vi.fn();
    const url = await start({
      retrieve: retrieve as never,
      embed: embed as never,
    });

    const response = await fetch(
      `${url}/debug/knowledge/chunks?search=monstera&topK=abc&pipeline=full`,
    );
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(400);
    expect(body.error).toMatch(/topK/);
    expect(retrieve).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
  });

  it('a 20-as felső korlát fölé menő topK-t sem nyeli le csendben', async () => {
    const retrieve = vi.fn();
    const url = await start({ retrieve: retrieve as never });

    const response = await fetch(
      `${url}/debug/knowledge/chunks?search=monstera&topK=50&pipeline=full`,
    );
    const body = (await response.json()) as { error?: string };

    // Korábban 20-ra csonkult (retrieve.ts WIDE_NET), és erről semmi nem szólt.
    expect(response.status).toBe(400);
    expect(body.error).toMatch(/1 és 20/);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it('érvényes topK-t továbbad a keresésnek', async () => {
    // A mock a VALÓDI 3-paraméteres... pontosabban 2-paraméteres szignatúrát veszi
    // fel: enélkül a mock.calls[0] típusa üres tuple, és a [1] indexelés nem fordul
    // (TS2493) — a Vitest ettől még zölden futna, a typecheck buktatja ki.
    const search = vi.fn(
      async (_queryEmbedding: number[], _topK: number) => [],
    );
    const url = await start({
      embed: async () => Array.from({ length: 1536 }, () => 0.1),
      search: search as never,
    });

    await fetch(`${url}/debug/knowledge/chunks?search=monstera&topK=3`);

    expect(search.mock.calls[0]?.[1]).toBe(3);
  });

  it('belső hibából MAGYAR üzenet lesz, nem nyers String(error)', async () => {
    const url = await start({
      listSources: async () => {
        throw new Error('kapcsolat megszakadt');
      },
    });

    const response = await fetch(`${url}/debug/knowledge/sources`);
    const body = (await response.json()) as { error?: string };

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/Nem sikerült/);
    expect(body.error).toContain('kapcsolat megszakadt');
    // Stack trace NEM szivároghat. A puszta 'at ' rossz próba magyar szövegen
    // ("dokumentumokat listázni" is tartalmazza) — valódi keret-mintát nézünk:
    // sortörés + behúzás + "at ", illetve forrásfájl-hivatkozás.
    expect(body.error).not.toMatch(/\n\s+at /);
    expect(body.error).not.toMatch(/\.(ts|js):\d+/);
  });

  it('a pipeline=full a TELJES retrievalt futtatja, és a hipotetikus választ is megmutatja', async () => {
    const url = await start({
      retrieve: async () => ({
        searchText: 'Yellowing leaves are caused by overwatering.',
        hits: [
          {
            id: 1,
            source: source.source,
            title: source.title,
            category: source.category,
            chunkIndex: 0,
            content: 'Monstera care basics.',
            distance: 0.234,
            score: 9,
          },
        ],
      }),
    });

    const response = await fetch(
      `${url}/debug/knowledge/chunks?search=monstera&pipeline=full`,
    );
    const body = (await response.json()) as {
      hypotheticalAnswer: string;
      hits: { rerankScore: number }[];
    };

    expect(body.hypotheticalAnswer).toContain('overwatering');
    expect(body.hits[0]?.rerankScore).toBe(9);
  });
});
