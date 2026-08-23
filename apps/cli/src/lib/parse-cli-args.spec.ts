import { describe, expect, it } from 'vitest';
import { splitCliArgs } from './parse-cli-args.js';

const THREAD = '99999999-9999-4999-8999-999999999999';

describe('splitCliArgs — mi számít "üres" hívásnak', () => {
  it('argumentum nélkül üres: indulhat az interaktív mód', () => {
    expect(splitCliArgs([]).nonFlagArgs).toEqual([]);
  });

  it('a --show-prompt és a --quiet önmagában NEM teszi nem-üressé', () => {
    const args = splitCliArgs(['--show-prompt', '--quiet']);

    expect(args.nonFlagArgs).toEqual([]);
    expect(args.showPrompt).toBe(true);
    expect(args.quiet).toBe(true);
  });

  it('a --role KÉT slotot foglal, és mindkettő kiesik', () => {
    const args = splitCliArgs(['--role', 'admin']);

    expect(args.nonFlagArgs).toEqual([]);
    expect(args.role).toBe('admin');
  });

  it('a --thread is KÉT slotot foglal', () => {
    const args = splitCliArgs(['--thread', THREAD]);

    expect(args.nonFlagArgs).toEqual([]);
    expect(args.thread).toBe(THREAD);
  });

  it('a kettő EGYÜTT is működik', () => {
    const args = splitCliArgs(['--role', 'admin', '--thread', THREAD]);

    expect(args.nonFlagArgs).toEqual([]);
    expect(args.role).toBe('admin');
    expect(args.thread).toBe(THREAD);
  });

  // EZ A REGRESSZIÓS TESZT. A régi inline szűrőben a `roleIndex + 1` nullára esett,
  // ha nem volt --role — és akkor a 0. argv-elem kiesett, tehát a `szobakertesz foo`
  // interaktív módot indított a commander hibajelzése helyett.
  it('a `szobakertesz foo` NEM üres — a commanderhez kell mennie', () => {
    expect(splitCliArgs(['foo']).nonFlagArgs).toEqual(['foo']);
  });

  it('a `szobakertesz ask "kérdés"` sem üres', () => {
    expect(splitCliArgs(['ask', 'Hány kaktusz van?']).nonFlagArgs).toEqual([
      'ask',
      'Hány kaktusz van?',
    ]);
  });

  it('kapcsolók MELLETT is megmarad a subcommand', () => {
    expect(splitCliArgs(['--quiet', 'ask', 'kérdés']).nonFlagArgs).toEqual([
      'ask',
      'kérdés',
    ]);
  });

  it('a `--thread=<uuid>` alak is működik — EGY slotot foglal', () => {
    const args = splitCliArgs([`--thread=${THREAD}`]);

    expect(args.nonFlagArgs).toEqual([]);
    expect(args.thread).toBe(THREAD);
  });

  it('a `--role=admin` alak sem eszi meg a következő argumentumot', () => {
    // A két-slotos ágon `--role admin ask` esetén az „admin" esik ki. Az `=` alaknál
    // viszont CSAK a saját slotja — különben a subcommand tűnne el.
    const args = splitCliArgs(['--role=admin', 'ask', 'kérdés']);

    expect(args.role).toBe('admin');
    expect(args.nonFlagArgs).toEqual(['ask', 'kérdés']);
  });

  it('az `=` alak érték nélkül is JELZI a kapcsolót', () => {
    expect(splitCliArgs(['--thread=']).thread).toBe('');
  });

  // Érték nélkül álló kapcsoló: a JELENLÉT megmarad (üres sztringként), hogy a
  // main.ts validálója ugyanúgy hibázzon, mint a régi inline szűrőnél — ott a
  // parseRole(undefined) dobott. Ha itt `undefined`-ot adnánk vissza, a hibás
  // hívás NÉMÁN, alapértelmezett szereppel indítana interaktív módot.
  it('érték nélküli --role esetén is látszik, hogy megadták', () => {
    const args = splitCliArgs(['--role']);

    expect(args.nonFlagArgs).toEqual([]);
    expect(args.role).toBe('');
  });

  it('érték nélküli --thread esetén is látszik, hogy megadták', () => {
    expect(splitCliArgs(['--thread']).thread).toBe('');
  });
});
