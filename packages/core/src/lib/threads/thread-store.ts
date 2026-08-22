import { z } from 'zod';
import { queryChat, type DbChatDeps } from './db-chat.js';

// thread-store.ts — a BESZÉLGETÉS TÁRA. Négy művelet, mind paraméterezett SQL, a
// szoba-kertesz_chat szerepen (db-chat.ts).
//
// A tár a `packages/core`-ban él, és nem az `apps/server`-ben, mert KÉT belépési pont
// használja: a szerver és a CLI interaktív módja. A core továbbra sem tud a belépési
// pontjáról — egy tár nem framework.

/** A thread azonosítója UUID. A felületek ezzel adnak 400-at, mielőtt bármit tennének. */
export const ThreadIdSchema = z.uuid();

export type MessageRole = 'user' | 'assistant';

export interface StoredMessage {
  /** A `messages.id` sorszáma. A UIMessage.id-t is ez szolgálja ki. */
  readonly id: number;
  readonly role: MessageRole;
  readonly parts: readonly unknown[];
}

export interface ThreadSummary {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
}

export const THREAD_TITLE_MAX = 60;
export const THREAD_LIST_LIMIT = 50;

/** Az első user-üzenetből cím: egy sorba lapítva, 60 karakterre vágva. */
export function toThreadTitle(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') {
    return 'Névtelen beszélgetés';
  }
  return flat.length > THREAD_TITLE_MAX
    ? `${flat.slice(0, THREAD_TITLE_MAX)}…`
    : flat;
}

/**
 * A HATÁR. A threadId kívülről jön (URL-paraméter, kérés-törzs, CLI-kapcsoló), ezért
 * `unknown`-ként kezeljük. Enélkül a Postgres `invalid input syntax for type uuid`
 * hibája szállna fel, és a szerver 500-zal, HTML stack trace-szel válaszolna — pontosan
 * az a hibaosztály, amit a #4 PR-review már egyszer megtalált a /api/chat-en.
 */
function assertThreadId(value: unknown): string {
  const parsed = ThreadIdSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `Érvénytelen beszélgetés-azonosító: "${String(value)}". UUID-t várunk.`,
    );
  }
  return parsed.data;
}

export async function createThread(
  title: string,
  deps: DbChatDeps = {},
): Promise<string> {
  const result = await queryChat<{ id: string }>(
    'INSERT INTO threads (title) VALUES ($1) RETURNING id',
    [title],
    deps,
  );
  return result.rows[0].id;
}

/**
 * Hozzáfűz egy üzenetet, ÉS lépteti a thread `updated_at`-jét — EGYETLEN utasításban.
 * Ha két statement lenne, egy félúton megszakadó futás után az üzenet ott lenne, a
 * thread viszont nem ugrana a lista élére.
 */
export async function appendMessage(
  threadId: string,
  role: MessageRole,
  parts: readonly unknown[],
  deps: DbChatDeps = {},
): Promise<void> {
  const id = assertThreadId(threadId);
  await queryChat(
    `WITH inserted AS (
       INSERT INTO messages (thread_id, role, parts)
       VALUES ($1::uuid, $2, $3::jsonb)
       RETURNING thread_id
     )
     UPDATE threads SET updated_at = now()
     FROM inserted
     WHERE threads.id = inserted.thread_id`,
    [id, role, JSON.stringify(parts)],
    deps,
  );
}

/**
 * A thread üzenetei időrendben. `null`, ha a thread NEM LÉTEZIK; üres tömb, ha
 * létezik, de még nincs üzenete — a kettő különbsége a 404 és a 200 különbsége.
 * A LEFT JOIN miatt ez EGY lekérdezés: külön létezés-ellenőrzés nem kell.
 */
export async function loadThread(
  threadId: string,
  deps: DbChatDeps = {},
): Promise<StoredMessage[] | null> {
  const id = assertThreadId(threadId);
  const result = await queryChat<{
    id: number | null;
    role: MessageRole | null;
    parts: unknown[] | null;
  }>(
    `SELECT m.id, m.role, m.parts
     FROM threads t
     LEFT JOIN messages m ON m.thread_id = t.id
     WHERE t.id = $1::uuid
     ORDER BY m.id ASC`,
    [id],
    deps,
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows
    .filter((row) => row.id !== null)
    .map((row) => ({
      id: row.id as number,
      role: row.role as MessageRole,
      parts: (row.parts ?? []) as readonly unknown[],
    }));
}

/** A legutóbb frissített beszélgetések — ez táplálja a webes thread-listát. */
export async function listThreads(
  limit: number = THREAD_LIST_LIMIT,
  deps: DbChatDeps = {},
): Promise<ThreadSummary[]> {
  const result = await queryChat<{
    id: string;
    title: string;
    updated_at: Date;
  }>(
    `SELECT id, title, updated_at
     FROM threads
     ORDER BY updated_at DESC
     LIMIT $1`,
    [Math.min(limit, THREAD_LIST_LIMIT)],
    deps,
  );

  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: row.updated_at.toISOString(),
  }));
}

/**
 * A tár PORTJA — a négy művelet objektumba fogva. Ezt injektálják a felületek tesztjei,
 * így a szerver route-jai VALÓDI HTTP-n tesztelhetők adatbázis nélkül (ugyanaz a minta,
 * mint az `ask` injektálása az app.ts-ben).
 */
export interface ThreadStore {
  createThread(title: string): Promise<string>;
  appendMessage(
    threadId: string,
    role: MessageRole,
    parts: readonly unknown[],
  ): Promise<void>;
  loadThread(threadId: string): Promise<StoredMessage[] | null>;
  listThreads(limit?: number): Promise<ThreadSummary[]>;
}

/** A valódi tár port-alakban — a felületek alapértelmezése. */
export const defaultThreadStore: ThreadStore = {
  createThread: (title) => createThread(title),
  appendMessage: (threadId, role, parts) =>
    appendMessage(threadId, role, parts),
  loadThread: (threadId) => loadThread(threadId),
  listThreads: (limit) => listThreads(limit),
};
