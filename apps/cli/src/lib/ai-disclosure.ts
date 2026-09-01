// ai-disclosure.ts — AI Act 50. cikk (1) és (5). A CLI is KÖZVETLENÜL természetes személlyel
// interaktál, tehát a kötelezettség ide is szól: a HF4 kizárólag az apps/web-et mérte, de a
// rendelkezés nem felület-specifikus.
//
// MIÉRT MÁSOLAT? Mert az apps/web böngésző-bundle, és nem importálhat a packages/core-ból
// (a barrel pg-t és Node-only configot is újraexportál). Egy közös helyet vagy a web
// core-függősége, vagy egy külön workspace-csomag árán lehetne tartani — mindkettő
// aránytalan EGYETLEN mondatért. A döntés és az elvetett alternatívák a specben állnak.
//
// A SZÖVEGNEK BÁJTRA EGYEZNIE KELL az apps/web/src/lib/ai-disclosure.ts-belivel.

/** A tájékoztató mondat. A gondolatjel em dash (—), nem kötőjel. */
export const AI_DISCLOSURE =
  'Ez egy MI-asszisztens — a válaszokat nyelvi modell generálja.';
