// server-usage.ts — A KÉRDÉS TOKEN-KÖLTSÉGE. A böngésző nem látja a tokent; a szerver viszont
// kérdésenként ír egy logs/<ts>.json trace-t `usage.inputTokens` / `usage.outputTokens`
// mezővel (mérve a repó saját logjaiban). A battery szekvenciális — egyszerre egy kérés —,
// ezért a kérdés kezdete UTÁN keletkezett fájlok összege pontos per-kérdés érték.
//
// Az input és az output KÜLÖN marad (a kurzus összeadta): a Sonnet output-ára 5× az inputénak,
// összeadva a költségbecslés értelmét vesztené.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface UsageDeps {
  readonly listFiles?: () => { path: string; mtimeMs: number }[];
  readonly readFile?: (path: string) => string;
  readonly sleep?: (ms: number) => Promise<void>;
}

const LOG_DIR = 'logs';
const MAX_ATTEMPTS = 25;
const POLL_MS = 200;

function defaultListFiles(): { path: string; mtimeMs: number }[] {
  try {
    return readdirSync(LOG_DIR)
      .filter((name) => name.endsWith('.json'))
      .map((name) => join(LOG_DIR, name))
      .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }));
  } catch {
    return [];
  }
}

/**
 * A `sinceMs` után írt trace-ek usage-e. NULL, ha a várakozás alatt nem jött elég fájl —
 * a 0 azt hazudná, hogy a kérdés ingyen volt.
 */
export async function readUsageSince(
  sinceMs: number,
  minFiles = 1,
  deps: UsageDeps = {},
): Promise<Usage | null> {
  const listFiles = deps.listFiles ?? defaultListFiles;
  const readFile = deps.readFile ?? ((path: string) => readFileSync(path, 'utf8'));
  const sleep =
    deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const recent = listFiles().filter((file) => file.mtimeMs > sinceMs);
    if (recent.length >= minFiles) {
      let inputTokens = 0;
      let outputTokens = 0;
      for (const file of recent) {
        try {
          const parsed = JSON.parse(readFile(file.path)) as {
            usage?: { inputTokens?: number; outputTokens?: number };
          };
          inputTokens += parsed.usage?.inputTokens ?? 0;
          outputTokens += parsed.usage?.outputTokens ?? 0;
        } catch {
          // Hibás vagy félig kiírt trace — átugorjuk, egy fájl ne vigye el a mérést.
        }
      }
      return { inputTokens, outputTokens };
    }
    await sleep(POLL_MS);
  }
  return null;
}
