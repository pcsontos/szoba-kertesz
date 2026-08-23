import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import { closeChatPool } from './db-chat.js';
import {
  appendMessage,
  createThread,
  listThreads,
  loadThread,
  toThreadTitle,
} from './thread-store.js';
import { textToParts } from './message-parts.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRootEnvPath = resolve(here, '../../../../../.env');
try {
  process.loadEnvFile(repoRootEnvPath);
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

// A takarítás ADMIN kapcsolaton megy: a szoba-kertesz_chat szerep SZÁNDÉKOSAN nem tud
// DELETE-elni, tehát a teszt nem tudná eltakarítani a saját sorait. Ugyanez a minta,
// mint az upsert-product-db.spec.ts-ben.
const adminPool = new Pool({ connectionString: process.env['DATABASE_URL'] });
const createdIds: string[] = [];

describe('toThreadTitle — a lista címe (tiszta függvény)', () => {
  it('a rövid kérdést változatlanul adja vissza', () => {
    expect(toThreadTitle('Hány kaktusz van?')).toBe('Hány kaktusz van?');
  });

  it('a hosszút 60 karakterre vágja, jelöléssel', () => {
    const title = toThreadTitle('a'.repeat(200));

    expect(title).toHaveLength(61);
    expect(title.endsWith('…')).toBe(true);
  });

  it('a többsoros bemenetet egy sorba lapítja', () => {
    expect(toThreadTitle('  Első sor\n\n  második  ')).toBe('Első sor második');
  });

  it('üres bemenetre beszédes alapértéket ad', () => {
    expect(toThreadTitle('   ')).toBe('Névtelen beszélgetés');
  });
});

describe('thread-store — körút a valódi adatbázison', () => {
  afterAll(async () => {
    if (createdIds.length > 0) {
      await adminPool.query('DELETE FROM threads WHERE id = ANY($1::uuid[])', [
        createdIds,
      ]);
    }
    await adminPool.end();
    await closeChatPool();
  });

  it('létrehoz, hozzáfűz, visszatölt', async () => {
    const id = await createThread(toThreadTitle('Hány kaktusz van?'));
    createdIds.push(id);

    await appendMessage(id, 'user', textToParts('Hány kaktusz van?'));
    await appendMessage(id, 'assistant', textToParts('Nyolc.'));

    const messages = await loadThread(id);

    expect(messages).not.toBeNull();
    expect(messages).toHaveLength(2);
    expect(messages?.[0].role).toBe('user');
    expect(messages?.[1].parts).toEqual([{ type: 'text', text: 'Nyolc.' }]);
    // A sorszám a UIMessage.id-t is kiszolgálja — a convertToModelMessages megköveteli.
    expect(typeof messages?.[0].id).toBe('number');
  });

  it('a nem szöveges részeket is megőrzi (a tool-kártyák visszatöltődnek)', async () => {
    const id = await createThread('tool-teszt');
    createdIds.push(id);
    const toolPart = {
      type: 'tool-runSql',
      state: 'output-available',
      input: { query: 'SELECT 1' },
      output: '[]',
    };

    await appendMessage(id, 'assistant', [
      toolPart,
      { type: 'text', text: 'Kész.' },
    ]);
    const messages = await loadThread(id);

    expect(messages?.[0].parts[0]).toEqual(toolPart);
  });

  it('a hozzáfűzés lépteti a thread updated_at-jét (egy atomi utasításban)', async () => {
    const id = await createThread('frissítés-teszt');
    createdIds.push(id);
    const before = await adminPool.query<{ updated_at: Date }>(
      'SELECT updated_at FROM threads WHERE id = $1',
      [id],
    );

    await new Promise((resolve) => setTimeout(resolve, 25));
    await appendMessage(id, 'user', textToParts('kérdés'));

    const after = await adminPool.query<{ updated_at: Date }>(
      'SELECT updated_at FROM threads WHERE id = $1',
      [id],
    );
    expect(after.rows[0].updated_at.getTime()).toBeGreaterThan(
      before.rows[0].updated_at.getTime(),
    );
  });

  it('a frissen létrehozott thread OTT VAN a lista elején', async () => {
    const id = await createThread('lista-teszt');
    createdIds.push(id);
    await appendMessage(id, 'user', textToParts('kérdés'));

    const threads = await listThreads(50);

    expect(threads[0].id).toBe(id);
    expect(threads[0].title).toBe('lista-teszt');
  });

  it('nem létező threadre NULL-t ad — ebből lesz a 404', async () => {
    const missing = '00000000-0000-4000-8000-000000000000';

    expect(await loadThread(missing)).toBeNull();
  });

  it('üzenet nélküli létező threadre ÜRES TÖMBÖT ad — ez nem 404', async () => {
    const id = await createThread('üres');
    createdIds.push(id);

    expect(await loadThread(id)).toEqual([]);
  });

  it('érvénytelen azonosítóra magyar hibát dob, a DB megkérdezése ELŐTT', async () => {
    await expect(loadThread('nem-uuid')).rejects.toThrow(/azonosító/i);
  });
});
