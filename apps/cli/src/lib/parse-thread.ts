import { ThreadIdSchema } from '@szoba-kertesz/core';

/**
 * A `--thread` kapcsoló értékének validálása a rendszer HATÁRÁN (a CLI a külvilág),
 * a `parse-role.ts` mintájára. A commander mindent stringként ad tovább, ezért a
 * bemenet `unknown`-ként jön be.
 */
export function parseThreadId(value: unknown): string {
  const parsed = ThreadIdSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  throw new Error(
    `Érvénytelen beszélgetés-azonosító: "${String(value)}". ` +
      'UUID-t várunk — azt írja ki az interaktív mód induláskor.',
  );
}
