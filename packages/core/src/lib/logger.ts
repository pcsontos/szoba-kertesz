import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/**
 * Egy `assistant` üzenet szöveges tartalom-blokkja.
 */
export interface ChatTextBlock {
  readonly type: 'text';
  readonly text: string;
}

/**
 * Egy `assistant` üzenet tool-hívás blokkja (pl. a `runSql` meghívása egy
 * adott SQL-lel) — a modell generálja, a tool-use hurok (`agent.ts`)
 * futtatja le.
 */
export interface ChatToolUseBlock {
  readonly type: 'tool_use';
  readonly id: string;
  readonly name: string;
  readonly input: unknown;
}

/**
 * Egy `user` üzenetben visszaküldött tool-eredmény blokk — a tool
 * lefuttatásának kimenete (siker esetén a sorok, hiba esetén az
 * `is_error: true` jelölés és a hibaüzenet).
 */
export interface ChatToolResultBlock {
  readonly type: 'tool_result';
  readonly tool_use_id: string;
  readonly content: string;
  readonly is_error?: boolean;
}

export type ChatMessageContentBlock =
  | ChatTextBlock
  | ChatToolUseBlock
  | ChatToolResultBlock;

/**
 * B2-ben (tool nélküli agent) `content` mindig egyszerű string volt. B3-tól
 * a tool-use hurok miatt egy üzenet tartalma strukturált blokk-tömb is
 * lehet (szöveg + tool_use, vagy tool_result blokkok) — a `--show-prompt`
 * kiírás (`apps/cli/src/lib/print-prompt.ts`) ettől függetlenül működik,
 * mert `JSON.stringify`-jal ír ki, a `content` pontos alakjától függetlenül.
 */
export interface ChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string | readonly ChatMessageContentBlock[];
}

export interface UsageInfo {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

/**
 * Egyetlen `runSql` tool-lépés naplózható lenyomata (B3.6): a ténylegesen
 * lefuttatott (LIMIT-tel kiegészített) SQL, a kimenetel, és — siker esetén —
 * a visszakapott sorok száma. A `resultSummary` a modellnek ténylegesen
 * elküldött `tool_result` tartalom (siker esetén a sorok JSON-ja, hiba
 * esetén a hibaüzenet), hogy a JSONL-ből pontosan visszakövethető legyen,
 * mit "látott" a modell.
 */
export interface ToolStep {
  readonly toolName: string;
  readonly input: unknown;
  readonly sql?: string;
  readonly ok: boolean;
  readonly rowCount?: number;
  readonly resultSummary: string;
}

export interface LogEntryInput {
  readonly systemPrompt: string;
  readonly messages: readonly ChatMessage[];
  readonly answer: string;
  readonly usage: UsageInfo;
  readonly toolSteps: readonly ToolStep[];
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
