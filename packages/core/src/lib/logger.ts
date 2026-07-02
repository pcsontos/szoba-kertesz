import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export interface UsageInfo {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LogEntryInput {
  readonly systemPrompt: string;
  readonly messages: readonly ChatMessage[];
  readonly answer: string;
  readonly usage: UsageInfo;
}

let cachedSessionLogFilePath: string | undefined;

/**
 * Egy adott folyamaton (egy `ask` hívás vagy egy interaktív munkamenet)
 * belül mindig ugyanazt a logfájl-elérési utat adja vissza — így egy
 * munkamenet több interakciója valódi JSONL-ként (több sor, egy fájl)
 * kerül naplózásra. A fájlnév az első híváskor rögzül, `process.cwd()`
 * alatti `logs/<ISO-szerű-timestamp>.jsonl` alakban.
 */
export function getSessionLogFilePath(): string {
  if (!cachedSessionLogFilePath) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    cachedSessionLogFilePath = join(
      process.cwd(),
      'logs',
      `${timestamp}.jsonl`,
    );
  }
  return cachedSessionLogFilePath;
}

/**
 * Naplóz egy agent-interakciót (system prompt, üzenetek, válasz,
 * token-felhasználás) JSONL-sorként. Létrehozza a célkönyvtárat, ha még
 * nem létezik. `filePath` alapból a munkamenet közös logfájlja
 * (`getSessionLogFilePath()`); teszteléshez felülírható.
 */
export async function logInteraction(
  entry: LogEntryInput,
  filePath: string = getSessionLogFilePath(),
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  await appendFile(filePath, `${line}\n`, 'utf8');
}
