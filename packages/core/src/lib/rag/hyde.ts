import { generateText, type LanguageModel } from 'ai';
import { createAnthropic, type AnthropicProvider } from '@ai-sdk/anthropic';
import { loadConfig, type Config } from '../config.js';

// hyde.ts — HYPOTHETICAL DOCUMENT EMBEDDINGS ("hipotetikus válasz").
//
// A PROBLÉMA: a kérdés és a válasz NEM ugyanazon a nyelven beszél.
//   kérdés:  "miért hullanak le a leveleim?"        (rövid, kérdő, laikus)
//   válasz:  "Leaf drop is commonly caused by       (hosszú, kijelentő, szakszavas)
//             sudden temperature changes, underwatering, or acclimation stress…"
// A két szöveg vektora ezért TÁVOLABB van egymástól, mint gondolnád — pedig egymáshoz tartoznak.
//
// A TRÜKK: ne a kérdést keressük, hanem egy KITALÁLT VÁLASZT. Megkérünk egy kis modellt,
// hogy írjon egy rövid, magabiztos (akár téves!) választ a kérdésre — és EZT embeddeljük.
// A kitalált válasz ugyanazon a nyelven beszél, mint a valódi dokumentumok, ezért a vektora
// KÖZELEBB esik a jó chunkhoz. Nem baj, ha a tartalma hibás: nem ezt adjuk a felhasználónak,
// csak KERESÜNK vele. A választ mindig a megtalált, VALÓDI chunkokból írja meg a nagy modell.
//
// MODELL: Claude Haiku — a kurzus itt gpt-4.1-nano-t használ, de a rerank már Haikura váltott
// (00879d8), és így az OpenAI KIZÁRÓLAG az embeddinghez kell. A routing lényege ugyanaz:
// a kicsi modell keres, a nagy válaszol.

const HYDE_MODEL = 'claude-haiku-4-5';
const HYDE_MAX_TOKENS = 200;

// A modellnek szóló szöveg EGY BLOKKBAN — úgy szerkeszted, ahogy a modell látja.
const HYDE_PROMPT = `
Írj egy rövid (2-3 mondat), magabiztos szakaszt egy növénygondozási útmutatóból,
ami megválaszolja a kérdést.

Úgy fogalmazz, ahogy egy ilyen cikk írna: kijelentő mondatokkal, szakkifejezésekkel.
Angolul írj — a tudásbázis angol. Ne kérdezz vissza.
`.trim();

export interface HydeDeps {
  /** Teszt-szeam: kész modell (pl. `MockLanguageModelV4`) a valódi provider helyett. */
  readonly model?: LanguageModel;
  readonly config?: Config;
}

let provider: AnthropicProvider | null = null;

function resolveModel(deps: HydeDeps): LanguageModel {
  if (deps.model) {
    return deps.model;
  }
  const config = deps.config ?? loadConfig();
  if (!provider) {
    provider = createAnthropic({ apiKey: config.anthropicApiKey });
  }
  return provider(HYDE_MODEL);
}

/**
 * Kérdés → rövid, hipotetikus válasz (EZT embeddeljük keresésre, nem a kérdést).
 * Hiba esetén visszaadjuk az eredeti kérdést — a keresés sose álljon meg emiatt.
 */
export async function hypotheticalAnswer(
  question: string,
  deps: HydeDeps = {},
): Promise<string> {
  try {
    const { text } = await generateText({
      model: resolveModel(deps),
      system: HYDE_PROMPT,
      prompt: question,
      maxOutputTokens: HYDE_MAX_TOKENS,
    });
    return text.trim() || question;
  } catch {
    return question;
  }
}
