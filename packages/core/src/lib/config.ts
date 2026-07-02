import { z } from 'zod';

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
});

export interface Config {
  readonly anthropicApiKey: string;
  readonly anthropicModel: string;
}

/**
 * Betölti és validálja az LLM-hívásokhoz szükséges konfigurációt.
 *
 * A core réteg sosem tölt fájlt (pl. `.env`-et) — ez a belépési pont (CLI)
 * felelőssége. Ez a függvény kizárólag a már beállított környezeti
 * változókat (alapból `process.env`) validálja Zod-dal, fail-fast: hibás
 * vagy hiányzó kötelező érték esetén azonnal, egyértelmű magyar
 * hibaüzenettel dob.
 *
 * Szándékosan csak az LLM-híváshoz szükséges kulcsokat olvassa ki — a
 * `DATABASE_URL*` változókat sosem érinti, azokat a Prisma (packages/db)
 * kezeli.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);

  if (!parsed.success) {
    const missingOrInvalid = [
      ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
    ];
    throw new Error(
      `Hibás vagy hiányzó környezeti változó(k): ${missingOrInvalid.join(', ')}. ` +
        'Ellenőrizd a .env fájlt (vagy a shell környezeti változóit) — az ANTHROPIC_API_KEY kitöltése kötelező.',
    );
  }

  return {
    anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
    anthropicModel: parsed.data.ANTHROPIC_MODEL,
  };
}
