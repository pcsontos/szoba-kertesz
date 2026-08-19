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
