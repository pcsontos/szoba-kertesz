-- Két agent-szerepkör, idempotensen. Ez a fájl a jogosultságok EGYETLEN forrása:
-- az init.sql csak a konténer ELSŐ indulásakor fut, egy `prisma migrate reset` után
-- a szerepek megmaradnának, a grantjaik viszont nem — és a runSql némán elszállna.

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
GRANT CONNECT ON DATABASE "szoba-kertesz" TO "szoba-kertesz_rw";
GRANT USAGE ON SCHEMA public TO "szoba-kertesz_rw";
GRANT SELECT, INSERT, UPDATE ON TABLE products TO "szoba-kertesz_rw";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "szoba-kertesz_rw";
