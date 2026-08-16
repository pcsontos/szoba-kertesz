import { describe, expect, it } from 'vitest';
import {
  CLIENT_CODES,
  CLIENT_PREFERENCES,
  executeGetClientPreferencesTool,
  getClientPreferencesToolDefinition,
} from './get-client-preferences-tool.js';

describe('getClientPreferences tool', () => {
  it('ismert ügyfélkódra visszaadja a büdzsét és az igényességet', async () => {
    const result = await executeGetClientPreferencesTool({
      clientCode: 'INITECH',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.clientCode).toBe('INITECH');
    expect(result.preference).toEqual({
      budget: 250000,
      careLevel: 'MAGAS',
    });
  });

  it('ismeretlen ügyfélkódra hibát ad, nem dob', async () => {
    const result = await executeGetClientPreferencesTool({
      clientCode: 'NINCSILYEN',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error).toContain('Érvényes kódok');
    expect(result.error).toContain('ACME');
  });

  it('hiányzó bemenetre is hibát ad', async () => {
    const result = await executeGetClientPreferencesTool({});
    expect(result.ok).toBe(false);
  });

  it('a tool-séma enumja a CLIENT_PREFERENCES kulcsaiból származik', () => {
    // A lecke kulcs-döntése: egy forrás, nincs duplikált felsorolás, ami
    // elcsúszhatna a Zod-guardtól.
    const properties = getClientPreferencesToolDefinition.input_schema
      .properties as {
      clientCode: { enum: readonly string[] };
    };

    expect(properties.clientCode.enum).toEqual(Object.keys(CLIENT_PREFERENCES));
    expect(properties.clientCode.enum).toEqual([...CLIENT_CODES]);
  });
});
