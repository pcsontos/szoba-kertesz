// user-role.ts — KI beszél az agenttel: vásárló (customer) vagy belső munkatárs (admin).
//
// A szerep KÉPESSÉGET kapcsol, nem prompt-tiltást: adminként a query-agent megkapja a
// delegateToIngest toolt, amellyel átadhat egy katalógus-módosítást az ingest-agentnek.
// Vásárlóként ez a tool NINCS BENNE a toolkészletben — a modell nem is tudja, hogy létezik.
// Ez erősebb, mint egy promptban kimondott tiltás: amit nem kínálunk fel, azt nem lehet
// meghívni.
//
// DEMO: élőben ezt a CURRENT_ROLE konstanst írod át (customer ↔ admin), és újrafuttatod a
// CLI-t — a trace `tools:` sorában azonnal látszik a különbség. A tsx-futtatás miatt build
// sem kell. Egyszeri futáshoz a fájl átírása helyett ott a `--role admin` kapcsoló is.
//
// SZÁNDÉKOSAN konstans, nem env-változó: a demó lényege a látható, azonnali váltás. A
// szerver NEM kérésből veszi a szerepet — hitelesítés nélkül az jogosultsági felületet nyitna.

export const USER_ROLES = ['customer', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** Az aktuális szerep. Élőben EZT írod át demózáshoz. */
export const CURRENT_ROLE: UserRole = 'customer';

export function isAdmin(role: UserRole = CURRENT_ROLE): boolean {
  return role === 'admin';
}
