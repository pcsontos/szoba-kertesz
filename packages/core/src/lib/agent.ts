import Anthropic from '@anthropic-ai/sdk';
import { loadConfig, type Config } from './config.js';
import { SYSTEM_PROMPT } from './system-prompt.js';
import {
  logInteraction,
  type ChatMessage,
  type LogEntryInput,
  type UsageInfo,
} from './logger.js';

// Szándékosan kicsi és rögzített (B2: nincs streaming, nincs retry, nincs
// tool-scaffolding) — ha a B3 tool-hurok miatt indokolt lesz, akkor válik
// konfigurálhatóvá.
const MAX_TOKENS = 1024;

export interface AskAgentDeps {
  readonly client?: Anthropic;
  readonly config?: Config;
  readonly log?: (entry: LogEntryInput) => Promise<void>;
}

export interface AskAgentResult {
  readonly answer: string;
  readonly systemPrompt: string;
  readonly messages: readonly ChatMessage[];
  readonly usage: UsageInfo;
}

/**
 * Egyetlen, tool nélküli `messages.create` hívás az Anthropic SDK hivatalos
 * kliensén keresztül: a Szobakertész "no-tool" system promptjával
 * (`SYSTEM_PROMPT`) és a felhasználó kérdésével, egyetlen user üzenetként.
 * Nincs adatbázis-hozzáférés, nincs beszélgetés-előzmény — minden hívás
 * önálló, egy körös interakció.
 *
 * Minden hívást naplóz (`logInteraction`) a transzparencia-elv miatt, a
 * megjelenítést (pl. `--show-prompt`, a válasz kiírása) a hívóra (CLI)
 * bízza — a core réteg nem ismeri a belépési pontját.
 */
export async function askAgent(
  question: string,
  deps: AskAgentDeps = {},
): Promise<AskAgentResult> {
  const config = deps.config ?? loadConfig();
  const client =
    deps.client ?? new Anthropic({ apiKey: config.anthropicApiKey });
  const log = deps.log ?? logInteraction;

  const messages: ChatMessage[] = [{ role: 'user', content: question }];

  const response = await client.messages.create({
    model: config.anthropicModel,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages,
  });

  const answer = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text.trim())
    .join('\n')
    .trim();

  const usage: UsageInfo = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };

  await log({
    systemPrompt: SYSTEM_PROMPT,
    messages,
    answer,
    usage,
  });

  return {
    answer,
    systemPrompt: SYSTEM_PROMPT,
    messages,
    usage,
  };
}
