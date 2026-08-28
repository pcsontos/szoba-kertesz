import { join } from 'node:path';
import { Writable } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig, setQuiet, setWatchLog, closeReadonlyPool } from '@szoba-kertesz/core';
import { buildSzobaKerteszServer, TOOL_NAMES } from './szoba-kertesz-server.js';

// main.ts — a NEGYEDIK belépési pont a core fölé (CLI, HTTP-szerver, web mellett). Itt nem mi
// hívjuk a modellt: egy IDEGEN host (Claude Code / Claude Desktop) modellje hívja a mi
// tooljainkat. A @szoba-kertesz/core most sem tud arról, hogy létezik az MCP-réteg.
//
// TRANSPORT: stdio — a host indítja a folyamatot, és stdin/stdout-on beszél vele JSON-RPC-ben.

// .env betöltése a belépési pontban (a core sosem tölt fájlt, lásd packages/core/src/lib/
// config.ts) — hiányzó .env esetén toleráljuk, mert az env jöhet közvetlenül a shellből is.
try {
  process.loadEnvFile();
} catch (error) {
  const isMissingEnvFile =
    error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT';
  if (!isMissingEnvFile) {
    throw error;
  }
}

/**
 * A stdout ELVÉTELE a program elől — stdio-transporton ez nem stílus kérdése: a stdout a
 * PROTOKOLL csatornája, egyetlen odaírt sor is használhatatlanná teszi a szervert. Ezért:
 *   - a protokoll az EREDETI stdout-ot kapja (protocolOut),
 *   - minden más `process.stdout.write` hívás a stderr-re megy (ott a host naplózza).
 */
function captureStdout(): Writable {
  const rawWrite = process.stdout.write.bind(process.stdout);

  const protocolOut = new Writable({
    write(chunk, encoding, callback): void {
      rawWrite(chunk as Buffer | string, encoding, () => callback());
    },
  });

  process.stdout.write = ((chunk: Buffer | string, ...rest: unknown[]): boolean =>
    (process.stderr.write as (...args: unknown[]) => boolean)(
      chunk,
      ...rest,
    )) as typeof process.stdout.write;

  return protocolOut;
}

async function main(): Promise<void> {
  const protocolOut = captureStdout();

  // KETTŐS stdout-védelem (8. döntés). A `captureStdout()` fenti hívása a
  // `process.stdout.write`-ot fogja el — de a core `traceLog()`-ja (trace.ts:70) a saját
  // modul-szintű `quiet` kapcsolóján is átmegy, amit NORMÁL esetben a `runAgentLoop` állít
  // (`setQuiet(!print)`). A search_knowledge tool az `executeSearchKnowledge`-et
  // AGENT-LOOP NÉLKÜL hívja, tehát az a `setQuiet` sosem futna le — itt, a bootban KELL
  // beállítani. A `setQuiet` a KONZOL-zajt veszi el, a `captureStdout` a GARANCIÁT adja
  // (bármelyik függőség console.log-ja is stderr-re megy) — a kettő más hibaosztályt fog meg.
  setQuiet(true);
  // A nyom NEM vész el: ugyanabba a watch-logba megy, amit a CLI és a szerver is használ.
  setWatchLog(join(process.cwd(), 'logs', 'agent.log'));

  // FAIL-FAST: a hiányzó kulcs/DB így a host hibaüzenetében is látszik, nem az első hívásnál
  // derül ki. A loadConfig sima Error-t dob magyar üzenettel — nincs külön hibaosztály.
  try {
    loadConfig();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`szoba-kertesz-mcp: ${message}\n`);
    process.exit(1);
  }

  const server = buildSzobaKerteszServer();

  await server.connect(new StdioServerTransport(process.stdin, protocolOut));
  process.stderr.write(`szoba-kertesz-mcp: kész (stdio), toolok: ${TOOL_NAMES.join(', ')}\n`);
}

/** A host SIGTERM/SIGINT-tel állítja le a folyamatot — a DB-kapcsolatot lezárjuk. */
async function shutdown(): Promise<void> {
  await closeReadonlyPool();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`szoba-kertesz-mcp: indítási hiba — ${message}\n`);
  process.exit(1);
});
