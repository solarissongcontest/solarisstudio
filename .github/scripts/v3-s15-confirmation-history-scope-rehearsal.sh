#!/usr/bin/env bash
set -euo pipefail
fail() { printf '[S15 history scope] FAIL: %s\n' "$*" >&2; exit 1; }

command -v psql >/dev/null 2>&1 || fail "psql client is required"
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI is required (GitHub Actions supplies it)"

local_status="$(supabase status -o env)" || fail "No disposable local Supabase running"
eval "$local_status"
case "${API_URL:-}" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing non-loopback Supabase API" ;;
esac
case "${DB_URL:-}" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database" ;;
esac

# All credential-like test fixtures are local-only and rolled back.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 <<'SQL'
begin;

do $guard$
begin
  if has_function_privilege(
       'anon',
       'public.admin_confirmation_version_summary_v2(uuid,uuid[])',
       'EXECUTE'
     ) then
    raise exception 'Anonymous history summary execute is exposed';
  end if;
end
$guard$;

insert into auth.users(id,aud,role,email,created_at,updated_at)
values
('00000000-0000-4000-8000-00000000a741','authenticated','authenticated','s15-history-a@local.invalid',now(),now()),
('00000000-0000-4000-8000-00000000a742','authenticated','authenticated','s15-history-b@local.invalid',now(),now());

insert into public.editions(id,name,slug,edition_number,year,status,published)
values
('00000000-0000-4000-8000-00000000e741','S15 History A','s15-history-a',9741,2026,'active',false),
('00000000-0000-4000-8000-00000000e742','S15 History B','s15-history-b',9742,2026,'active',false);

insert into public.submission_rounds(id,edition_id,name,status,opens_at,closes_at,editing_enabled)
values
('00000000-0000-4000-8000-00000000c741','00000000-0000-4000-8000-00000000e741','History A','open',now()-interval '1 day',now()+interval '1 day',true),
('00000000-0000-4000-8000-00000000c742','00000000-0000-4000-8000-00000000e742','History B','open',now()-interval '1 day',now()+interval '1 day',true);

insert into public.submissions(id,edition_id,round_id,instagram_username,country)
values
('00000000-0000-4000-8000-00000000f741','00000000-0000-4000-8000-00000000e741','00000000-0000-4000-8000-00000000c741','history_a_one','History A One'),
('00000000-0000-4000-8000-00000000f742','00000000-0000-4000-8000-00000000e741','00000000-0000-4000-8000-00000000c741','history_a_two','History A Two'),
('00000000-0000-4000-8000-00000000f743','00000000-0000-4000-8000-00000000e742','00000000-0000-4000-8000-00000000c742','history_b_one','History B One');

insert into public.submission_versions(submission_id,version,snapshot)
values
('00000000-0000-4000-8000-00000000f741',1,'{"canary":"S15_A_PRIVATE_SNAPSHOT_1"}'),
('00000000-0000-4000-8000-00000000f741',2,'{"canary":"S15_A_PRIVATE_SNAPSHOT_2"}'),
('00000000-0000-4000-8000-00000000f743',1,'{"canary":"S15_B_PRIVATE_SNAPSHOT"}');

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
('00000000-0000-4000-8000-00000000a741','confirmation.read','00000000-0000-4000-8000-00000000e741'),
('00000000-0000-4000-8000-00000000a742','confirmation.read','00000000-0000-4000-8000-00000000e742');

set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
do $anon$
declare rejected boolean := false;
begin
  begin
    perform public.admin_confirmation_version_summary_v2(
      '00000000-0000-4000-8000-00000000e741',
      array['00000000-0000-4000-8000-00000000f741']::uuid[]
    );
  exception when insufficient_privilege then rejected := true;
  end;
  if not rejected then raise exception 'Anonymous request was accepted'; end if;
end $anon$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000a741',true);

do $reader$
declare data jsonb; denied_b boolean := false; denied_mixed boolean := false;
        denied_big boolean := false; denied_null boolean := false;
begin
  data := public.admin_confirmation_version_summary_v2(
    '00000000-0000-4000-8000-00000000e741',
    array[
      '00000000-0000-4000-8000-00000000f741',
      '00000000-0000-4000-8000-00000000f742'
    ]::uuid[]
  );
  if data->>'editionId' <> '00000000-0000-4000-8000-00000000e741'
     or jsonb_array_length(data->'rows') <> 1
     or data->'rows'->0->>'submission_id' <> '00000000-0000-4000-8000-00000000f741'
     or (data->'rows'->0->>'version_count')::integer <> 2
     or data::text like '%S15_A_PRIVATE_SNAPSHOT%'
     or data::text like '%S15_B_PRIVATE_SNAPSHOT%'
  then raise exception 'Scoped summary returned invalid or private data: %', data; end if;

  data := public.admin_confirmation_version_summary_v2(
    '00000000-0000-4000-8000-00000000e741', array[]::uuid[]
  );
  if jsonb_array_length(data->'rows') <> 0 then
    raise exception 'Empty request was not empty';
  end if;

  begin
    perform public.admin_confirmation_version_summary_v2(
      '00000000-0000-4000-8000-00000000e742',
      array['00000000-0000-4000-8000-00000000f743']::uuid[]
    );
  exception when insufficient_privilege then denied_b := true;
  end;
  if not denied_b then raise exception 'Cross-edition read was accepted'; end if;

  begin
    perform public.admin_confirmation_version_summary_v2(
      '00000000-0000-4000-8000-00000000e741',
      array['00000000-0000-4000-8000-00000000f743']::uuid[]
    );
  exception when sqlstate '22023' then denied_mixed := true;
  end;
  if not denied_mixed then raise exception 'Mixed-edition IDs were accepted'; end if;

  begin
    perform public.admin_confirmation_version_summary_v2(
      '00000000-0000-4000-8000-00000000e741',
      array_fill('00000000-0000-4000-8000-00000000f741'::uuid, array[201])
    );
  exception when sqlstate '22023' then denied_big := true;
  end;
  if not denied_big then raise exception 'Unbounded ids were accepted'; end if;

  begin
    perform public.admin_confirmation_version_summary_v2(
      '00000000-0000-4000-8000-00000000e741',
      array[null]::uuid[]
    );
  exception when sqlstate '22023' then denied_null := true;
  end;
  if not denied_null then raise exception 'NULL id was accepted'; end if;
end $reader$;

rollback;
SQL
printf '[S15 history scope] Local negative authorization and summary replay passed\n'
