import { loadConfig } from './config.js';

const READONLY_URL = 'postgresql://ro:ro@localhost:5433/szoba-kertesz';
const READWRITE_URL = 'postgresql://rw:rw@localhost:5433/szoba-kertesz';

describe('loadConfig', () => {
  it('returns the API key, the configured model and the read-only DB URL from env', () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
      DATABASE_URL_READONLY: READONLY_URL,
    });

    expect(config).toEqual({
      anthropicApiKey: 'sk-ant-test-key',
      anthropicModel: 'claude-sonnet-4-6',
      databaseUrlReadonly: READONLY_URL,
    });
  });

  it('falls back to the default model when ANTHROPIC_MODEL is not set', () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DATABASE_URL_READONLY: READONLY_URL,
    });

    expect(config.anthropicModel).toEqual('claude-sonnet-4-6');
  });

  it('throws a Hungarian, fail-fast error when ANTHROPIC_API_KEY is missing', () => {
    expect(() =>
      loadConfig({ DATABASE_URL_READONLY: READONLY_URL }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('throws when ANTHROPIC_API_KEY is an empty string', () => {
    expect(() =>
      loadConfig({
        ANTHROPIC_API_KEY: '',
        DATABASE_URL_READONLY: READONLY_URL,
      }),
    ).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('throws a Hungarian, fail-fast error when DATABASE_URL_READONLY is missing', () => {
    expect(() =>
      loadConfig({ ANTHROPIC_API_KEY: 'sk-ant-test-key' }),
    ).toThrow(/DATABASE_URL_READONLY/);
  });

  it('reads DATABASE_URL_READONLY into the config, but never DATABASE_URL (the admin/RW one)', () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DATABASE_URL: 'postgresql://admin:secret@localhost:5433/szoba-kertesz',
      DATABASE_URL_READONLY: READONLY_URL,
    });

    expect(config.databaseUrlReadonly).toEqual(READONLY_URL);
    expect(config).not.toHaveProperty('databaseUrl');
    expect(Object.keys(config).sort()).toEqual([
      'anthropicApiKey',
      'anthropicModel',
      'databaseUrlReadWrite',
      'databaseUrlReadonly',
    ]);
  });

  it('reads DATABASE_URL_READWRITE when given, but stays optional without it', () => {
    // A harmadik jogosultsági szint (szoba-kertesz_rw) CSAK az ingest-agenté.
    // Opcionális, mert a kérdés-válasz oldalnak nem kell: aki csak kérdezni
    // akar, ne bukjon el a hiányán — a hiányt a db-readwrite.ts jelzi, ott,
    // ahol tényleg számít.
    const withRw = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DATABASE_URL: 'postgresql://admin:secret@localhost:5433/szoba-kertesz',
      DATABASE_URL_READONLY: READONLY_URL,
      DATABASE_URL_READWRITE: READWRITE_URL,
    });
    const withoutRw = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DATABASE_URL_READONLY: READONLY_URL,
    });

    expect(withRw.databaseUrlReadWrite).toEqual(READWRITE_URL);
    expect(withoutRw.databaseUrlReadWrite).toBeUndefined();
    // Az admin-kapcsolat egyik ágon sem szivárog be.
    expect(withRw).not.toHaveProperty('databaseUrl');
  });
});
