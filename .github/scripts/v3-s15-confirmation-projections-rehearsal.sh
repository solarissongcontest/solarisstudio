#!/usr/bin/env bash
set -euo pipefail
fail() { printf '[v3-s15-confirmation] FAIL: %s\n' "$*" >&2; exit 1; }

# Credentials are seeded ONLY in disposable LOCAL Supabase. Never target hosted
# Supabase, including as a convenient smoke test or during migration rehearsal.
# A Codespace can have Bun but no globally installed Supabase binary.
# Match the CLI version used by the existing S14 GitHub workflows.
if ! command -v psql >/dev/null 2>&1; then
  fail "PostgreSQL client (psql) is missing. Use the GitHub Actions local rehearsal or install a local client."
fi
if ! command -v supabase >/dev/null 2>&1; then
  if [[ -x ./node_modules/.bin/supabase ]]; then
    supabase() { ./node_modules/.bin/supabase "$@"; }
  elif command -v bunx >/dev/null 2>&1; then
    supabase() { bunx supabase@2.113.0 "$@"; }
  else
    fail "Supabase CLI is missing. Install the project CLI or run the GitHub Actions rehearsal."
  fi
fi
if ! local_status="$(supabase status -o env)"; then
  fail "No running local Supabase stack. Start an isolated local stack before this rehearsal."
fi
eval "$local_status"
if [[ -z "${API_URL:-}" || -z "${DB_URL:-}" ]]; then
  fail "Local Supabase status did not provide API_URL and DB_URL"
fi
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Non-loopback API refused" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Non-local postgres refused" ;;
esac

# All fixtures are transaction-scoped, and rollback runs on success.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
begin;
do $guard$
begin
  if exists (
    select 1 from auth.users
    where id in (
      '00000000-0000-4000-8000-00000000a731'::uuid,
      '00000000-0000-4000-8000-00000000a732'::uuid
    )
  ) then raise exception 'Expected clean local identities'; end if;
  if has_function_privilege('anon',
      'public.admin_confirmation_recovery_codes_v2(uuid,integer,timestamptz,uuid)',
      'EXECUTE')
     or has_function_privilege('anon',
      'public.admin_confirmation_responses_v2(uuid,integer,timestamptz,uuid)',
      'EXECUTE')
  then raise exception 'Anonymous role can execute Organizer Confirmation projections'; end if;
end $guard$;

insert into auth.users(id,aud,role,email,created_at,updated_at)
values
('00000000-0000-4000-8000-00000000a731','authenticated','authenticated','s15-inspector@local.invalid',now(),now()),
('00000000-0000-4000-8000-00000000a732','authenticated','authenticated','s15-manager@local.invalid',now(),now());

insert into public.editions(id,name,slug,edition_number,year,status,published)
values
('00000000-0000-4000-8000-00000000e731','S15 Confirmation A','s15-projection-a',9731,2026,'active',false),
('00000000-0000-4000-8000-00000000e732','S15 Confirmation B','s15-projection-b',9732,2026,'active',false);

insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled)
values
('00000000-0000-4000-8000-00000000c731','00000000-0000-4000-8000-00000000e731','S15 round A','open',now()-interval '1 day',now()+interval '1 day',true),
('00000000-0000-4000-8000-00000000c732','00000000-0000-4000-8000-00000000e732','S15 round B','open',now()-interval '1 day',now()+interval '1 day',true);

insert into public.submissions(id,edition_id,round_id,instagram_username,country,recovery_code)
values
('00000000-0000-4000-8000-00000000f731','00000000-0000-4000-8000-00000000e731','00000000-0000-4000-8000-00000000c731','s15_a_one','S15 A One','S15_A_ONE_CREDENTIAL'),
('00000000-0000-4000-8000-00000000f732','00000000-0000-4000-8000-00000000e731','00000000-0000-4000-8000-00000000c731','s15_a_two','S15 A Two','S15_A_TWO_CREDENTIAL'),
('00000000-0000-4000-8000-00000000f733','00000000-0000-4000-8000-00000000e732','00000000-0000-4000-8000-00000000c732','s15_b_one','S15 B One','S15_B_ONE_CREDENTIAL');

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
('00000000-0000-4000-8000-00000000a731','confirmation.read','00000000-0000-4000-8000-00000000e731'),
('00000000-0000-4000-8000-00000000a732','confirmation.read','00000000-0000-4000-8000-00000000e731'),
('00000000-0000-4000-8000-00000000a732','confirmation.manage','00000000-0000-4000-8000-00000000e731');

set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
do $anonymous$
declare rejected_read boolean := false; rejected_credentials boolean := false;
begin
  begin perform public.admin_confirmation_responses_v2(
    '00000000-0000-4000-8000-00000000e731');
  exception when insufficient_privilege then rejected_read := true; end;
  begin perform public.admin_confirmation_recovery_codes_v2(
    '00000000-0000-4000-8000-00000000e731');
  exception when insufficient_privilege then rejected_credentials := true; end;
  if not rejected_read or not rejected_credentials
  then raise exception 'Anonymous Confirmation projection access succeeded'; end if;
end $anonymous$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a731',true);
do $inspector$
declare data jsonb; page1 jsonb; page2 jsonb;
        denied_credentials boolean := false; denied_b boolean := false;
begin
  data := public.admin_confirmation_responses_v2(
    '00000000-0000-4000-8000-00000000e731');
  if (data->>'editionId') <> '00000000-0000-4000-8000-00000000e731'
    or jsonb_array_length(data->'rows') <> 2
    or (data->>'totalCount')::integer <> 2
    or data->>'stateVersion' is null
    or data::text like '%S15_B_ONE_CREDENTIAL%'
    or data::text like '%S15_A_ONE_CREDENTIAL%'
  then raise exception 'Read-only inspector response scope failed: %', data; end if;
  page1 := public.admin_confirmation_responses_v2(
    '00000000-0000-4000-8000-00000000e731',1);
  if (page1->'page'->>'hasMore')::boolean is distinct from true
     or page1->'page'->'nextCursor' is null
  then raise exception 'Response keyset first page missing'; end if;
  page2 := public.admin_confirmation_responses_v2(
    '00000000-0000-4000-8000-00000000e731',
    1,(page1->'page'->'nextCursor'->>'submittedAt')::timestamptz,
    (page1->'page'->'nextCursor'->>'submissionId')::uuid
  );
  if jsonb_array_length(page2->'rows') <> 1
    or page1->'rows'->0->>'id' = page2->'rows'->0->>'id'
  then raise exception 'Response keyset continuation failed'; end if;
  begin perform public.admin_confirmation_recovery_codes_v2(
    '00000000-0000-4000-8000-00000000e731');
  exception when insufficient_privilege then denied_credentials := true; end;
  begin perform public.admin_confirmation_responses_v2(
    '00000000-0000-4000-8000-00000000e732');
  exception when insufficient_privilege then denied_b := true; end;
  if not denied_credentials or not denied_b
  then raise exception 'Read-only inspector crossed capability boundary'; end if;
end $inspector$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a732',true);
do $manager$
declare codes jsonb; denied_b boolean := false;
begin
  codes := public.admin_confirmation_recovery_codes_v2(
    '00000000-0000-4000-8000-00000000e731');
  if (codes->>'editionId') <> '00000000-0000-4000-8000-00000000e731'
    or jsonb_array_length(codes->'rows') <> 2
    or codes::text not like '%S15_A_ONE_CREDENTIAL%'
    or codes::text like '%S15_B_ONE_CREDENTIAL%'
  then raise exception 'Manager exact-edition recovery projection failed'; end if;
  begin perform public.admin_confirmation_recovery_codes_v2(
    '00000000-0000-4000-8000-00000000e732');
  exception when insufficient_privilege then denied_b := true; end;
  if not denied_b then raise exception 'Manager accessed recovery credentials for Edition B'; end if;
end $manager$;
rollback;
SQL
printf '[v3-s15-confirmation] PASS: read/manage separation, exact-edition isolation, anonymous denial and paging; rolled back\n'
