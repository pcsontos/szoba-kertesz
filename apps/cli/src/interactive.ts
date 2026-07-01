import { createInterface } from 'node:readline';
import { echo } from '@szoba-kertesz/core';

/**
 * Interaktív mód: soronként olvassa a bemenetet (node:readline), minden sort
 * visszhangoz (`echo: <sor>`), az `exit` beírására tisztán (exit code 0) kilép.
 * A readline `close` eseménye után nem hívunk process.exit()-et: az interfész
 * lezárásával a stdin felszabadul, a process magától, 0-s kóddal áll le.
 */
export function runInteractive(): void {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'szobakertesz> ',
  });

  console.log(
    'Szobakertész interaktív mód — írj be egy sort, és visszhangzom. Kilépés: "exit".',
  );
  rl.prompt();

  rl.on('line', (line: string) => {
    if (line.trim() === 'exit') {
      rl.close();
      return;
    }
    console.log(echo(line));
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('Viszlát!');
  });
}
