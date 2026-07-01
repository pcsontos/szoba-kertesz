import { Command } from 'commander';
import { echo } from '@szoba-kertesz/core';
import { runInteractive } from './interactive.js';

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
  .action((question: string) => {
    console.log(echo(question));
  });

// Argumentum nélkül indítva (process.argv: [node, script]) az interaktív mód
// indul a Commander help-je helyett. Explicit argv-hossz ellenőrzést használunk
// Commander default command (isDefault: true) helyett, mert a default command
// ismeretlen subcommand esetén is lefutna (pl. `szobakertesz foo` hibajelzés
// helyett interaktív módba lépne) — az argv-ellenőrzés csak a ténylegesen
// üres hívásra szűkíti a triggert, a --help/--version/ask változatlan marad.
if (process.argv.slice(2).length === 0) {
  runInteractive();
} else {
  program.parse();
}
