CREATE USER "szoba-kertesz_ro" WITH PASSWORD 'szoba-kertesz_ro';
GRANT CONNECT ON DATABASE "szoba-kertesz" TO "szoba-kertesz_ro";
GRANT USAGE ON SCHEMA public TO "szoba-kertesz_ro";
GRANT SELECT ON ALL TABLES IN SCHEMA public TO "szoba-kertesz_ro";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO "szoba-kertesz_ro";
