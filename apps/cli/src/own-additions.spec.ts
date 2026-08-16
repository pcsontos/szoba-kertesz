/**
 * REGRESSZIÓS MANIFESZT (cli) — a CLI-oldali saját kiegészítések, amiknek
 * nincs megfelelője a kurzus-repóban.
 *
 * NE TÖRÖLD refaktornál. Ha egy kurzus-lépés törölné (a 03. alkalom például
 * a `--show-prompt`-ot feleslegesnek nyilvánítja), az T3-eltérés: megállás és
 * jelzés, nem felülírás.
 *
 * A részletes viselkedést az `interactive.spec.ts` fedi; ez a fájl a
 * MEGLÉTET rögzíti, hogy egy refaktor ne tudja némán elvinni.
 */
import { PassThrough } from 'node:stream';
import type { AskAgentResult } from '@szoba-kertesz/core';
import { runInteractive } from './interactive.js';

function makeResult(answer: string): AskAgentResult {
  return {
    answer,
    systemPrompt: '<role>teszt</role>',
    messages: [{ role: 'user', content: 'teszt kérdés' }],
    usage: { inputTokens: 1, outputTokens: 2 },
    toolSteps: [],
    stopReason: 'stop',
  };
}

/** A queue-feldolgozó async ciklus több mikrotask-körben fut le. */
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((res) => setImmediate(res));
  }
}

describe('saját kiegészítés 4 — readline-guard a pufferelt sorokra', () => {
  let input: PassThrough;
  let output: PassThrough;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    input = new PassThrough();
    output = new PassThrough();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('egyetlen chunkban érkező sorokat sem futtat párhuzamosan', async () => {
    let active = 0;
    let maxActive = 0;
    const resolvers: Array<() => void> = [];
    const ask = vi.fn((question: string): Promise<AskAgentResult> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise<AskAgentResult>((resolve) => {
        resolvers.push(() => {
          active -= 1;
          resolve(makeResult(`válasz: ${question}`));
        });
      });
    });

    const done = runInteractive({ input, output, ask });

    // EGY chunkban két sor — a guard nélkül ezek egymásba futnának.
    input.write('első kérdés\nmásodik kérdés\n');
    await flushAsync();

    expect(ask).toHaveBeenCalledTimes(1);

    resolvers[0]();
    await flushAsync();
    resolvers[1]();
    await flushAsync();

    expect(ask.mock.calls.map((call) => call[0])).toEqual([
      'első kérdés',
      'második kérdés',
    ]);
    expect(maxActive).toBe(1);

    input.write('exit\n');
    await done;
  });
});

describe('saját kiegészítés 7 — --show-prompt', () => {
  let input: PassThrough;
  let output: PassThrough;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    input = new PassThrough();
    output = new PassThrough();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('showPrompt: true esetén kiírja a system promptot és az üzenet-tömböt', async () => {
    const ask = vi.fn().mockResolvedValue(makeResult('ok'));

    const done = runInteractive({ input, output, ask, showPrompt: true });
    input.write('teszt\n');
    await flushAsync();
    input.write('exit\n');
    await done;

    expect(logSpy).toHaveBeenCalledWith('--- system prompt ---');
    expect(logSpy).toHaveBeenCalledWith('--- üzenetek ---');
  });

  it('showPrompt nélkül nem dumpolja ki a promptot', async () => {
    const ask = vi.fn().mockResolvedValue(makeResult('ok'));

    const done = runInteractive({ input, output, ask });
    input.write('teszt\n');
    await flushAsync();
    input.write('exit\n');
    await done;

    expect(logSpy).not.toHaveBeenCalledWith('--- system prompt ---');
  });
});
