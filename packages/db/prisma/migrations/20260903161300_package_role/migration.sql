-- Az ÖTÖDIK szerep: a csomag-építés útja. A jogosultsági szétvágás nálunk nem prompt-szabály,
-- hanem Postgres-jog — ez a fájl a <ts>_db_roles migráció folytatása, a <ts>_chat_role
-- mintájára.
--
-- FONTOS: ennek a migrációnak a packages/package_items táblák létrehozása (Task 1) UTÁN kell
-- futnia (a fájlnév időbélyege dönt), különben a GRANT nem létező táblára hivatkozna.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'szoba-kertesz_package') THEN
    CREATE ROLE "szoba-kertesz_package" LOGIN PASSWORD 'szoba-kertesz_package';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE "szoba-kertesz" TO "szoba-kertesz_package";
GRANT USAGE ON SCHEMA public TO "szoba-kertesz_package";

-- OLVASÁS a determinisztikus validáláshoz (products, customers) — ez NEM a modell generálta
-- SQL, hanem a validatePackage/savePackage saját, kódból fixált lekérdezése (lásd
-- tools/package/package-validation.ts).
GRANT SELECT ON TABLE products TO "szoba-kertesz_package";
GRANT SELECT ON TABLE customers TO "szoba-kertesz_package";

-- ÍRÁS kizárólag a csomag-táblákra, APPEND-ONLY: nincs UPDATE, nincs DELETE.
GRANT SELECT, INSERT ON TABLE packages TO "szoba-kertesz_package";
GRANT SELECT, INSERT ON TABLE package_items TO "szoba-kertesz_package";
GRANT USAGE, SELECT ON SEQUENCE package_items_id_seq TO "szoba-kertesz_package";
