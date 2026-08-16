import { join } from 'node:path';
import { Command } from 'commander';
import {
  askAgent,
  askIngestAgent,
  closeReadonlyPool,
  closeReadWritePool,
  setWatchLog,
} from '@szoba-kertesz/core';
import { runInteractive } from './interactive.js';
import { printPrompt } from './lib/print-prompt.js';

// .env betöltése a belépési pontban (a core sosem tölt fájlt, lásd
// packages/core/src/lib/config.ts) — hiányzó .env esetén toleráljuk, mert
// az env jöhet közvetlenül a shellből is (pl. CI-ban).
try {
  process.loadEnvFile();
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error &&
    (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

// A CLI verziószáma — az apps/cli/package.json "version" mezőjével egyezik,
// hardcode-olva, mert a build (esbuild, bundle: false) rootDir-ja "src",
// a package.json JSON-importja pedig kívül esne ezen és megbontaná a buildet.
const CLI_VERSION = '0.0.1';

const program = new Command();

program
  .name('szobakertesz')
  .description(
    'Szobakertész CLI — szobanövény-katalógushoz kapcsolódó, magyar nyelvű kérdéseket megválaszoló asszisztens.',
  )
  .version(CLI_VERSION, '-V, --version', 'a CLI verziószámának kiírása');

program
  .command('ask <question>')
  .description('Kérdés feltevése a szobakertész agensnek természetes nyelven.')
  .option(
    '--show-prompt',
    'a modellnek ténylegesen elküldött system prompt és üzenet-tömb kiírása a válasz előtt',
  )
  .option(
    '--quiet',
    'az élő, színes Trace elnémítása — csak a végső válasz jelenik meg (a watch-log és a JSONL ettől függetlenül ír)',
  )
  .action(
    async (
      question: string,
      options: { showPrompt?: boolean; quiet?: boolean },
    ) => {
      try {
        const print = !options.quiet;
        const result = await askAgent(question, { print });
        if (options.showPrompt) {
          printPrompt(result.systemPrompt, result.messages);
        }
        // A végső választ élő Trace mellett már a Trace kiírja (✓ VÁLASZ
        // blokk, lásd trace.ts finish()) — itt csak akkor írjuk ki, ha a
        // Trace néma (--quiet), különben kétszer jelenne meg ugyanaz.
        if (!print) {
          console.log(result.answer);
        }
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exitCode = 1;
      } finally {
        // Az `ask` egyszeri, egy-körös hívás — a runSql esetleg nyitva hagyott
        // read-only DB pool-ját mindig lezárjuk (siker és hiba esetén is),
        // különben a pg alapértelmezett `idleTimeoutMillis`-e miatt a folyamat
        // ~10 másodpercig életben marad a válasz kiírása után is. Biztonságos
        // no-op, ha runSql-t egyáltalán nem hívta a kérdés (nem jött létre pool).
        await closeReadonlyPool();
      }
    },
  );

program
  .command('ingest <instruction>')
  .description(
    'Katalógus-kezelő agent: természetes nyelvű utasításból vesz fel vagy frissít ' +
      'terméket. FIGYELEM: ez a parancs ÍR az adatbázisba.',
  )
  .option(
    '--quiet',
    'az élő, színes Trace elnémítása — csak a végső válasz jelenik meg (a watch-log és a JSONL ettől függetlenül ír)',
  )
  .action(async (instruction: string, options: { quiet?: boolean }) => {
    try {
      const print = !options.quiet;
      const result = await askIngestAgent(instruction, { print });
      if (!print) {
        console.log(result.answer);
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    } finally {
      // Az ingest-agent OLVAS (read-only pool) ÉS ÍR (read-write pool) — mindkettőt zárjuk,
      // különben a pg idleTimeoutMillis-e miatt a folyamat életben maradna.
      await Promise.all([closeReadonlyPool(), closeReadWritePool()]);
    }
  });

// Argumentum nélkül indítva (process.argv: [node, script]) az interaktív mód
// indul a Commander help-je helyett. Explicit argv-hossz ellenőrzést használunk
// Commander default command (isDefault: true) helyett, mert a default command
// ismeretlen subcommand esetén is lefutna (pl. `szobakertesz foo` hibajelzés
// helyett interaktív módba lépne) — az argv-ellenőrzés csak a ténylegesen
// üres hívásra szűkíti a triggert, a --help/--version/ask változatlan marad.
//
// A `--show-prompt` az egyetlen kivétel: mivel az `ask` mellett interaktív
// módban is támogatott, egy önmagában álló `--show-prompt`-ot (subcommand
// nélkül) az "üres hívás" részének tekintjük, és bekapcsolt flag-gel indítjuk
// az interaktív módot — ehhez ki kell szűrni az argv-ből, mielőtt az
// "üres-e" döntést meghoznánk.
// A `--quiet` ugyanígy viselkedik: interaktív módban is értelmes, tehát
// önmagában állva nem teszi "nem üressé" a hívást.
const STANDALONE_FLAGS = ['--show-prompt', '--quiet'];

const cliArgs = process.argv.slice(2);
const showPromptFlag = cliArgs.includes('--show-prompt');
const quietFlag = cliArgs.includes('--quiet');
const nonFlagArgs = cliArgs.filter((arg) => !STANDALONE_FLAGS.includes(arg));

// Folyamatos watch-log ("control room"): a `--quiet`-tól FÜGGETLENÜL ír, így
// egy másik terminálban `tail -f logs/agent.log`-gal végig követhető a futás.
setWatchLog(join(process.cwd(), 'logs', 'agent.log'));

function handleFatalError(error: unknown): void {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

if (nonFlagArgs.length === 0) {
  runInteractive({ showPrompt: showPromptFlag, print: !quietFlag }).catch(
    handleFatalError,
  );
} else {
  program.parseAsync(process.argv).catch(handleFatalError);
}
