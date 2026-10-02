#!/usr/bin/env bash
set -Eeuo pipefail

# Solaris Studio: copy the remaining Supabase Storage binary objects.
#
# The target buckets and Storage RLS policies are already migrated. This script
# only copies the actual files from the old project to the new project.
#
# Prerequisites:
#   - Supabase CLI authenticated (supabase login or SUPABASE_ACCESS_TOKEN)
#   - old project Storage service is accessible again
#   - optional SOURCE_DB_PASSWORD / TARGET_DB_PASSWORD for non-interactive linking
#   - optional TARGET_DB_URL for final SQL count verification

SOURCE_PROJECT_REF="oxtbskojiexkaspputvo"
TARGET_PROJECT_REF="dkxmnvekiopyesuzggeu"

# Only buckets with actual objects need copying.
BUCKETS=("beta-feedback" "country-media" "edition-artwork")
EXPECTED_TOTAL=55

die() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v supabase >/dev/null 2>&1 || die "Supabase CLI is required."
command -v find >/dev/null 2>&1 || die "find is required."

link_project() {
  local ref="$1"
  local password="$2"
  if [[ -n "$password" ]]; then
    SUPABASE_DB_PASSWORD="$password" supabase link --project-ref "$ref"
  else
    supabase link --project-ref "$ref"
  fi
}

workdir="$(mktemp -d)"
cleanup() {
  rm -rf "$workdir"
}
trap cleanup EXIT

printf 'Linking CLI to source project %s ...\n' "$SOURCE_PROJECT_REF"
link_project "$SOURCE_PROJECT_REF" "${SOURCE_DB_PASSWORD:-}"

printf 'Downloading Storage objects from source ...\n'
for bucket in "${BUCKETS[@]}"; do
  mkdir -p "$workdir/$bucket"
  supabase storage cp "ss:///$bucket" "$workdir/$bucket" -r --experimental
done

beta_count="$(find "$workdir/beta-feedback" -type f | wc -l | tr -d ' ')"
country_count="$(find "$workdir/country-media" -type f | wc -l | tr -d ' ')"
edition_count="$(find "$workdir/edition-artwork" -type f | wc -l | tr -d ' ')"
total_count=$((beta_count + country_count + edition_count))

printf 'Downloaded object counts:\n'
printf '  beta-feedback:  %s (expected 1)\n' "$beta_count"
printf '  country-media:  %s (expected 47)\n' "$country_count"
printf '  edition-artwork:%s (expected 7)\n' "$edition_count"
printf '  total:          %s (expected %s)\n' "$total_count" "$EXPECTED_TOTAL"

[[ "$beta_count" == "1" ]] || die "beta-feedback download count is wrong."
[[ "$country_count" == "47" ]] || die "country-media download count is wrong."
[[ "$edition_count" == "7" ]] || die "edition-artwork download count is wrong."
[[ "$total_count" == "$EXPECTED_TOTAL" ]] || die "Downloaded Storage total is wrong."

printf 'Linking CLI to target project %s ...\n' "$TARGET_PROJECT_REF"
link_project "$TARGET_PROJECT_REF" "${TARGET_DB_PASSWORD:-}"

printf 'Uploading Storage objects to target ...\n'
for bucket in "${BUCKETS[@]}"; do
  supabase storage cp "$workdir/$bucket" "ss:///$bucket" -r --experimental
done

# If a target database URL is supplied, verify the Storage metadata written by
# the Storage API. This does not inspect or expose object contents.
if [[ -n "${TARGET_DB_URL:-}" ]]; then
  command -v psql >/dev/null 2>&1 || die "psql is required when TARGET_DB_URL is set."
  target_counts="$(psql "$TARGET_DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "
    select
      count(*)::text || '|' ||
      count(*) filter (where bucket_id='beta-feedback')::text || '|' ||
      count(*) filter (where bucket_id='country-media')::text || '|' ||
      count(*) filter (where bucket_id='edition-artwork')::text
    from storage.objects;
  ")"
  printf 'Target Storage metadata (total|beta|country|edition): %s\n' "$target_counts"
  [[ "$target_counts" == "55|1|47|7" ]] ||
    die "Target Storage metadata counts do not match 55|1|47|7."
fi

printf '\nStorage transfer completed successfully.\n'
printf 'The empty country-fonts and integrity-evidence buckets already exist on the target and need no binary copy.\n'
