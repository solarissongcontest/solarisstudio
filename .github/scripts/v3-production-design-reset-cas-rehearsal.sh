#!/usr/bin/env bash
set -euo pipefail

fail() { printf '[v3-production-reset] FAIL: %s\n' "$*" >&2; exit 1; }

# This script performs fixture writes ONLY on an isolated local Supabase.
# Reject hostname/userinfo/query-string/libpq host overrides before psql starts.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
api_pattern='^http://(127[.]0[.]0[.]1|localhost):[0-9]+$'
database_pattern='^postgres(ql)?://postgres:postgres@(127[.]0[.]0[.]1|localhost):[0-9]+/postgres$'
[[ "$API_URL" =~ $api_pattern ]] || fail "Refusing hosted Supabase API"
[[ "$DB_URL" =~ $database_pattern ]] || fail "Refusing non-local database"

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
begin;

-- Two different source shows inside a single edition, with a third show in a
-- distinct edition. All test fixture writes are transaction-rolled-back.
insert into public.themes(id,name,config,is_public) values
 ('00000000-0000-4000-8000-00000000dd91','Reset source theme','{"scoreboardConfig":{"columns":2}}'::jsonb,false),
 ('00000000-0000-4000-8000-00000000dd92','Reset target override','{"scoreboardConfig":{"columns":1}}'::jsonb,false);
insert into public.editions(id,name,slug,edition_number,status,published,theme_id) values
 ('00000000-0000-4000-8000-00000000ed91','Reset CAS Edition','reset-cas-local-91',9891,'draft',false,'00000000-0000-4000-8000-00000000dd91'),
 ('00000000-0000-4000-8000-00000000ed92','Other Reset CAS Edition','reset-cas-local-92',9892,'draft',false,'00000000-0000-4000-8000-00000000dd92');
insert into public.shows(id,edition_id,name,kind,sort_order,published,theme_id,broadcast_config) values
 ('00000000-0000-4000-8000-00000000aa91','00000000-0000-4000-8000-00000000ed91','Target A','grand-final',1,false,'00000000-0000-4000-8000-00000000dd92','{"source":"target-override"}'::jsonb),
 ('00000000-0000-4000-8000-00000000bb91','00000000-0000-4000-8000-00000000ed91','Inherited source B','semi-final',2,false,'00000000-0000-4000-8000-00000000dd91','{"source":"inherited-before"}'::jsonb),
 ('00000000-0000-4000-8000-00000000cc91','00000000-0000-4000-8000-00000000ed92','Other edition show','grand-final',1,false,'00000000-0000-4000-8000-00000000dd92','{"source":"unrelated"}'::jsonb);

do $fixture$
declare
  edition_a uuid := '00000000-0000-4000-8000-00000000ed91';
  target_a uuid := '00000000-0000-4000-8000-00000000aa91';
  inherited_b uuid := '00000000-0000-4000-8000-00000000bb91';
  unrelated_c uuid := '00000000-0000-4000-8000-00000000cc91';
  version_target_before text;
  version_edition_before text;
  version_target_after text;
  version_edition_after text;
begin
  select private.v3_production_design_state_version(
    private.v3_production_design_snapshot(edition_a, target_a)
  ) into version_target_before;
  select private.v3_production_design_state_version(
    private.v3_production_design_snapshot(edition_a, null)
  ) into version_edition_before;
  if version_target_before is null or version_edition_before is null
     or length(version_edition_before) <> 64 then
    raise exception 'INITIAL_PRODUCTION_CAS_INVALID';
  end if;
  if jsonb_array_length(
    private.v3_production_design_snapshot(edition_a, null) -> 'shows'
  ) <> 2 then
    raise exception 'INHERITED_SOURCES_NOT_FULLY_BOUND';
  end if;

  -- A source B change must invalidate reset of target A, even though target
  -- A's show-only projection would not detect this race.
  update public.shows set broadcast_config = '{"source":"inherited-after"}'::jsonb
  where id = inherited_b;
  select private.v3_production_design_state_version(
    private.v3_production_design_snapshot(edition_a, target_a)
  ) into version_target_after;
  select private.v3_production_design_state_version(
    private.v3_production_design_snapshot(edition_a, null)
  ) into version_edition_after;

  if version_target_after is distinct from version_target_before then
    raise exception 'SHOW_ONLY_CONTROL_CHANGED_UNEXPECTEDLY';
  end if;
  if version_edition_after = version_edition_before then
    raise exception 'SOURCE_CHANGE_DID_NOT_INVALIDATE_RESET_CAS';
  end if;

  -- Changes outside the exact edition cannot invalidate its reviewed hash.
  update public.shows set broadcast_config='{"source":"external-change"}'::jsonb
  where id = unrelated_c;
  if private.v3_production_design_state_version(
    private.v3_production_design_snapshot(edition_a, null)
  ) is distinct from version_edition_after then
    raise exception 'CROSS_EDITION_RESET_CAS_CONTAMINATION';
  end if;
end
$fixture$;

rollback;
SQL

printf '[v3-production-reset] PASS: exact-edition source change invalidates reset CAS\n'
