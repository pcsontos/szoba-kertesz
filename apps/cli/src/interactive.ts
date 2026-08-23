import { createInterface } from 'node:readline';
import {
  askAgent,
  closeChatPool,
  closeReadonlyPool,
  defaultThreadStore,
  partsToText,
  textToParts,
  toThreadTitle,
  type AskResult,
  type Message,
  type ThreadStore,
  type UserRole,
} from '@szoba-kertesz/core';
import { printPrompt } from './lib/print-prompt.js';

export interface RunInteractiveOptions {
  readonly showPrompt?: boolean;
  /**
   * Élő, színes Trace. Alapból true; a CLI `--quiet` kapcsolójára false.
   * Egyben azt is eldönti, ki írja ki a végső választ: `true` esetén a Trace
   * (✓ VÁLASZ blokk), `false` esetén ez a modul — sosem mindkettő.
   */
  readonly print?: boolean;
  /** A hívó szerepe; a query-agent ez alapján kapja meg a toolkészletét. */
  readonly role?: UserRole;
  /** Egy korábbi beszélgetés folytatása (`--thread <uuid>`). */
  readonly threadId?: string;
  // Teszteléshez injektálható függőségek (interactive.spec.ts) — alapból a
  // valódi stdin/stdout, a valódi askAgent és a valódi beszélgetés-tár.
  // Injektálás nélkül a viselkedés változatlan.
  readonly input?: NodeJS.ReadableStream;
  readonly output?: NodeJS.WritableStream;
  /**
   * Az agent-hívás. A `history` MÁSODIK paraméterként megy át, nem csak a
   * default implementáció closure-jében: így a spec látja, mit kapott volna a
   * modell, azaz a `--thread`-es előzmény-betöltés ténylegesen ellenőrizhető.
   */
  readonly ask?: (
    question: string,
    history: readonly Message[],
  ) => Promise<AskResult>;
  /** A beszélgetés-tár — injektálható, hogy a spec DB nélkül fusson. */
  readonly store?: ThreadStore;
}

/**
 * A folytatott beszélgetés előzménye a TÁRBÓL. A tool-részek itt szöveggé laposodnak
 * (`partsToText`) — a terminál nem tud kártyát rajzolni, és nem is kell.
 *
 * A betöltés a readline elindítása ELŐTT fut, hibás azonosítónál tehát el sem indul a
 * munkamenet. Épp ezért kell a hibaágon NEKÜNK lezárni a chat-pool-t: a `loadThread` már
 * megnyitotta, a `close`-eseményre kötött zárás viszont sosem futna le, és a folyamat a
 * magyar hibaüzenet kiírása után is életben maradna a pg idle-timeoutjáig (mérve: 10,6
 * másodperc). Ugyanaz az elv, mint az `ask`/`ingest` `finally` blokkjaiban.
 */
async function loadHistory(
  store: ThreadStore,
  threadId: string,
): Promise<readonly Message[]> {
  try {
    const stored = await store.loadThread(threadId);
    if (stored === null) {
      throw new Error(
        `Nincs ilyen beszélgetés: ${threadId}. Listát a webes felület mutat.`,
      );
    }
    return stored.map((entry) => ({
      role: entry.role,
      content: partsToText(entry.parts),
    })) as readonly Message[];
  } catch (error) {
    await closeChatPool();
    throw error;
  }
}

/**
 * Interaktív mód: soronként olvassa a bemenetet (node:readline), minden
 * sort a szobakertész agensnek küld (askAgent), és kiírja a választ.
 * Az `exit` beírására tisztán (exit code 0) kilép.
 *
 * A munkamenet PERZISZTENS: minden kérdés és válasz a beszélgetés-tárba is
 * bekerül (`threads` + `messages`, a szoba-kertesz_chat szerepen), ugyanabba,
 * amibe a webes felület ír. A thread LUSTÁN jön létre — az első kérdésnél —,
 * hogy egy azonnal kilépő munkamenet ne hagyjon üres sort a listában. Ez adja
 * a demót: a CLI-ben indított beszélgetés megnyitható a böngészőben, és a
 * `--thread <uuid>`-vel egy webes beszélgetés folytatható a terminálban.
 *
 * Az askAgent hívások async-ok (LLM API-hívás) — hogy két hívás soha ne
 * fusson párhuzamosan/interleavelve, a beérkező sorokat egy sorban álló
 * (FIFO) queue-ba tesszük, és egy `processing` mutex-szel biztosítjuk, hogy
 * mindig legfeljebb egy feldolgozó ciklus fusson, ami a queue-t egyesével
 * ürítve, egymás után várja meg az egyes askAgent hívásokat. Ez robusztusabb,
 * mint az `rl.pause()`/`rl.resume()` időzítésére hagyatkozni, mert pipe-olt
 * stdin esetén több 'line' esemény is szinkron sorban tud tüzelni, mielőtt
 * a pause() ténylegesen érvénybe lépne.
 *
 * A readline `close` eseménye után nem hívunk process.exit()-et: az
 * interfész lezárásával a stdin felszabadul, a process magától, 0-s kóddal
 * áll le. Fontos: a `console.log`/`console.error` NEM a readline
 * interfészen keresztül ír (azt közvetlenül a process.stdout/stderr-re
 * teszi), tehát `exit` után is biztonságos meghívni — csak a readline
 * SAJÁT metódusai (pl. `rl.prompt()`) dobnak ERR_USE_AFTER_CLOSE-t lezárt
 * interfészen. Ezért a queue-ban már `exit` előtt várakozó kérdéseket
 * végig kiszolgáljuk (a válaszukat kiírjuk), csak az újabb `rl.prompt()`
 * hívásokat tiltjuk le a close után.
 *
 * A runSql esetleg megnyitott read-only DB pool-ját (és a beszélgetés-tár
 * chat-pool-ját) SZÁNDÉKOSAN nem kérdésenként zárjuk le (az interaktív
 * munkamenet sok kérdésen át egy folyamatban él, kérdésenkénti
 * újracsatlakozás pazarló lenne — lásd `db-readonly.ts`), hanem egyszer, a
 * `close` eseménykor (session vége), mielőtt a `runInteractive` által
 * visszaadott Promise felold — így a folyamat a "Viszlát!" után nem marad
 * életben a pg alapértelmezett `idleTimeoutMillis`-e miatt.
 */
export async function runInteractive(
  options: RunInteractiveOptions = {},
): Promise<void> {
  const showPrompt = options.showPrompt ?? false;
  const print = options.print ?? true;
  const store = options.store ?? defaultThreadStore;

  // Beszélgetés-memória: minden forduló után eltesszük a teljes, frissített
  // üzenet-tömböt, és a következő hívásnak visszaadjuk — enélkül a
  // visszautaló kérdés ("és olcsóbbat?") értelmezhetetlen a modellnek.
  let history: readonly Message[] = [];
  // A thread LUSTÁN jön létre: egy azonnal kilépő munkamenet ne hagyjon üres sort.
  let threadId: string | undefined = options.threadId;

  const ask =
    options.ask ??
    ((question: string, currentHistory: readonly Message[]) =>
      askAgent(question, {
        print,
        history: currentHistory,
        role: options.role,
      }));

  if (options.threadId !== undefined) {
    history = await loadHistory(store, options.threadId);
  }

  return new Promise((resolve) => {
    const rl = createInterface({
      input: options.input ?? process.stdin,
      output: options.output ?? process.stdout,
      prompt: 'szobakertesz> ',
    });

    // Pipe-olt stdin esetén a readline a rl.close() UTÁN is emittálhat már
    // pufferelt 'line' eseményeket; ezeket az ÚJ sorokat eldobjuk (lásd a
    // 'line' handlert lent) — de a queue-ban `exit` előtt már várakozó
    // kérdéseket továbbra is végigfuttatjuk és megválaszoljuk, csak az
    // `rl.prompt()` újrahívását tiltjuk le utánuk (lásd lent).
    let closed = false;
    let processing = false;
    const queue: string[] = [];

    console.log(
      'Szobakertész interaktív mód — írj be egy kérdést, és válaszol. Kilépés: "exit".',
    );
    rl.prompt();

    async function processQueue(): Promise<void> {
      if (processing) {
        return;
      }
      processing = true;

      // Szándékosan NEM `!closed`-et is figyeljük itt: a queue-ba `exit`
      // előtt már bekerült kérdéseket végig kiszolgáljuk, még akkor is, ha
      // időközben `closed` igazra vált — csak új sor nem kerülhet be a
      // queue-ba close után (lásd a 'line' handlert).
      while (queue.length > 0) {
        const question = queue.shift();
        if (question === undefined) {
          break;
        }

        try {
          if (threadId === undefined) {
            threadId = await store.createThread(toThreadTitle(question));
            console.log(
              `Beszélgetés azonosítója: ${threadId}\n` +
                `  folytatás: pnpm cli --thread ${threadId}\n` +
                `  böngészőben: http://localhost:4200/?thread=${threadId}`,
            );
          }
          await store.appendMessage(threadId, 'user', textToParts(question));

          const result = await ask(question, history);
          history = result.messages;

          await store.appendMessage(
            threadId,
            'assistant',
            textToParts(result.answer),
          );

          if (showPrompt) {
            printPrompt(result.systemPrompt, result.messages);
          }
          // Lásd main.ts: élő Trace mellett a választ a Trace írja ki
          // (✓ VÁLASZ blokk), itt csak a néma (--quiet) ág írja — így nem
          // duplázódik.
          if (!print) {
            console.log(result.answer);
          }
        } catch (error) {
          console.error(error instanceof Error ? error.message : String(error));
        }

        if (!closed) {
          rl.prompt();
        }
      }

      processing = false;
    }

    rl.on('line', (line: string) => {
      if (closed) {
        return;
      }
      if (line.trim() === 'exit') {
        closed = true;
        rl.close();
        return;
      }
      queue.push(line);
      void processQueue();
    });

    rl.on('close', () => {
      closed = true;
      console.log('Viszlát!');
      // Session-végi, egyszeri pool-zárás (lásd a fenti doc-comment) — a
      // lezárási hibát (ha van) jelentjük, de nem hagyjuk a Promise-t
      // örökre függőben.
      void Promise.all([closeReadonlyPool(), closeChatPool()])
        .catch((error) => {
          console.error(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          resolve();
        });
    });
  });
}
