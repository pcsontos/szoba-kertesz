// cases.ts — a tesztesetek betöltése és VALIDÁLÁSA. A rendszerhatár itt van: a JSON kívülről
// jön (kézzel szerkesztik), tehát Zod, fail-fast, magyar hibaüzenettel.
//
// A `strict()` a lényeg: egy elgépelt `redFlag` (a `redFlags` helyett) némán azt jelentené,
// hogy az eset ELLENŐRZÉS NÉLKÜL fut le — és zölden. A kurzus itt kézzel írt validátort
// használ, mert az ő szkriptjeik a workspace-en kívül futnak és a Zod nem oldható fel; nálunk
// a csomag workspace-tag, a konvenció pedig Zodot ír elő a rendszerhatáron.
//
// Az `import.meta.url` itt megengedett: ez a csomag ESM és soha nem bundle-özzük. Az
// `apps/cli`-ben ugyanez fordítási hiba lenne (CJS build), ott ezért van `findRepoPath`.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const ExpectSchema = z
  .object({
    /** Legalább az egyiknek szerepelnie kell a válaszban. */
    includesAny: z.array(z.string().min(1)).min(1).optional(),
    /** Egyik sem szerepelhet a válaszban. */
    excludesAll: z.array(z.string().min(1)).min(1).optional(),
    /** Emberi leírás a helyes válaszról — a riportban megjelenik. */
    truth: z.string().min(1),
  })
  .strict();

const QuestionSchema = z
  .object({
    id: z.string().min(1),
    q: z.string().min(1),
    redFlags: z.array(z.string().min(1)).optional(),
    expect: ExpectSchema.optional(),
    /** SQL execution accuracy: a referencia-SQL egy név-HALMAZT ad. */
    sqlCheck: z.object({ sql: z.string().min(1) }).strict().optional(),
    /** RAG-grounding: elvárt tool-kártya a válasz felett. */
    expectTool: z.enum(['runSql', 'searchKnowledge', 'queryCustomers']).optional(),
  })
  .strict();

const ConversationSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    steps: z.array(z.string().min(1)).min(1),
    redFlags: z.array(z.string().min(1)).optional(),
    expect: ExpectSchema.optional(),
    /** A körök után újratöltjük a beszélgetést `?thread=`-del, és ott folytatjuk. */
    restore: z.boolean().optional(),
    /** Determinisztikus DB-ellenőrzés a szöveg helyett. */
    verifyDb: z.literal('messages-saved').optional(),
    truth: z.string().min(1).optional(),
    idealTurns: z.number().int().positive().optional(),
  })
  .strict();

const TierSchema = z
  .object({
    name: z.string().min(1),
    intent: z.string().min(1),
    questions: z.array(QuestionSchema).optional(),
    conversations: z.array(ConversationSchema).optional(),
  })
  .strict();

const BatteryCasesSchema = z.object({ tiers: z.array(TierSchema).min(1) }).strict();

const RagCaseSchema = z
  .object({
    id: z.string().min(1),
    question: z.string().min(1),
    /** Kurált referencia-válasz — enélkül a context recall értelmezhetetlen. */
    groundTruth: z.string().min(1),
  })
  .strict();

const RagCasesSchema = z.object({ cases: z.array(RagCaseSchema).min(1) }).strict();

export type Expect = z.infer<typeof ExpectSchema>;
export type BatteryQuestion = z.infer<typeof QuestionSchema>;
export type BatteryConversation = z.infer<typeof ConversationSchema>;
export type BatteryTier = z.infer<typeof TierSchema>;
export type RagCase = z.infer<typeof RagCaseSchema>;

/**
 * A hibaüzenet MEGNEVEZI a hibás mezőt és az elgépelt kulcsot: egy puszta „invalid input"
 * 29 eset között használhatatlan lenne. A kulcsot a Zod maga beleírja az üzenetbe
 * (`Unrecognized key: "redFlag"`), ezért itt csak az ÚTVONAL kerül elé.
 */
function describeError(fileName: string, error: unknown): Error {
  const detail =
    error instanceof z.ZodError
      ? error.issues
          .map((issue) => {
            const path = issue.path.join('.');
            return `${path === '' ? '(gyökér)' : path}: ${issue.message}`;
          })
          .join('; ')
      : String(error);
  return new Error(
    `A ${fileName} érvénytelen — elgépelt kulcs vagy hiányzó mező? ${detail}`,
  );
}

export function parseBatteryCases(raw: unknown): BatteryTier[] {
  try {
    return BatteryCasesSchema.parse(raw).tiers;
  } catch (error) {
    throw describeError('battery-cases.json', error);
  }
}

export function parseRagCases(raw: unknown): RagCase[] {
  try {
    return RagCasesSchema.parse(raw).cases;
  } catch (error) {
    throw describeError('rag-cases.json', error);
  }
}

const casesDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cases');

function readCases(fileName: string): unknown {
  return JSON.parse(readFileSync(join(casesDir, fileName), 'utf8'));
}

export function loadBatteryCases(): BatteryTier[] {
  return parseBatteryCases(readCases('battery-cases.json'));
}

export function loadRagCases(): RagCase[] {
  return parseRagCases(readCases('rag-cases.json'));
}
