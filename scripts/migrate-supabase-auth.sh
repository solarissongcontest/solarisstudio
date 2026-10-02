#!/usr/bin/env bash
set -Eeuo pipefail

# Solaris Studio: migrate Supabase Auth users between the old and new projects.
#
# This script deliberately runs OUTSIDE ChatGPT tooling so password hashes travel
# directly from source Postgres to target Postgres and are never printed.
#
# Required:
#   SOURCE_DB_URL  old project Postgres connection string
#   TARGET_DB_URL  new project Postgres connection string
#
# Optional:
#   AUTH_MIGRATION_BACKUP_DIR   where to keep the pre-migration target Auth backup
#
# Expected project refs are locked below to make accidental execution against the
# wrong database much harder.

SOURCE_PROJECT_REF="oxtbskojiexkaspputvo"
TARGET_PROJECT_REF="dkxmnvekiopyesuzggeu"
EXPECTED_USERS=31
EXPECTED_IDENTITIES=31
EXPECTED_PASSWORDS=31

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

for cmd in pg_dump psql mktemp; do
  command -v "$cmd" >/dev/null 2>&1 || die "$cmd is required but was not found."
done

: "${SOURCE_DB_URL:?Set SOURCE_DB_URL to the old Supabase Postgres connection string.}"
: "${TARGET_DB_URL:?Set TARGET_DB_URL to the new Supabase Postgres connection string.}"

[[ "$SOURCE_DB_URL" == *"$SOURCE_PROJECT_REF"* ]] ||
  die "SOURCE_DB_URL does not look like Solaris Studio source project $SOURCE_PROJECT_REF."
[[ "$TARGET_DB_URL" == *"$TARGET_PROJECT_REF"* ]] ||
  die "TARGET_DB_URL does not look like Solaris Studio target project $TARGET_PROJECT_REF."
[[ "$SOURCE_DB_URL" != "$TARGET_DB_URL" ]] || die "Source and target URLs are identical."

query_one() {
  local url="$1"
  local sql="$2"
  psql "$url" -X -qAt -v ON_ERROR_STOP=1 -c "$sql"
}

auth_counts_sql="
select
  (select count(*) from auth.users)::text || '|' ||
  (select count(*) from auth.identities)::text || '|' ||
  (select count(*) from auth.users where coalesce(encrypted_password,'') <> '')::text;
"

source_counts="$(query_one "$SOURCE_DB_URL" "$auth_counts_sql")"
target_counts="$(query_one "$TARGET_DB_URL" "$auth_counts_sql")"

printf 'Source Auth counts (users|identities|passwords): %s\n' "$source_counts"
printf 'Target Auth counts (users|identities|passwords): %s\n' "$target_counts"

[[ "$source_counts" == "$EXPECTED_USERS|$EXPECTED_IDENTITIES|$EXPECTED_PASSWORDS" ]] ||
  die "Source Auth state is not the expected 31|31|31. Aborting without changes."

# The current target intentionally contains placeholder auth.users rows only.
[[ "$target_counts" == "$EXPECTED_USERS|0|0" ]] ||
  die "Target Auth state is not the expected pre-migration 31|0|0. Aborting without changes."

# Verify that the placeholder UUID/email/metadata set already corresponds to source.
identity_fingerprint_sql="
select md5(coalesce(string_agg(
  id::text || '|' || coalesce(lower(email),'') || '|' ||
  coalesce(raw_app_meta_data::text,'') || '|' || coalesce(raw_user_meta_data::text,''),
  E'\\n' order by id
), ''))
from auth.users;
"
source_identity_fp="$(query_one "$SOURCE_DB_URL" "$identity_fingerprint_sql")"
target_identity_fp="$(query_one "$TARGET_DB_URL" "$identity_fingerprint_sql")"
[[ "$source_identity_fp" == "$target_identity_fp" ]] ||
  die "Source and target Auth user UUID/email/metadata fingerprints differ. Aborting."

backup_dir="${AUTH_MIGRATION_BACKUP_DIR:-.migration-backups}"
mkdir -p "$backup_dir"
chmod 700 "$backup_dir" || true
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target_backup="$backup_dir/target-auth-before-$timestamp.sql"

printf 'Creating rollback backup at %s ...\n' "$target_backup"
pg_dump "$TARGET_DB_URL"   --data-only   --column-inserts   --no-owner   --no-privileges   --table=auth.users   --table=auth.identities   > "$target_backup"
chmod 600 "$target_backup" || true

tmp_dump="$(mktemp)"
cleanup() {
  rm -f "$tmp_dump"
}
trap cleanup EXIT
chmod 600 "$tmp_dump" || true

printf 'Exporting source auth.users + auth.identities to a protected temporary file ...\n'
pg_dump "$SOURCE_DB_URL"   --data-only   --column-inserts   --no-owner   --no-privileges   --table=auth.users   --table=auth.identities   > "$tmp_dump"

# Sanity-check that pg_dump actually emitted both tables before touching target.
grep -q 'auth.users' "$tmp_dump" || die "Source dump does not contain auth.users."
grep -q 'auth.identities' "$tmp_dump" || die "Source dump does not contain auth.identities."

printf 'Replacing only target Auth user/identity rows in one transaction ...\n'
{
  printf '%s\n' 'BEGIN;'
  printf '%s\n' 'SET LOCAL session_replication_role = replica;'
  printf '%s\n' 'DELETE FROM auth.identities;'
  printf '%s\n' 'DELETE FROM auth.users;'
  cat "$tmp_dump"
  printf '%s\n' 'SET LOCAL session_replication_role = origin;'
  printf '%s\n' 'COMMIT;'
} | psql "$TARGET_DB_URL" -X -v ON_ERROR_STOP=1

post_counts="$(query_one "$TARGET_DB_URL" "$auth_counts_sql")"
printf 'Target Auth after migration (users|identities|passwords): %s\n' "$post_counts"
[[ "$post_counts" == "$EXPECTED_USERS|$EXPECTED_IDENTITIES|$EXPECTED_PASSWORDS" ]] ||
  die "Post-migration Auth counts are wrong. Use the rollback backup before doing anything else."

# Compare the actual credential set without printing any password hash or digest.
password_fingerprint_sql="
select md5(coalesce(string_agg(
  id::text || '|' || coalesce(encrypted_password,''),
  E'\\n' order by id
), ''))
from auth.users;
"
identity_rows_fingerprint_sql="
select md5(coalesce(string_agg(
  id::text || '|' || user_id::text || '|' || provider || '|' ||
  coalesce(provider_id,'') || '|' || coalesce(identity_data::text,''),
  E'\\n' order by id
), ''))
from auth.identities;
"

source_password_fp="$(query_one "$SOURCE_DB_URL" "$password_fingerprint_sql")"
target_password_fp="$(query_one "$TARGET_DB_URL" "$password_fingerprint_sql")"
source_identities_fp="$(query_one "$SOURCE_DB_URL" "$identity_rows_fingerprint_sql")"
target_identities_fp="$(query_one "$TARGET_DB_URL" "$identity_rows_fingerprint_sql")"

[[ "$source_password_fp" == "$target_password_fp" ]] ||
  die "Password credential fingerprints differ after migration."
[[ "$source_identities_fp" == "$target_identities_fp" ]] ||
  die "Identity row fingerprints differ after migration."

# Ensure every Solaris application FK still points at an existing auth user.
printf 'Checking application foreign keys to auth.users ...\n'
psql "$TARGET_DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
do $$
declare
  r record;
  orphan_count bigint;
begin
  for r in
    select
      n.nspname as schema_name,
      c.relname as table_name,
      a.attname as column_name
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    join unnest(con.conkey) with ordinality ck(attnum, ord) on true
    join unnest(con.confkey) with ordinality fk(attnum, ord) using (ord)
    join pg_attribute a on a.attrelid = c.oid and a.attnum = ck.attnum
    join pg_attribute ra on ra.attrelid = con.confrelid and ra.attnum = fk.attnum
    where con.contype = 'f'
      and con.confrelid = 'auth.users'::regclass
      and ra.attname = 'id'
      and n.nspname in ('public','televoting')
  loop
    execute format(
      'select count(*) from %I.%I t left join auth.users u on u.id = t.%I where t.%I is not null and u.id is null',
      r.schema_name, r.table_name, r.column_name, r.column_name
    )
    into orphan_count;

    if orphan_count <> 0 then
      raise exception
        'Auth migration left % orphan row(s) in %.% column %',
        orphan_count, r.schema_name, r.table_name, r.column_name;
    end if;
  end loop;
end
$$;
SQL

printf '\nAuth migration verified successfully.\n'
printf '  users:      %s\n' "$EXPECTED_USERS"
printf '  identities: %s\n' "$EXPECTED_IDENTITIES"
printf '  passwords:  %s\n' "$EXPECTED_PASSWORDS"
printf '  UUID/email/metadata fingerprint: match\n'
printf '  password credential fingerprint: match\n'
printf '  identity-row fingerprint: match\n'
printf '\nExisting JWT sessions from the old project may still require a fresh login because the new project has its own signing configuration.\n'
printf 'Rollback backup retained at: %s\n' "$target_backup"
