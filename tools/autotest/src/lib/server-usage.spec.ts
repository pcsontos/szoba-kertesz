import { describe, expect, it } from 'vitest';
import { readUsageSince, type UsageDeps } from './server-usage.js';

function deps(files: { path: string; mtimeMs: number; body: string }[]): UsageDeps {
  return {
    listFiles: () => files.map((file) => ({ path: file.path, mtimeMs: file.mtimeMs })),
    readFile: (path) => files.find((file) => file.path === path)?.body ?? '',
    sleep: async () => undefined,
  };
}

describe('readUsageSince', () => {
  it('a küszöb UTÁN írt trace tokenjeit összegzi', async () => {
    const usage = await readUsageSince(
      100,
      1,
      deps([
        { path: 'a.json', mtimeMs: 50, body: '{"usage":{"inputTokens":999,"outputTokens":9}}' },
        {
          path: 'b.json',
          mtimeMs: 200,
          body: '{"usage":{"inputTokens":8000,"outputTokens":120}}',
        },
      ]),
    );
    expect(usage).toEqual({ inputTokens: 8000, outputTokens: 120 });
  });

  it('több fájlt összead (delegálásnál két trace keletkezik)', async () => {
    const usage = await readUsageSince(
      0,
      2,
      deps([
        { path: 'a.json', mtimeMs: 10, body: '{"usage":{"inputTokens":100,"outputTokens":10}}' },
        { path: 'b.json', mtimeMs: 20, body: '{"usage":{"inputTokens":200,"outputTokens":20}}' },
      ]),
    );
    expect(usage).toEqual({ inputTokens: 300, outputTokens: 30 });
  });

  it('a hibás JSON-t átugorja, nem dob', async () => {
    const usage = await readUsageSince(
      0,
      1,
      deps([
        { path: 'a.json', mtimeMs: 10, body: 'nem json' },
        { path: 'b.json', mtimeMs: 20, body: '{"usage":{"inputTokens":5,"outputTokens":1}}' },
      ]),
    );
    expect(usage).toEqual({ inputTokens: 5, outputTokens: 1 });
  });

  it('ha nem jön elég fájl, NULL — nem nulla', async () => {
    // A 0 azt hazudná, hogy a kérdés ingyen volt.
    await expect(readUsageSince(0, 1, deps([]))).resolves.toBeNull();
  });

  it('az input és az output KÜLÖN marad', async () => {
    // A Sonnet output-ára 5x az inputénak — összeadva a költségbecslés értelmét vesztené.
    const usage = await readUsageSince(
      0,
      1,
      deps([
        { path: 'a.json', mtimeMs: 10, body: '{"usage":{"inputTokens":8000,"outputTokens":120}}' },
      ]),
    );
    expect(usage?.inputTokens).toBe(8000);
    expect(usage?.outputTokens).toBe(120);
  });
});
