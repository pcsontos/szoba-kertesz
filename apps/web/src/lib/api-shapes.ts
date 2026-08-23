// api-shapes.ts — a SZERVER VÁLASZÁNAK határa.
//
// A `/api/chat` kérés-oldalát a #4-es review óta Zod védi a szerveren. A válasz-oldal
// viszont sokáig validálatlan volt a böngészőben, pedig a hibaválasz IS JSON: a
// `threads.ts` 500-nál `{ error: … }`-t küld, tehát a `response.json()` SIKERREL lefut,
// és a `threads` mező egyszerűen hiányzik. Egy `setThreads(undefined)` után a
// `ThreadList` `threads.length`-je dob — és nem a sáv tűnik el, hanem az egész felület.
//
// Ez a két tiszta függvény ezért nem díszítés: ez a különbség egy üres lista és egy
// fehér képernyő között. (A #8 PR review 1. tétele.)

import type { ThreadSummary } from '../components/thread-list.js';

/** A chat csak ezt a két szerepet tudja buborékként megjeleníteni. */
const RENDERABLE_ROLES = ['user', 'assistant'];

export interface StoredUiMessage {
  readonly id: string;
  readonly role: string;
  readonly parts: readonly unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toArray(body: unknown, key: string): unknown[] {
  if (isRecord(body) && Array.isArray(body[key])) {
    return body[key];
  }
  return [];
}

/** A `GET /api/threads` válasza → a sáv listája. Hibás alakra ÜRES lista. */
export function toThreadSummaries(body: unknown): ThreadSummary[] {
  return toArray(body, 'threads').flatMap((row) => {
    if (
      isRecord(row) &&
      typeof row['id'] === 'string' &&
      typeof row['title'] === 'string' &&
      typeof row['updatedAt'] === 'string'
    ) {
      return [
        { id: row['id'], title: row['title'], updatedAt: row['updatedAt'] },
      ];
    }
    return [];
  });
}

/**
 * A `GET /api/threads/:id` válasza → a chat üzenetei. A `parts` szándékosan
 * `unknown[]` marad: a tár a teljes `UIMessage.parts`-ot őrzi, aminek az alakja az
 * SDK-tól jön, és a `splitAssistantParts` úgyis csak arra a mezőre támaszkodik, amit
 * ténylegesen használ.
 */
export function toStoredMessages(body: unknown): StoredUiMessage[] {
  return toArray(body, 'messages').flatMap((row) => {
    if (
      isRecord(row) &&
      typeof row['role'] === 'string' &&
      RENDERABLE_ROLES.includes(row['role']) &&
      Array.isArray(row['parts'])
    ) {
      return [
        { id: String(row['id']), role: row['role'], parts: row['parts'] },
      ];
    }
    return [];
  });
}
