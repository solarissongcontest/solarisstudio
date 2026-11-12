#!/usr/bin/env bash
set -euo pipefail
fail() { echo "[jury-roster-auth] FAIL: $*" >&2; exit 1; }
eval "$(supabase status -o env)"
: "${API_URL:?missing local API_URL}"
: "${DB_URL:?missing local DB_URL}"
api_pattern='^http://(127[.]0[.]0[.]1|localhost):[0-9]+$'
db_pattern='^postgres(ql)?://postgres:postgres@(127[.]0[.]0[.]1|localhost):[0-9]+/postgres$'
[[ "$API_URL" =~ $api_pattern ]] || fail "Refusing hosted API"
[[ "$DB_URL" =~ $db_pattern ]] || fail "Refusing hosted database"

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
begin;
do $grants$
begin
  if has_function_privilege('anon','public.studio2_jury_roster_preview(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.studio2_apply_jury_roster_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)','EXECUTE') then
    raise exception 'ANON_JURY_ROSTER_EXECUTE_EXPOSED';
  end if;
  if not has_function_privilege('authenticated','public.studio2_jury_roster_preview(uuid,uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.studio2_apply_jury_roster_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)','EXECUTE') then
    raise exception 'AUTHENTICATED_JURY_RPC_GRANT_MISSING';
  end if;
  if has_function_privilege('authenticated','private.v3_bump_jury_roster_version(uuid,uuid)','EXECUTE') then
    raise exception 'PRIVATE_ROSTER_VERSION_MUTATOR_EXPOSED';
  end if;
end
$grants$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-00000000a191', true);
do $deny$
begin
  begin
    perform public.studio2_jury_roster_preview(
      '00000000-0000-4000-8000-00000000e191',
      '00000000-0000-4000-8000-00000000b191'
    );
    raise exception 'UNAUTHORIZED_JURY_PREVIEW_SUCCEEDED';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.studio2_apply_jury_roster_change(
      '00000000-0000-4000-8000-00000000e191',
      '00000000-0000-4000-8000-00000000b191',
      'add', '{"name":"Unauthorized","kind":"country"}'::jsonb,
      'Deny unprivileged roster mutation',
      '00000000-0000-4000-8000-00000000c191',
      'deny-roster-mutation',
      1
    );
    raise exception 'UNAUTHORIZED_JURY_MUTATION_SUCCEEDED';
  exception when sqlstate '42501' then null;
  end;
end
$deny$;
rollback;
SQL
echo "[jury-roster-auth] PASS: anonymous and non-capable callers denied"
