// parse-cli-args.ts — mi számít "üres" hívásnak.
//
// A no-arg indítás interaktív módot nyit a commander help-je helyett. A döntés
// azonban nem triviális: két kapcsoló (`--show-prompt`, `--quiet`) önmagában állva
// is "üres" hívás marad, két másik (`--role <érték>`, `--thread <érték>`) pedig KÉT
// argv-slotot foglal — az ÉRTÉKÜK nem-flag argumentumnak látszana.
//
// Amíg ez a logika a main.ts-ben állt inline, egyetlen elrontott index elég volt
// ahhoz, hogy a `szobakertesz foo` interaktív módot indítson a commander
// hibajelzése helyett. Tiszta függvényként tesztelhető.

/** Önmagukban álló kapcsolók: NEM teszik nem-üressé a hívást. */
const STANDALONE_FLAGS = ['--show-prompt', '--quiet'];

/** Értéket VÁRÓ kapcsolók: két argv-slotot foglalnak. */
const VALUE_FLAGS = ['--role', '--thread'] as const;

export interface CliArgs {
  readonly nonFlagArgs: readonly string[];
  readonly showPrompt: boolean;
  readonly quiet: boolean;
  readonly role?: string;
  readonly thread?: string;
}

export function splitCliArgs(argv: readonly string[]): CliArgs {
  const consumed = new Set<number>();
  const values: Record<string, string | undefined> = {};

  for (const flag of VALUE_FLAGS) {
    const index = argv.indexOf(flag);
    if (index !== -1) {
      consumed.add(index);
      consumed.add(index + 1);
      // `?? ''`: a kapcsoló JELENLÉTE akkor is látsszon, ha nem adtak neki
      // értéket — így a main.ts validálója hibázik (mint régen a
      // parseRole(undefined)), és nem indul némán, alapértelmezett szereppel.
      values[flag] = argv[index + 1] ?? '';
    }
  }

  return {
    nonFlagArgs: argv.filter(
      (arg, index) => !STANDALONE_FLAGS.includes(arg) && !consumed.has(index),
    ),
    showPrompt: argv.includes('--show-prompt'),
    quiet: argv.includes('--quiet'),
    role: values['--role'],
    thread: values['--thread'],
  };
}
