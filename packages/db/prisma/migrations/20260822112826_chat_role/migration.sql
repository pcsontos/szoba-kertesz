-- A NEGYEDIK szerep: a beszélgetés-tár útja. A jogosultsági szétvágás nálunk nem
-- prompt-szabály, hanem Postgres-jog — ez a fájl a `<ts>_db_roles` migráció folytatása.
--
-- FONTOS: ennek a migrációnak a `threads`/`messages` táblák létrehozása UTÁN kell futnia
-- (a fájlnév időbélyege dönt), különben a GRANT nem létező táblára hivatkozna.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'szoba-kertesz_chat') THEN
    CREATE ROLE "szoba-kertesz_chat" LOGIN PASSWORD 'szoba-kertesz_chat';
  END IF;
END
$$;

-- Chat szerep: KIZÁRÓLAG a két beszélgetés-tábla. Se products, se knowledge_chunks,
-- se customers, se DELETE, se DDL.
GRANT CONNECT ON DATABASE "szoba-kertesz" TO "szoba-kertesz_chat";
GRANT USAGE ON SCHEMA public TO "szoba-kertesz_chat";
GRANT SELECT, INSERT, UPDATE ON TABLE threads TO "szoba-kertesz_chat";
GRANT SELECT, INSERT, UPDATE ON TABLE messages TO "szoba-kertesz_chat";
GRANT USAGE, SELECT ON SEQUENCE messages_id_seq TO "szoba-kertesz_chat";

-- A BESZÉLGETÉS TARTALMA NEM AGENT-LEKÉRDEZHETŐ ADAT.
--
-- A `<ts>_db_roles` migráció `ALTER DEFAULT PRIVILEGES … GRANT SELECT ON TABLES` sora
-- MINDEN később létrehozott táblára hat — a knowledge_chunks-ot ez tette ingyen
-- olvashatóvá, és ugyanez adná oda a messages-t is. Márpedig a query-agent runSql-je
-- SELECT-et futtathat, a guard pedig csak azt nézi, hogy SELECT-e és van-e LIMIT:
-- egy `SELECT * FROM messages LIMIT 50` átmenne, és a böngészőben ülő bárki
-- kiolvashatná az összes tárolt beszélgetést. Ezért itt visszavesszük.
--
-- A customers SZÁNDÉKOSAN marad olvasható a _ro szerepen: az üzleti adat, amit az
-- agent dolga használni. A beszélgetés nem az.
REVOKE SELECT ON TABLE threads FROM "szoba-kertesz_ro";
REVOKE SELECT ON TABLE messages FROM "szoba-kertesz_ro";
