import { z } from 'zod';

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
  DATABASE_URL_READONLY: z.string().min(1),
  // Csak az ingest-agent írási útjához kell — a query-agent enélkül is fut,
  // ezért OPCIONÁLIS: aki csak kérdezni akar, ne bukjon el a hiányán.
  // A hiányát a db-readwrite.ts jelzi, fail-fast, érthető magyar üzenettel.
  DATABASE_URL_READWRITE: z.string().min(1).optional(),
});

export interface Config {
  readonly anthropicApiKey: string;
  readonly anthropicModel: string;
  readonly databaseUrlReadonly: string;
  readonly databaseUrlReadWrite?: string;
}

/**
 * Betölti és validálja az agenshez szükséges konfigurációt.
 *
 * A core réteg sosem tölt fájlt (pl. `.env`-et) — ez a belépési pont (CLI)
 * felelőssége. Ez a függvény kizárólag a már beállított környezeti
 * változókat (alapból `process.env`) validálja Zod-dal, fail-fast: hibás
 * vagy hiányzó kötelező érték esetén azonnal, egyértelmű magyar
 * hibaüzenettel dob.
 *
 * HÁROM jogosultsági szint van, és ez a függvény ebből KETTŐT lát:
 *   - `DATABASE_URL_READONLY`  — a `szoba-kertesz_ro` szerep; a query-agent
 *     `runSql`/`listCategories` toolja (`run-sql/db-readonly.ts`). KÖTELEZŐ.
 *   - `DATABASE_URL_READWRITE` — a `szoba-kertesz_rw` szerep; KIZÁRÓLAG az
 *     ingest-agent `upsertProduct` útja (`upsert-product/db-readwrite.ts`).
 *     OPCIONÁLIS, mert a kérdés-válasz oldal enélkül is teljesen működik.
 *
 * A harmadik, a `DATABASE_URL` (admin/Prisma) SOSEM kerül ide: ez a függvény
 * nem olvassa ki és nem adja vissza — azt kizárólag a Prisma (packages/db)
 * kezeli, és egyik agent sem ír rajta keresztül.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const missingOrInvalid = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(
      `Hibás vagy hiányzó környezeti változó(k): ${missingOrInvalid.join(', ')}. ` +
        'Ellenőrizd a .env fájlt (vagy a shell környezeti változóit) — az ANTHROPIC_API_KEY és a DATABASE_URL_READONLY kitöltése kötelező.',
    );
  }

  return {
    anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
    anthropicModel: parsed.data.ANTHROPIC_MODEL,
    databaseUrlReadonly: parsed.data.DATABASE_URL_READONLY,
    databaseUrlReadWrite: parsed.data.DATABASE_URL_READWRITE,
  };
}
