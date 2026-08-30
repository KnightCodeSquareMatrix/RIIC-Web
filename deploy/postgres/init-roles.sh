#!/bin/sh
set -eu
: "${AUTH_RUNTIME_USER:?}" "${AUTH_RUNTIME_PASSWORD:?}" "${AUTH_MIGRATION_USER:?}" "${AUTH_MIGRATION_PASSWORD:?}" "${AUTH_BACKUP_USER:?}" "${AUTH_BACKUP_PASSWORD:?}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=runtime_user="$AUTH_RUNTIME_USER" --set=runtime_password="$AUTH_RUNTIME_PASSWORD" \
  --set=migration_user="$AUTH_MIGRATION_USER" --set=migration_password="$AUTH_MIGRATION_PASSWORD" \
  --set=backup_user="$AUTH_BACKUP_USER" --set=backup_password="$AUTH_BACKUP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'runtime_user', :'runtime_password') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'migration_user', :'migration_password') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'backup_user', :'backup_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'migration_user') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'backup_user') \gexec
SELECT format('GRANT CREATE ON DATABASE %I TO %I', current_database(), :'migration_user') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION :"migration_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"migration_user";
GRANT USAGE ON SCHEMA public TO :"runtime_user";
GRANT USAGE ON SCHEMA public TO :"backup_user";
GRANT USAGE, CREATE ON SCHEMA app TO :"migration_user";
GRANT USAGE ON SCHEMA app TO :"runtime_user";
GRANT USAGE ON SCHEMA app TO :"backup_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"runtime_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" IN SCHEMA app GRANT USAGE, SELECT ON SEQUENCES TO :"runtime_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" GRANT USAGE ON SCHEMAS TO :"backup_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" GRANT SELECT ON TABLES TO :"backup_user";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_user" GRANT SELECT ON SEQUENCES TO :"backup_user";
SQL
