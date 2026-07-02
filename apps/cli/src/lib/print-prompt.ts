import type { ChatMessage } from '@szoba-kertesz/core';

/**
 * A `--show-prompt` flag kimenete: a ténylegesen elküldött system promptot
 * és üzenet-tömböt írja ki a válasz elé, hogy a felhasználó lássa, pontosan
 * mit kapott a modell. Kizárólag a CLI (a termék felhasználói felülete)
 * hívja — a core réteg nem ír a konzolra.
 */
export function printPrompt(
  systemPrompt: string,
  messages: readonly ChatMessage[],
): void {
  console.log('--- system prompt ---');
  console.log(systemPrompt);
  console.log('--- üzenetek ---');
  console.log(JSON.stringify(messages, null, 2));
  console.log('----------------------');
}
