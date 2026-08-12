import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/**
 * A `getClientPreferences` tool: ügyfélkód alapján adja vissza az ügyfél
 * preferenciáit — a büdzsét (Ft) és a preferált növény-igényességet
 * (mennyire gondozásigényes növényt szeret).
 *
 * Ez a lecke szerkezeti tanulsága: egy nem-SQL-es, második tool hozzáadása
 * NEM érinti az agent-loopot. Egy fájl + két sor a `tools/index.ts`-ben.
 *
 * A `CLIENT_PREFERENCES` az EGYETLEN forrás — ebből származik a tool-séma
 * `enum`-ja ÉS a Zod-guard is, így a kettő nem csúszhat el.
 */

export const GET_CLIENT_PREFERENCES_TOOL_NAME = 'getClientPreferences';

/** A növény gondozási igényessége — ennyire igényes növényt preferál az ügyfél. */
export const CARE_LEVELS = ['ALACSONY', 'KÖZEPES', 'MAGAS'] as const;
export type CareLevel = (typeof CARE_LEVELS)[number];

export interface ClientPreference {
  /** Rendelkezésre álló büdzsé forintban. */
  readonly budget: number;
  /** A preferált növény igényessége (gondozási igény). */
  readonly careLevel: CareLevel;
}

/** Ügyfélkód → preferenciák. Egyelőre fix tábla; később jöhet mögé config/DB. */
export const CLIENT_PREFERENCES = {
  ACME: { budget: 1000, careLevel: 'ALACSONY' },
  GLOBEX: { budget: 5000, careLevel: 'KÖZEPES' },
  INITECH: { budget: 250000, careLevel: 'MAGAS' },
} as const satisfies Record<string, ClientPreference>;

export type ClientCode = keyof typeof CLIENT_PREFERENCES;

/** Az enum értékei — a térkép kulcsaiból, nem duplikálva. Nem üres tuple a z.enum kedvéért. */
export const CLIENT_CODES = Object.keys(CLIENT_PREFERENCES) as [
  ClientCode,
  ...ClientCode[],
];

export const getClientPreferencesToolDefinition: Anthropic.Tool = {
  name: GET_CLIENT_PREFERENCES_TOOL_NAME,
  description:
    'Visszaadja egy adott ügyfél preferenciáit: a büdzsét forintban és a preferált növény ' +
    'igényességét (ALACSONY | KÖZEPES | MAGAS gondozási igény). A clientCode a kötelező ' +
    'ügyfélkód. Csak a felsorolt ügyfélkódok érvényesek.',
  input_schema: {
    type: 'object',
    properties: {
      clientCode: {
        type: 'string',
        enum: [...CLIENT_CODES],
        description: 'Az ügyfél kódja, amelyhez a preferenciákat kérjük.',
      },
    },
    required: ['clientCode'],
  },
};

export interface ClientPreferencesToolSuccess {
  readonly ok: true;
  readonly clientCode: ClientCode;
  readonly preference: ClientPreference;
}

export interface ClientPreferencesToolFailure {
  readonly ok: false;
  readonly error: string;
}

export type ClientPreferencesToolResult =
  | ClientPreferencesToolSuccess
  | ClientPreferencesToolFailure;

const ClientPreferencesInputSchema = z.object({
  clientCode: z.enum(CLIENT_CODES),
});

/**
 * A tool-hívás végrehajtása: validál (ismeretlen ügyfélkód → hiba), majd a
 * térképből visszaadja a preferenciákat. Soha nem dob — a hibát a modellnek
 * visszaadható szövegként adja tovább, a másik két toollal azonos alakban.
 */
export async function executeGetClientPreferencesTool(
  rawInput: unknown,
): Promise<ClientPreferencesToolResult> {
  const parsed = ClientPreferencesInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      ok: false,
      error:
        'Ismeretlen vagy hiányzó ügyfélkód. Érvényes kódok: ' +
        CLIENT_CODES.join(', '),
    };
  }

  return {
    ok: true,
    clientCode: parsed.data.clientCode,
    preference: CLIENT_PREFERENCES[parsed.data.clientCode],
  };
}
