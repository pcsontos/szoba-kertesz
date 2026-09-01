import { PassThrough } from 'node:stream';
import {
  partsToText,
  type AskResult,
  type Message,
  type ThreadStore,
} from '@szoba-kertesz/core';
import { runInteractive } from './interactive.js';
import { AI_DISCLOSURE } from './lib/ai-disclosure.js';

function makeResult(answer: string): AskResult {
  return {
    answer,
    systemPrompt: '<role>teszt</role>',
    messages: [{ role: 'user', content: 'teszt kérdés' }],
    usage: { inputTokens: 1, outputTokens: 2 },
    toolSteps: [],
    stopReason: 'stop',
  };
}

/**
 * Néma beszélgetés-tár: a perzisztencia alapértelmezés szerint a VALÓDI tárba ír
 * (defaultThreadStore → DATABASE_URL_CHAT), tehát store injektálása nélkül minden
 * kérdést feltevő teszt sorokat hagyna a fejlesztői adatbázisban. Ez a stub azt
 * bizonyítja, hogy az injektálás nélküli útnak nincs mellékhatása a specben.
 */
function silentStore(): ThreadStore {
  return {
    createThread: async () => '00000000-0000-4000-8000-000000000000',
    appendMessage: async () => undefined,
    loadThread: async () => [],
    listThreads: async () => [],
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

  it('az indító banner kimondja, hogy MI-asszisztens válaszol', async () => {
    // AI Act 50. cikk (1)+(5). Nem a forrást nézzük, hanem amit a felhasználó INDULÁSKOR
    // ténylegesen lát a konzolon — ezért console-spy, nem sztring-összehasonlítás a fájlra.
    // A CLI is közvetlenül természetes személlyel interaktál, tehát a kötelezettség ide is
    // szól; a HF4 kizárólag az apps/web-et mérte, de a rendelkezés nem felület-specifikus.
    const ask = vi.fn().mockResolvedValue(makeResult('a válasz'));

    const done = runInteractive({
      input,
      output,
      ask,
      print: false,
      store: silentStore(),
    });
    input.write('exit\n');
    await done;

    // A banner a kérdés ELŐTT íródik ki: a modell meg sem szólalt.
    expect(ask).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(AI_DISCLOSURE),
    );
  });

  it('answers a question and exits cleanly on "exit"', async () => {
    const ask = vi.fn().mockResolvedValue(makeResult('a válasz'));

    // print: false = néma Trace (--quiet), ilyenkor a választ ez a modul írja.
    const done = runInteractive({
      input,
      output,
      ask,
      print: false,
      store: silentStore(),
    });
    input.write('mi az a pozsgás?\n');
    await flushAsync();
    input.write('exit\n');
    await done;

    expect(ask).toHaveBeenCalledExactlyOnceWith('mi az a pozsgás?', []);
    expect(logSpy).toHaveBeenCalledWith('a válasz');
    expect(logSpy).toHaveBeenCalledWith('Viszlát!');
  });

  it('does not echo the answer when the Trace is live — the Trace prints it (double-print regression)', async () => {
    const ask = vi.fn().mockResolvedValue(makeResult('a válasz'));

    // print: true (alapértelmezés) = élő Trace: a ✓ VÁLASZ blokkot a Trace
    // írja ki, tehát itt NEM szabad még egyszer kiírni ugyanazt.
    const done = runInteractive({
      input,
      output,
      ask,
      print: true,
      store: silentStore(),
    });
    input.write('mi az a pozsgás?\n');
    await flushAsync();
    input.write('exit\n');
    await done;

    expect(ask).toHaveBeenCalledExactlyOnceWith('mi az a pozsgás?', []);
    expect(logSpy).not.toHaveBeenCalledWith('a válasz');
    expect(logSpy).toHaveBeenCalledWith('Viszlát!');
  });

  it('drops buffered lines arriving after exit/close without calling askAgent (B1 regression, 975bd88)', async () => {
    const ask = vi.fn().mockResolvedValue(makeResult('nem szabadna látszania'));

    const done = runInteractive({ input, output, ask, store: silentStore() });
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
    const deferred = createDeferred<AskResult>();
    const ask = vi.fn().mockReturnValue(deferred.promise);

    const done = runInteractive({
      input,
      output,
      ask,
      print: false,
      store: silentStore(),
    });
    input.write('folyamatban lévő kérdés\n');
    await flushAsync();
    expect(ask).toHaveBeenCalledExactlyOnceWith('folyamatban lévő kérdés', []);

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
    const ask = vi.fn((question: string): Promise<AskResult> => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      return new Promise<AskResult>((resolve) => {
        resolvers.push(() => {
          active -= 1;
          resolve(makeResult(`válasz erre: ${question}`));
        });
      });
    });

    const done = runInteractive({
      input,
      output,
      ask,
      print: false,
      store: silentStore(),
    });
    input.write('első kérdés\n');
    input.write('második kérdés\n');
    await flushAsync();

    // amíg az első hívás függőben van, a második NEM indulhat el
    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith('első kérdés', []);

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

describe('runInteractive — perzisztencia (Task 10)', () => {
  let input: PassThrough;
  let output: PassThrough;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    input = new PassThrough();
    output = new PassThrough();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('az első kérdésnél threadet nyit, és MINDKÉT oldalt elmenti', async () => {
    const newThreadId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const saved: { threadId: string; role: string; text: string }[] = [];
    let createdWith: string | undefined;
    const store: ThreadStore = {
      createThread: async (title) => {
        createdWith = title;
        return newThreadId;
      },
      appendMessage: async (threadId, role, parts) => {
        saved.push({ threadId, role, text: partsToText(parts) });
      },
      loadThread: async () => [],
      listThreads: async () => [],
    };

    const done = runInteractive({
      input,
      output,
      print: false,
      store,
      ask: async () => makeResult('Nyolc.'),
    });
    input.write('Hány kaktusz van?\n');
    await flushAsync();
    input.write('exit\n');
    await done;

    expect(saved).toEqual([
      { threadId: newThreadId, role: 'user', text: 'Hány kaktusz van?' },
      { threadId: newThreadId, role: 'assistant', text: 'Nyolc.' },
    ]);
    // A cím az első kérdésből jön, és a felhasználó MEGKAPJA az azonosítót —
    // enélkül nem tudná folytatni sem a CLI-ben, sem a böngészőben.
    expect(createdWith).toBe('Hány kaktusz van?');
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`--thread ${newThreadId}`),
    );
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('kérdés nélkül kilépve NEM nyit threadet (lusta létrehozás)', async () => {
    let created = 0;
    const store: ThreadStore = {
      ...silentStore(),
      createThread: async () => {
        created += 1;
        return 'nem-kellene';
      },
    };

    const done = runInteractive({ input, output, print: false, store });
    input.write('exit\n');
    await done;

    expect(created).toBe(0);
  });

  it('--thread esetén a TÁRBÓL tölti az előzményt, és nem nyit újat', async () => {
    let created = 0;
    const threadId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const appendedTo: string[] = [];
    const store: ThreadStore = {
      createThread: async () => {
        created += 1;
        return 'nem-ez-kell';
      },
      appendMessage: async (id) => {
        appendedTo.push(id);
      },
      loadThread: async () => [
        {
          id: 1,
          role: 'user',
          parts: [{ type: 'text', text: 'Korábbi kérdés' }],
        },
        {
          id: 2,
          role: 'assistant',
          // Tool-part IS van a tárban (a webes oldal ezt kártyaként rajzolja) —
          // a terminál-nézetben ennek el kell tűnnie, a szöveg viszont marad.
          parts: [
            { type: 'tool-runSql', input: { query: 'SELECT 1' } },
            { type: 'text', text: 'Korábbi válasz' },
          ],
        },
      ],
      listThreads: async () => [],
    };
    let seenHistory: readonly Message[] = [];

    const done = runInteractive({
      input,
      output,
      print: false,
      threadId,
      store,
      ask: async (_question, history) => {
        seenHistory = history;
        return makeResult('ok');
      },
    });
    input.write('és olcsóbbat?\n');
    await flushAsync();
    input.write('exit\n');
    await done;

    expect(created).toBe(0);
    // EZ a lényeg: a modell a TÁRBÓL visszatöltött előzményt kapja meg, laposan.
    expect(seenHistory).toEqual([
      { role: 'user', content: 'Korábbi kérdés' },
      { role: 'assistant', content: 'Korábbi válasz' },
    ]);
    // …és az új forduló ugyanabba a threadbe íródik vissza.
    expect(appendedTo).toEqual([threadId, threadId]);
  });

  it('a tárolt ÜRES üzenetet kihagyja az előzményből', async () => {
    // A #8 PR-review 2. tétele: egy megszakadt futás után üres assistant-sor
    // maradhatott a tárban. A szerver már nem ír ilyet, de ami benne van, azt a
    // terminál `content: ''`-ként adná a modellnek — ezt itt szűrjük ki.
    const store: ThreadStore = {
      ...silentStore(),
      loadThread: async () => [
        {
          id: 1,
          role: 'user',
          parts: [{ type: 'text', text: 'Korábbi kérdés' }],
        },
        { id: 2, role: 'assistant', parts: [] },
      ],
    };
    let seenHistory: readonly Message[] = [];

    const done = runInteractive({
      input,
      output,
      print: false,
      threadId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      store,
      ask: async (_question, history) => {
        seenHistory = history;
        return makeResult('ok');
      },
    });
    input.write('és tovább?\n');
    await flushAsync();
    input.write('exit\n');
    await done;

    expect(seenHistory).toEqual([{ role: 'user', content: 'Korábbi kérdés' }]);
  });

  it('nem létező threadre magyar hibával áll meg, munkamenet nélkül', async () => {
    const store: ThreadStore = {
      ...silentStore(),
      loadThread: async () => null,
    };

    await expect(
      runInteractive({
        input,
        output,
        threadId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        store,
      }),
    ).rejects.toThrow(/Nincs ilyen beszélgetés/);

    // A readline el sem indult: se banner, se "Viszlát!".
    expect(logSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('interaktív mód'),
    );
    expect(logSpy).not.toHaveBeenCalledWith('Viszlát!');
  });
});
