import { Command } from 'commander';

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
    console.log(
      `Az "ask" parancs egyelőre nincs implementálva — ez még csak a CLI váza, LLM- és adatbázis-hozzáférés nélkül. Kapott kérdés: "${question}"`,
    );
  });

program.parse();
