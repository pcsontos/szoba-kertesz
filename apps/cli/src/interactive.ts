import { createInterface } from 'node:readline';
import {
  askAgent,
  closeReadonlyPool,
  type AskAgentResult,
} from '@szoba-kertesz/core';
import { printPrompt } from './lib/print-prompt.js';

export interface RunInteractiveOptions {
  readonly showPrompt?: boolean;
  // Teszteléshez injektálható függőségek (interactive.spec.ts) — alapból a
  // valódi stdin/stdout és a valódi askAgent. Injektálás nélkül a viselkedés
  // változatlan.
  readonly input?: NodeJS.ReadableStream;
  readonly output?: NodeJS.WritableStream;
  readonly ask?: (question: string) => Promise<AskAgentResult>;
}

/**
 * Interaktív mód: soronként olvassa a bemenetet (node:readline), minden
 * sort a szobakertész agensnek küld (askAgent), és kiírja a választ.
 * Az `exit` beírására tisztán (exit code 0) kilép.
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
 * A runSql esetleg megnyitott read-only DB pool-ját SZÁNDÉKOSAN nem
 * kérdésenként zárjuk le (az interaktív munkamenet sok kérdésen át egy
 * folyamatban él, kérdésenkénti újracsatlakozás pazarló lenne — lásd
 * `db-readonly.ts`), hanem egyszer, a `close` eseménykor (session vége),
 * mielőtt a `runInteractive` által visszaadott Promise felold — így a
 * folyamat a "Viszlát!" után nem marad életben a pg alapértelmezett
 * `idleTimeoutMillis`-e miatt.
 */
export function runInteractive(
  options: RunInteractiveOptions = {},
): Promise<void> {
  const showPrompt = options.showPrompt ?? false;
  const ask = options.ask ?? askAgent;

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
          const result = await ask(question);
          if (showPrompt) {
            printPrompt(result.systemPrompt, result.messages);
          }
          console.log(result.answer);
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
      void closeReadonlyPool()
        .catch((error) => {
          console.error(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          resolve();
        });
    });
  });
}
