#!/usr/bin/env bash
set -euo pipefail
fail() { echo "[televote-aggregate-auth] FAIL: $*" >&2; exit 1; }
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
  if has_function_privilege('anon','public.studio2_televote_aggregate_snapshot(uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.studio2_update_televote_aggregate_totals(uuid,uuid,bigint,text,jsonb,text,text,uuid,text,uuid)','EXECUTE') then
    raise exception 'ANON_TELEVOTE_AGGREGATE_RPC_EXPOSED';
  end if;
  if not has_function_privilege('authenticated','public.studio2_televote_aggregate_snapshot(uuid,uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.studio2_update_televote_aggregate_totals(uuid,uuid,bigint,text,jsonb,text,text,uuid,text,uuid)','EXECUTE') then
    raise exception 'AUTHENTICATED_TELEVOTE_RPC_GRANT_MISSING';
  end if;
  if has_function_privilege('authenticated','private.studio2_televote_aggregate_totals(uuid)','EXECUTE') then
    raise exception 'PRIVATE_TELEVOTE_AGGREGATE_READER_EXPOSED';
  end if;
end
$grants$;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a291',true);
do $denied$
begin
  begin
    perform public.studio2_televote_aggregate_snapshot(
      '00000000-0000-4000-8000-00000000b291',
      '00000000-0000-4000-8000-00000000e291'
    );
    raise exception 'UNAUTHORIZED_TELEVOTE_SNAPSHOT_SUCCEEDED';
  exception when sqlstate '42501' then null;
  end;
  begin
    perform public.studio2_update_televote_aggregate_totals(
      '00000000-0000-4000-8000-00000000b291',
      '00000000-0000-4000-8000-00000000e291',
      0, repeat('a',64),
      '[{"participantId":"00000000-0000-4000-8000-00000000d291","points":1}]'::jsonb,
      'patch', 'Reject unprivileged Televote mutation',
      '00000000-0000-4000-8000-00000000c291','deny-televote-aggregate-change',null
    );
    raise exception 'UNAUTHORIZED_TELEVOTE_MUTATION_SUCCEEDED';
  exception when sqlstate '42501' then null;
  end;
end
$denied$;
rollback;
SQL
echo "[televote-aggregate-auth] PASS: unauthorized scope and RPC grants denied"
