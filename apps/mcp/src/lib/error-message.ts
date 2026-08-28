// error-message.ts — EGY helyen az „ismeretlen hibából olvasható magyar szöveg" fordítás.
//
// MIÉRT KELL (a #11 review 4. tétele, mérve a Task 7 élő próbáján): ha a Postgres teljesen áll,
// a Node `pg` drivere `AggregateError`-t dob — annak a `.message`-e NATÍVAN ÜRES STRING, a valódi
// ok (`connect ECONNREFUSED …`) az `.errors` tömbben van. A szokásos
// `error instanceof Error ? error.message : String(error)` minta ezt üres szövegre fordítja, tehát
// a hívó modell egy tartalmatlan „Adatbázis-hiba: ” sort kap, amiből semmit nem tud kezdeni.
//
// A `packages/core` ugyanezt a vakfoltot hordozza (`run-sql-tool.ts`), de a 09. kör
// megszorítása, hogy a core diffje ÜRES maradjon — ez a segéd ezért itt él, az MCP-rétegben,
// és a core-t nem érinti.

/** Ismeretlen hibából olvasható szöveg — az `AggregateError`-t kicsomagolva. */
export function errorMessage(error: unknown): string {
  if (error instanceof AggregateError) {
    const inner = error.errors
      .map((cause) => (cause instanceof Error ? cause.message : String(cause)))
      .filter((message) => message.length > 0)
      .join('; ');

    // Ha az AggregateError-nak SAJÁT üzenete is van, az elöl marad; ha (a pg esetében) nincs,
    // a belső hibák adják a teljes szöveget. Ha egyik sincs, legalább az osztály nevét mondjuk
    // ki — az még mindig több, mint egy üres sztring.
    return [error.message, inner].filter((part) => part.length > 0).join(': ') || 'AggregateError';
  }

  if (error instanceof Error) {
    return error.message.length > 0 ? error.message : error.name;
  }

  return String(error);
}
