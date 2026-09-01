// ai-disclosure.ts — AI Act 50. cikk (1) és (5): a felhasználót tájékoztatni kell, hogy
// MI-rendszerrel beszél, "legkésőbb az első interakció idején".
//
// MIÉRT ITT, és miért nem a packages/core-ban? Mert ez böngésző-kód. Az apps/web mérve
// EGYETLEN sort sem importál a core-ból: a core barrelje pg-t (db-readonly.ts, db-chat.ts)
// és Node-only configot is újraexportál, ami egy böngésző-bundle-be nem való. Ez fenntartott
// invariáns, nem véletlen — nem törjük meg egyetlen mondatért.
//
// AZ ÁRA, kimondva: az apps/cli ugyanezt a mondatot a saját másolatában tartja. A két
// szövegnek bájtra egyeznie kell; mindkét oldalt spec pinneli.
//
// MIÉRT NEM A SYSTEM PROMPTBAN? Mert ez nem a modell viselkedése, hanem a FELÜLET
// tájékoztatása. Egy promptba írt szabály attól függne, hogy a modell betartja-e; ez a
// mondat akkor is ott van a képernyőn, ha a modell el sem indul.
//
// A "nyilvánvaló" kivételre (50. cikk (1) utolsó fordulat) SZÁNDÉKOSAN nem hivatkozunk —
// az indoklás a docs/hf4-ai-act.md 2.3 pontjában áll.

/** A tájékoztató mondat. A gondolatjel em dash (—), nem kötőjel. */
export const AI_DISCLOSURE =
  'Ez egy MI-asszisztens — a válaszokat nyelvi modell generálja.';
