import { z } from 'zod';

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
  DATABASE_URL_READONLY: z.string().min(1),
});

export interface Config {
  readonly anthropicApiKey: string;
  readonly anthropicModel: string;
  readonly databaseUrlReadonly: string;
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
 * B3-tól kezdve a `runSql` tool (`db-readonly.ts`) miatt a `DATABASE_URL_READONLY`
 * is a kiolvasott kulcsok között van — de **csak** ez az egy, a
 * `szoba-kertesz_ro` read-only szerepkör kapcsolati stringje. A
 * `DATABASE_URL`-t (admin/RW, Prisma-nak való) ez a függvény sosem olvassa
 * ki és sosem adja vissza — azt kizárólag a Prisma (packages/db) kezeli.
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
  };
}
