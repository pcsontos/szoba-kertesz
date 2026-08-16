-- A két agent-szerepkör létrehozása, idempotensen.
--
-- Ez a fájl CSAK a konténer ELSŐ indulásakor fut (docker-entrypoint-initdb.d), ÜRES
-- adatbázison — a products táblát a Prisma-migrációk hozzák létre jóval később. Ezért
-- a jogosultságok EGYETLEN forrása a hozzá tartozó migráció
-- (`packages/db/prisma/migrations/*_db_roles/migration.sql`): egy `prisma migrate reset`
-- után a szerepek megmaradnának, a grantjaik viszont nem, és a migráció az, ami
-- ilyenkor is visszaállítja őket.
--
-- ⚠️ ELTÉRÉS a migrációtól, szándékosan: a products-ra szóló GRANT itt FELTÉTELES.
-- Feltétel nélkül `ERROR: relation "products" does not exist`-tel elhasalna a konténer
-- inicializálása. A migrációban ugyanez a grant FELTÉTLEN — ott a tábla már létezik,
-- és ha mégsem, hangosan bukjon, ne némán maradjon el az írási jog.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'szoba-kertesz_ro') THEN
    CREATE ROLE "szoba-kertesz_ro" LOGIN PASSWORD 'szoba-kertesz_ro';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'szoba-kertesz_rw') THEN
    CREATE ROLE "szoba-kertesz_rw" LOGIN PASSWORD 'szoba-kertesz_rw';
  END IF;
END
$$;

-- Read-only szerep: a query-agent útja. SELECT és semmi más.
GRANT CONNECT ON DATABASE "szoba-kertesz" TO "szoba-kertesz_ro";
GRANT USAGE ON SCHEMA public TO "szoba-kertesz_ro";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "szoba-kertesz_ro";
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO "szoba-kertesz_ro";

-- Read-write szerep: az ingest-agent útja. SELECT + INSERT + UPDATE a products-on.
-- DELETE és DDL SZÁNDÉKOSAN NINCS: az upsert nem törölhet, és sémát nem módosíthat.
-- A products-ra szóló grant NEM kerül ide feltétel nélkül (lásd a fejlécet); a
-- default privileges-t sem használjuk rá, mert az MINDEN jövőbeli táblára szólna,
-- nem csak a products-ra.
GRANT CONNECT ON DATABASE "szoba-kertesz" TO "szoba-kertesz_rw";
GRANT USAGE ON SCHEMA public TO "szoba-kertesz_rw";

DO $$
BEGIN
  IF EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products'
  ) THEN
    GRANT SELECT, INSERT, UPDATE ON TABLE products TO "szoba-kertesz_rw";
  END IF;
END
$$;

-- Az id autoincrement()-je miatt kell: nélküle az INSERT
-- "permission denied for sequence products_id_seq"-kel áll meg.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "szoba-kertesz_rw";
