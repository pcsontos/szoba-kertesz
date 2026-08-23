-- A `szoba-kertesz_ro` szerep jogai EXPLICITTÉ téve — a #8 PR-review 5. tétele.
--
-- A PROBLÉMA: a `<ts>_db_roles` migráció `ALTER DEFAULT PRIVILEGES … GRANT SELECT ON
-- TABLES` sora MINDEN ezután létrehozott táblát automatikusan olvashatóvá tett a
-- query-agent `runSql`-je számára. A `threads`/`messages` REVOKE-ja emiatt csak
-- egyszeri javítás volt, nem álló szabály: a következő nem-katalógus tábla (pl. a C
-- fázis csomag-táblái) ugyanebbe a csapdába sétálna bele, némán.
--
-- A MEGOLDÁS: a default privilege visszavétele, és a jelenleg olvasható táblák
-- EXPLICIT grantja. Mostantól minden új tábla alapból LÁTHATATLAN a `_ro`-nak, és aki
-- olvashatóvá akarja tenni, annak ki kell írnia. A `db-readonly.spec.ts`
-- engedélylista-tesztje elbukik, ha ez elmarad — a szabály tehát nemcsak leírva van.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE SELECT ON TABLES FROM "szoba-kertesz_ro";

-- A katalógus-oldal három táblája: eddig is olvasható volt, mostantól SZÁNDÉKBÓL az.
GRANT SELECT ON TABLE products TO "szoba-kertesz_ro";
GRANT SELECT ON TABLE customers TO "szoba-kertesz_ro";
GRANT SELECT ON TABLE knowledge_chunks TO "szoba-kertesz_ro";

-- A Prisma migrációs naplója nem az agent dolga — a szóró grant adta oda, nem döntés.
REVOKE SELECT ON TABLE _prisma_migrations FROM "szoba-kertesz_ro";
