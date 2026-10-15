#!/usr/bin/env bash
set -euo pipefail
# Disposable local fixtures only: never run this rehearsal against hosted data.
eval "$(supabase status -o env)"
case "${API_URL:?}" in http://127.0.0.1:*|http://localhost:*) ;; *) exit 1 ;; esac
case "${DB_URL:?}" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) exit 1 ;; esac
psql "$DB_URL" -v ON_ERROR_STOP=1 <<'SQL'
begin;
insert into televoting.editions(id,name) values ('00000000-0000-4000-8000-00000000f401','V3 receipt rehearsal');
insert into televoting.rounds(id,edition_id,name,status) values ('00000000-0000-4000-8000-00000000f402','00000000-0000-4000-8000-00000000f401','Closed receipt round','closed');
insert into televoting.countries(code,name) values ('HOME','V3 receipt home');
insert into televoting.round_entries(round_id,entry_type,entry_key,custom_name,display_order)
select '00000000-0000-4000-8000-00000000f402'::uuid,'custom',key,'Receipt target ' || key,ord::int
from unnest(array['A','B','C','D','E']) with ordinality as target(key,ord);
insert into televoting.vote_submissions(id,round_id,username,username_normalized,country_code,status)
values ('00000000-0000-4000-8000-00000000f403','00000000-0000-4000-8000-00000000f402','Receipt Voter','receipt voter','HOME','active');
insert into televoting.vote_entries(submission_id,target_country_code,points)
select '00000000-0000-4000-8000-00000000f403'::uuid, key, 4 from unnest(array['A','B','C','D','E']) key;
insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,submission_id,submitted_at,expires_at)
values ('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402','receipt voter','HOME','{"A":4,"B":4,"C":4,"D":4,"E":4}','00000000-0000-4000-8000-00000000f403',now()-interval '1 day',now()-interval '1 hour');
insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map)
values ('00000000-0000-4000-8000-00000000f405','00000000-0000-4000-8000-00000000f402','receipt voter','HOME','{"A":4,"B":4,"C":4,"D":4,"E":4}');

-- Existing exact-ballot capability remains available to the unprivileged client,
-- but only for the exact preflight/round/identity/ballot tuple.
set local role anon;
do $$
declare
 b jsonb := '[{"target_country_code":"A","points":4},{"target_country_code":"B","points":4},{"target_country_code":"C","points":4},{"target_country_code":"D","points":4},{"target_country_code":"E","points":4}]';
 r jsonb;
begin
 r := public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402',' Receipt Voter ','home',b);
 if r->>'found' <> 'true' or r->>'authority' <> 'authoritative_server' or r->>'accepted_at' is null then raise exception 'Closed/expired committed receipt not recovered'; end if;
 if r ?| array['ballot_map','username','ip_hash','fingerprint_hash','device_token_hash','risk_score','moderator_note'] then raise exception 'Receipt leaks private evidence'; end if;
 if public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f405','00000000-0000-4000-8000-00000000f402','Receipt Voter','HOME',b)->>'found' <> 'false' then raise exception 'Foreign token accepted'; end if;
 if public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402','Other Voter','HOME',b)->>'found' <> 'false' then raise exception 'Foreign identity accepted'; end if;
 if public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402','Receipt Voter','OTHER',b)->>'found' <> 'false' then raise exception 'Foreign country accepted'; end if;
 if public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f405','Receipt Voter','HOME',b)->>'found' <> 'false' then raise exception 'Foreign round accepted'; end if;
 if public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402','Receipt Voter','HOME',jsonb_set(jsonb_set(b,'{0,points}','5'),'{1,points}','3'))->>'found' <> 'false' then raise exception 'Changed ballot accepted'; end if;
 if public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402','Receipt Voter','HOME','[]')->>'found' <> 'false' then raise exception 'Malformed ballot accepted'; end if;
end $$;
reset role;

-- The reload/portable recovery capability is deliberately server-only and
-- read-only. Browser database roles must never mint or resolve it directly.
do $$
begin
 if has_function_privilege('anon', 'public.v3_create_televote_recovery_handle(uuid)', 'EXECUTE') then raise exception 'anon can mint Televote recovery handles'; end if;
 if has_function_privilege('authenticated', 'public.v3_create_televote_recovery_handle(uuid)', 'EXECUTE') then raise exception 'authenticated can mint Televote recovery handles'; end if;
 if has_function_privilege('anon', 'public.v3_reconcile_televote_recovery(uuid,text)', 'EXECUTE') then raise exception 'anon can resolve Televote recovery handles'; end if;
 if has_function_privilege('authenticated', 'public.v3_reconcile_televote_recovery(uuid,text)', 'EXECUTE') then raise exception 'authenticated can resolve Televote recovery handles'; end if;
 if not has_function_privilege('service_role', 'public.v3_create_televote_recovery_handle(uuid)', 'EXECUTE') then raise exception 'service_role cannot mint Televote recovery handles'; end if;
 if not has_function_privilege('service_role', 'public.v3_reconcile_televote_recovery(uuid,text)', 'EXECUTE') then raise exception 'service_role cannot resolve Televote recovery handles'; end if;
 if (select provolatile from pg_proc where oid='public.v3_reconcile_televote_recovery(uuid,text)'::regprocedure) <> 's' then raise exception 'Portable receipt recovery is not read-only'; end if;
end $$;

create temp table v3_televote_recovery_fixture (
  operation_id uuid not null,
  recovery_secret text not null
) on commit drop;
grant select, insert on pg_temp.v3_televote_recovery_fixture to service_role;

set local role service_role;
do $$
declare
 v_operation_id uuid;
 v_secret text;
 v_pending_operation_id uuid;
 v_pending_secret text;
 r jsonb;
begin
 select h.operation_id, h.recovery_secret
   into v_operation_id, v_secret
 from public.v3_create_televote_recovery_handle('00000000-0000-4000-8000-00000000f404') h;
 if v_operation_id is null or v_secret is null or v_secret !~ '^[0-9a-f]{64}$' then raise exception 'Committed recovery handle was not minted correctly'; end if;

 select to_jsonb(x) into r from public.v3_reconcile_televote_recovery(v_operation_id, v_secret) x;
 if r->>'found' <> 'true' or r->>'authority' <> 'authoritative_server' or r->>'accepted_at' is null then raise exception 'Committed receipt was not recovered with read-only capability'; end if;
 if r ?| array['preflight_id','ballot_map','username','country_code','ip_hash','fingerprint_hash','device_token_hash','risk_score','moderator_note','recovery_secret'] then raise exception 'Portable recovery leaks submission authority, ballot, identity, integrity evidence or secret'; end if;

 select to_jsonb(x) into r from public.v3_reconcile_televote_recovery(v_operation_id, repeat('0', 64)) x;
 if r->>'found' <> 'false' then raise exception 'Wrong recovery secret was accepted'; end if;
 select to_jsonb(x) into r from public.v3_reconcile_televote_recovery('ffffffff-ffff-4fff-8fff-ffffffffffff', v_secret) x;
 if r->>'found' <> 'false' then raise exception 'Foreign recovery operation was accepted'; end if;

 select h.operation_id, h.recovery_secret
   into v_pending_operation_id, v_pending_secret
 from public.v3_create_televote_recovery_handle('00000000-0000-4000-8000-00000000f405') h;
 select to_jsonb(x) into r from public.v3_reconcile_televote_recovery(v_pending_operation_id, v_pending_secret) x;
 if r->>'found' <> 'false' then raise exception 'Pending preflight fabricated an accepted receipt'; end if;

 insert into pg_temp.v3_televote_recovery_fixture(operation_id,recovery_secret) values (v_operation_id,v_secret);
end $$;
reset role;

-- Plaintext recovery secrets must never be stored at rest.
do $$
begin
 if exists (
   select 1
   from private.v3_televote_recovery_handles h
   join pg_temp.v3_televote_recovery_fixture f on f.operation_id=h.operation_id
   where h.recovery_secret_hash = f.recovery_secret
      or length(h.recovery_secret_hash) <> 64
      or h.recovery_secret_hash !~ '^[0-9a-f]{64}$'
 ) then raise exception 'Recovery secret was stored without the required hash'; end if;
end $$;

update televoting.vote_entries set points=5 where submission_id='00000000-0000-4000-8000-00000000f403' and target_country_code='A';
do $$ begin
 if public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402','Receipt Voter','HOME','[{"target_country_code":"A","points":4},{"target_country_code":"B","points":4},{"target_country_code":"C","points":4},{"target_country_code":"D","points":4},{"target_country_code":"E","points":4}]')->>'found' <> 'false' then raise exception 'Edited committed ballot accepted'; end if;
end $$;
update televoting.vote_entries set points=4 where submission_id='00000000-0000-4000-8000-00000000f403' and target_country_code='A';
update televoting.vote_submissions set status='deleted' where id='00000000-0000-4000-8000-00000000f403';
do $$ begin
 if public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402','Receipt Voter','HOME','[{"target_country_code":"A","points":4},{"target_country_code":"B","points":4},{"target_country_code":"C","points":4},{"target_country_code":"D","points":4},{"target_country_code":"E","points":4}]')->>'found' <> 'false' then raise exception 'Deleted ballot accepted'; end if;
end $$;

set local role service_role;
do $$
declare
 r jsonb;
 f record;
begin
 select * into f from pg_temp.v3_televote_recovery_fixture limit 1;
 select to_jsonb(x) into r from public.v3_reconcile_televote_recovery(f.operation_id, f.recovery_secret) x;
 if r->>'found' <> 'false' then raise exception 'Portable recovery accepted a deleted ballot'; end if;
end $$;
reset role;

-- Metadata contracts used by the read-before-write gates.
do $$ begin
 if (select provolatile from pg_proc where oid='public.v3_reconcile_televote(uuid,uuid,text,text,jsonb)'::regprocedure) <> 's' then raise exception 'Receipt is not read-only'; end if;
 if (select provolatile from pg_proc where oid='public.v3_reconcile_televote_recovery(uuid,text)'::regprocedure) <> 's' then raise exception 'Portable receipt recovery is not read-only'; end if;
end $$;
rollback;

begin transaction read only;
set local role anon;
select public.v3_reconcile_televote(null,null,null,null,null);
rollback;

begin transaction read only;
set local role service_role;
select * from public.v3_reconcile_televote_recovery(null,null);
rollback;
SQL
