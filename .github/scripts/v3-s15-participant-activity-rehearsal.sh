#!/usr/bin/env bash
set -euo pipefail
fail() { printf '[v3-s15-activity] FAIL: %s\n' "$*" >&2; exit 1; }

# This rehearsal inserts disposable users and operation receipts. NEVER run it
# against hosted/production Supabase, even for a read-only smoke test.
eval "$(supabase status -o env)"
: "$API_URL"; : "$DB_URL"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Non-loopback API refused" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Non-local postgres refused" ;;
esac

# Test fixtures live inside a single database transaction; success rolls back
# and failure makes psql disconnect/roll back. No permanent test identities.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
begin;
do $guard$
begin
  if exists (select 1 from auth.users where id in (
    '00000000-0000-4000-8000-00000000a721'::uuid,
    '00000000-0000-4000-8000-00000000a722'::uuid
  )) then
    raise exception 'Use a clean local fixture database';
  end if;
  if has_function_privilege('anon',
    'public.v3_my_participant_activity(timestamptz,integer,uuid)', 'EXECUTE') then
    raise exception 'Anonymous role has private Activity EXECUTE';
  end if;
  if not has_function_privilege('authenticated',
    'public.v3_my_participant_activity(timestamptz,integer,uuid)', 'EXECUTE') then
    raise exception 'Authenticated Activity permission is missing';
  end if;
end $guard$;

insert into auth.users(id,aud,role,email,created_at,updated_at) values
('00000000-0000-4000-8000-00000000a721','authenticated','authenticated','s15-activity-a@local.invalid',now(),now()),
('00000000-0000-4000-8000-00000000a722','authenticated','authenticated','s15-activity-b@local.invalid',now(),now());

insert into public.studio2_operation_receipts(
  operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,
  command,risk_class,scope,status,result,completed_at
) values
('00000000-0000-4000-8000-00000000b721','00000000-0000-4000-8000-00000000a721','s15-activity-a1',
 '00000000-0000-4000-8000-00000000b721',repeat('a',64),'confirmation.submit','R2','{}','succeeded',
 '{"submissionId":"00000000-0000-4000-8000-00000000f721","secret":"private-s15-marker"}','2026-11-04T08:00:00Z'),
('00000000-0000-4000-8000-00000000b722','00000000-0000-4000-8000-00000000a721','s15-activity-a2',
 '00000000-0000-4000-8000-00000000b722',repeat('b',64),'entry.submit','R2','{}','succeeded',
 '{"entryVersionId":"00000000-0000-4000-8000-00000000f722","secret":"private-s15-marker"}','2026-11-04T08:00:00Z'),
('00000000-0000-4000-8000-00000000b723','00000000-0000-4000-8000-00000000a722','s15-activity-b1',
 '00000000-0000-4000-8000-00000000b723',repeat('c',64),'televote.submit','R2','{}','succeeded',
 '{"submissionId":"00000000-0000-4000-8000-00000000f723","secret":"private-s15-marker"}','2026-11-04T08:00:00Z');

set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
do $anon$
declare rejected boolean := false;
begin
  begin
    perform public.v3_my_participant_activity();
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then raise exception 'Anon read private Activity'; end if;
end $anon$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a721',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $a$
declare full_page jsonb; page1 jsonb; page2 jsonb; bad_cursor boolean := false;
begin
  full_page := public.v3_my_participant_activity(null,30,null);
  if jsonb_array_length(full_page->'items') <> 2
    or full_page->'items'->0->>'id' <> '00000000-0000-4000-8000-00000000b722'
    or full_page->'items'->1->>'id' <> '00000000-0000-4000-8000-00000000b721'
  then raise exception 'Viewer A scope/order mismatch: %', full_page; end if;
  if full_page::text like '%private-s15-marker%'
    or full_page::text like '%request_fingerprint%'
    or full_page::text like '%idempotency_key%'
  then raise exception 'Private receipt content leaked'; end if;
  page1 := public.v3_my_participant_activity(null,1,null);
  if page1->>'next_operation_id' <> '00000000-0000-4000-8000-00000000b722'
  then raise exception 'Bad Activity cursor: %', page1; end if;
  page2 := public.v3_my_participant_activity(
    (page1->>'next_before')::timestamptz,1,(page1->>'next_operation_id')::uuid
  );
  if page2->'items'->0->>'id' <> '00000000-0000-4000-8000-00000000b721'
    or page2->'next_before' <> 'null'::jsonb
  then raise exception 'Bad Activity continuation: %', page2; end if;
  begin
    perform public.v3_my_participant_activity(null,1,'00000000-0000-4000-8000-00000000b721');
  exception when invalid_parameter_value then bad_cursor := true;
  end;
  if not bad_cursor then raise exception 'Dangling operation cursor accepted'; end if;
end $a$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a722',true);
do $b$
declare body jsonb;
begin
  body := public.v3_my_participant_activity(null,30,null);
  if jsonb_array_length(body->'items') <> 1
     or body->'items'->0->>'id' <> '00000000-0000-4000-8000-00000000b723'
  then raise exception 'Viewer B crossed recipient boundary: %', body; end if;
  if body::text like '%private-s15-marker%'
  then raise exception 'Private receipt payload leaked to viewer B'; end if;
end $b$;
rollback;
SQL
printf '[v3-s15-activity] PASS: recipient isolation, anonymous rejection, cursor, metadata privacy; fixtures rolled back\n'
