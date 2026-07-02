import { PassThrough } from 'node:stream';
import type { AskAgentResult } from '@szoba-kertesz/core';
import { runInteractive } from './interactive.js';

function makeResult(answer: string): AskAgentResult {
  return {
    answer,
    systemPrompt: '<role>teszt</role>',
    messages: [{ role: 'user', content: 'teszt kérdés' }],
    usage: { inputTokens: 1, outputTokens: 2 },
  };
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// Több mikrotask-kör kivárása: a queue-feldolgozó async ciklus lépései
// (await ask → console.log → rl.prompt) több körben futnak le.
async function flushAsync(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise((res) => setImmediate(res));
  }
}

describe('runInteractive', () => {
  let input: PassThrough;
  let output: PassThrough;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    input = new PassThrough();
    output = new PassThrough();
    // A banner/válasz/„Viszlát!” kiírás a console-on megy (nem a readline
    // output streamjén) — spy-oljuk, hogy assertálható és a tesztkimenet
    // tiszta legyen.
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('answers a question and exits cleanly on "exit"', async () => {
    const ask = vi.fn().mockResolvedValue(makeResult('a válasz'));

    const done = runInteractive({ input, output, ask });
    input.write('mi az a pozsgás?\n');
    await flushAsync();
    input.write('exit\n');
    await done;

    expect(ask).toHaveBeenCalledExactlyOnceWith('mi az a pozsgás?');
    expect(logSpy).toHaveBeenCalledWith('a válasz');
    expect(logSpy).toHaveBeenCalledWith('Viszlát!');
  });

  it('drops buffered lines arriving after exit/close without calling askAgent (B1 regression, 975bd88)', async () => {
    const ask = vi.fn().mockResolvedValue(makeResult('nem szabadna látszania'));

    const done = runInteractive({ input, output, ask });
    // Egyetlen chunkban érkező, pufferelt sorok: az `exit` után a readline
    // a close-t követően is emittálhatja a maradék sorokat — ezeket el kell
    // dobni: nem hívhatnak askAgent-et és nem dobhatnak ERR_USE_AFTER_CLOSE-t.
    input.write('exit\nfoo\nbar\n');
    await done;
    await flushAsync();

    expect(ask).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith('Viszlát!');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('still resolves and prints the answer of an in-flight question when exit arrives during the call', async () => {
    const deferred = createDeferred<AskAgentResult>();
    const ask = vi.fn().mockReturnValue(deferred.promise);

    const done = runInteractive({ input, output, ask });
    input.write('folyamatban lévő kérdés\n');
    await flushAsync();
    expect(ask).toHaveBeenCalledExactlyOnceWith('folyamatban lévő kérdés');

    // exit érkezik, miközben az askAgent hívás még függőben van
    input.write('exit\n');
    await done;
    expect(logSpy).toHaveBeenCalledWith('Viszlát!');
    expect(logSpy).not.toHaveBeenCalledWith('megkésett válasz');

    // a függőben lévő hívás ezután fejeződik be — a válaszának így is
    // meg kell jelennie, és nem dobhat ERR_USE_AFTER_CLOSE-t
    deferred.resolve(makeResult('megkésett válasz'));
    await flushAsync();

    expect(logSpy).toHaveBeenCalledWith('megkésett válasz');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('processes queued questions sequentially — a second line never starts an interleaved call', async () => {
    let active = 0;
    let maxActive = 0;
    const resolvers: Array<() => void> = [];
    const ask = vi.fn((question: string): Promise<AskAgentResult> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise<AskAgentResult>((resolve) => {
        resolvers.push(() => {
          active -= 1;
          resolve(makeResult(`válasz erre: ${question}`));
        });
      });
    });

    const done = runInteractive({ input, output, ask });
    input.write('első kérdés\n');
    input.write('második kérdés\n');
    await flushAsync();

    // amíg az első hívás függőben van, a második NEM indulhat el
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith('első kérdés');

    resolvers[0]();
    await flushAsync();

    // az első lezárulta után indul a második, sorrendben
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls.map((call) => call[0])).toEqual([
      'első kérdés',
      'második kérdés',
    ]);
    expect(logSpy).toHaveBeenCalledWith('válasz erre: első kérdés');

    resolvers[1]();
    await flushAsync();
    expect(logSpy).toHaveBeenCalledWith('válasz erre: második kérdés');
    expect(maxActive).toBe(1);

    input.write('exit\n');
    await done;
  });
});
