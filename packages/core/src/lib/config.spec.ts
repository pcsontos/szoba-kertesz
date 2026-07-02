import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('returns the API key and the configured model from env', () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      ANTHROPIC_MODEL: 'claude-sonnet-4-6',
    });

    expect(config).toEqual({
      anthropicApiKey: 'sk-ant-test-key',
      anthropicModel: 'claude-sonnet-4-6',
    });
  });

  it('falls back to the default model when ANTHROPIC_MODEL is not set', () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
    });

    expect(config.anthropicModel).toEqual('claude-sonnet-4-6');
  });

  it('throws a Hungarian, fail-fast error when ANTHROPIC_API_KEY is missing', () => {
    expect(() => loadConfig({})).toThrow(/ANTHROPIC_API_KEY/);
  });

  it('throws when ANTHROPIC_API_KEY is an empty string', () => {
    expect(() => loadConfig({ ANTHROPIC_API_KEY: '' })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it('never reads DATABASE_URL or DATABASE_URL_READONLY into the returned config', () => {
    const config = loadConfig({
      ANTHROPIC_API_KEY: 'sk-ant-test-key',
      DATABASE_URL: 'postgresql://admin:secret@localhost:5433/szoba-kertesz',
      DATABASE_URL_READONLY: 'postgresql://ro:ro@localhost:5433/szoba-kertesz',
    });

    expect(config).not.toHaveProperty('databaseUrl');
    expect(config).not.toHaveProperty('databaseUrlReadonly');
    expect(Object.keys(config).sort()).toEqual([
      'anthropicApiKey',
      'anthropicModel',
    ]);
  });
});
