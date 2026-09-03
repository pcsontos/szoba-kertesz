// bootstrap-roles.ts — A HÁROM AGENT-SZEREP ERŐS JELSZÓVAL, env-ből.
//
// MIÉRT KELL EZ? Mert a migrációkban a jelszó a szerep NEVE
// (`CREATE ROLE "szoba-kertesz_ro" LOGIN PASSWORD 'szoba-kertesz_ro'`), és a repó PUBLIKUS.
// Lokálisan ez ártalmatlan (a Postgres a localhoston ül), élesben viszont közvetlen írási út
// a katalógusba a _rw szerepen.
//
// MIÉRT NEM MIGRÁCIÓBAN? A Prisma-migráció statikus SQL, nem olvas env-et. Ez a script a
// `migrate deploy` ELŐTT fut: a migráció `IF NOT EXISTS` őre miatt a már létező, erős
// jelszavú szerepeket nem írja felül — csak a grantokat teszi rájuk.
//
// MIÉRT `format()` ÉS NEM PARAMÉTER? Mert az `ALTER ROLE … PASSWORD` nem fogad bind-paramétert:
// a jelszónak string literálként kell ott állnia. A `format('%I', …)` és `%L` a Postgres SAJÁT
// escape-elése — így az injekció ellen nem a mi kódunk véd, hanem az adatbázis.
import { Pool } from 'pg';

interface RoleSpec {
  readonly role: string;
  readonly envName: string;
}

const ROLES: readonly RoleSpec[] = [
  { role: 'szoba-kertesz_ro', envName: 'DB_ROLE_PASSWORD_RO' },
  { role: 'szoba-kertesz_rw', envName: 'DB_ROLE_PASSWORD_RW' },
  { role: 'szoba-kertesz_chat', envName: 'DB_ROLE_PASSWORD_CHAT' },
];

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // Az env jöhet közvetlenül a shellből is — élesben pont úgy jön.
  }

  const adminUrl = process.env['DATABASE_URL'];
  if (!adminUrl) {
    console.error(
      'bootstrap-roles: hiányzó DATABASE_URL — a szerep-létrehozás admin kapcsolatot igényel.',
    );
    process.exit(1);
  }

  const missing = ROLES.filter(({ envName }) => {
    const value = process.env[envName];
    return value === undefined || value.length < 16;
  });
  if (missing.length > 0) {
    console.error(
      'bootstrap-roles: hiányzó vagy túl rövid jelszó (min. 16 karakter): ' +
        missing.map(({ envName }) => envName).join(', '),
    );
    process.exit(1);
  }

  const pool = new Pool({ connectionString: adminUrl });
  try {
    for (const { role, envName } of ROLES) {
      const password = process.env[envName] as string;
      if (password === role) {
        console.error(
          `bootstrap-roles: a(z) ${envName} értéke azonos a szerep nevével — ez PONTOSAN az ` +
            'a gyenge alapértelmezés, amit ez a script kivált.',
        );
        process.exit(1);
      }

      // A Postgres állítja elő a biztonságos SQL-t: %I azonosítót, %L literált escape-el.
      const { rows } = await pool.query<{ stmt: string }>(
        `SELECT format(
           CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)
                THEN 'ALTER ROLE %I PASSWORD %L'
                ELSE 'CREATE ROLE %I LOGIN PASSWORD %L'
           END, $1::text, $2::text) AS stmt`,
        [role, password],
      );
      const statement = rows[0]?.stmt;
      if (!statement) {
        throw new Error(`bootstrap-roles: nem sikerült SQL-t előállítani (${role}).`);
      }
      await pool.query(statement);
      console.log(`bootstrap-roles: ${role} jelszava beállítva.`);
    }
  } finally {
    await pool.end();
  }
}

void main();
