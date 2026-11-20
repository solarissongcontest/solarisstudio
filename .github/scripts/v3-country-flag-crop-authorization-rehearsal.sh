#!/usr/bin/env bash
set -euo pipefail
fail() { echo "[flag-crop-auth] FAIL: $*" >&2; exit 1; }
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
  if has_function_privilege('anon','public.studio2_country_flag_crop_preflight(uuid)','EXECUTE')
     or has_function_privilege('anon','public.studio2_update_country_flag_crop(uuid,numeric,numeric,numeric,text,uuid,text)','EXECUTE') then
    raise exception 'ANONYMOUS_FLAG_CROP_RPC_EXPOSED';
  end if;
  if not has_function_privilege('authenticated','public.studio2_country_flag_crop_preflight(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.studio2_update_country_flag_crop(uuid,numeric,numeric,numeric,text,uuid,text)','EXECUTE') then
    raise exception 'AUTHENTICATED_FLAG_CROP_RPC_GRANT_MISSING';
  end if;
  if has_function_privilege('authenticated','private.v3_country_flag_crop_state_version(uuid,text,numeric,numeric,numeric)','EXECUTE') then
    raise exception 'PRIVATE_FLAG_CROP_HASH_EXPOSED';
  end if;
end
$grants$;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a391',true);
do $deny$
begin
  begin
    perform public.studio2_country_flag_crop_preflight(
      '00000000-0000-4000-8000-00000000c391'
    );
    raise exception 'UNAUTHORIZED_FLAG_CROP_PREVIEW_SUCCEEDED';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.studio2_update_country_flag_crop(
      '00000000-0000-4000-8000-00000000c391',
      50, 50, 1,
      repeat('a',64),
      '00000000-0000-4000-8000-00000000d391',
      'deny-flag-crop-unprivileged'
    );
    raise exception 'UNAUTHORIZED_FLAG_CROP_MUTATION_SUCCEEDED';
  exception when sqlstate '42501' then null;
  end;
end
$deny$;
rollback;
SQL
echo "[flag-crop-auth] PASS: anonymous and unprivileged country identity commands denied"
