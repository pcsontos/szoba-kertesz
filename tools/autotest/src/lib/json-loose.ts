// json-loose.ts — JSON kinyerése egy LLM-judge szabad szövegéből. Külön modul, mert ez a
// leggyakoribb néma hibaforrás: ha a parse elbukik és üres tömböt adunk vissza, a metrika
// 0 lesz — ami MÉRÉSI EREDMÉNYNEK látszik, holott parse-hiba. Ezért ad `null`-t, nem `[]`-t.

/**
 * Laza JSON-parse: kódfence le, majd kiegyensúlyozott, STRING-TUDATOS zárójel-illesztéssel
 * vágjuk ki az első teljes `[...]` / `{...}` blokkot. A LEGELÖL álló nyitó zárójelből indulunk,
 * különben egy `{"questions":[...]}` alakból a belső tömböt vágnánk ki.
 */
export function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```json\s*|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Tovább a kivágásra.
  }

  const pairs = (
    [
      ['[', ']'],
      ['{', '}'],
    ] as const
  )
    .slice()
    .sort((a, b) => {
      const indexA = cleaned.indexOf(a[0]);
      const indexB = cleaned.indexOf(b[0]);
      return (indexA < 0 ? Infinity : indexA) - (indexB < 0 ? Infinity : indexB);
    });

  for (const [open, close] of pairs) {
    const start = cleaned.indexOf(open);
    if (start < 0) {
      continue;
    }
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < cleaned.length; index++) {
      const character = cleaned[index];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === '\\') {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }
      if (character === '"') {
        inString = true;
      } else if (character === open) {
        depth++;
      } else if (character === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(cleaned.slice(start, index + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}

/**
 * Tömbbé alakítás: a judge néha objektumba csomagolja a tömböt (`{"claims":[...]}`). Bare-tömb
 * feltételezéssel minden állítás „nem támogatott" lenne — hamis 1.00 noise sensitivity.
 */
export function coerceArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value !== null && typeof value === 'object') {
    const nested = Object.values(value as Record<string, unknown>).find((entry) =>
      Array.isArray(entry),
    );
    if (nested !== undefined) {
      return nested as T[];
    }
  }
  return [];
}
