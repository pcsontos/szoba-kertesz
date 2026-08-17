-- „Egy termék csak EGYSZER szerepel — a latin név a kulcs."
--
-- Ez az invariáns eddig KIZÁRÓLAG a kódban élt (upsert-product-tool.ts: SELECT →
-- INSERT vagy UPDATE, két külön lekérdezésben), a Postgres nem tudott róla. Két
-- egyidejű upsert ugyanarra a névre így két sort hozott létre: mindkét SELECT
-- üres volt, mielőtt bármelyik INSERT lefutott volna. Ugyanez történt egy
-- újrapróbált tool-hívásnál is.
--
-- A kulcs `lower(latin_name)`, mert az upsert szándékosan kis/nagybetű-független
-- ("Monstera deliciosa" == "monstera deliciosa"). Ehhez KIFEJEZÉS-index kell,
-- amit a Prisma sémanyelve nem tud leírni — ezért él a szabály itt, nyers SQL-ben,
-- ahogy a db_roles migrációban a grantok.
--
-- FIGYELEM: az `upsertProduct` `ON CONFLICT (lower(latin_name))` célpontja pontosan
-- EZT a kifejezést keresi. Ha az index kifejezése változik, az írási út áll meg —
-- a kettőt együtt kell módosítani.
--
-- Ez ugyanaz az elv, mint a Task 6-nál: a határt nem a prompt és nem is a kód
-- őrzi, hanem az adatbázis.

CREATE UNIQUE INDEX IF NOT EXISTS products_latin_name_lower_key
  ON products (lower(latin_name));
