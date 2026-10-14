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
insert into televoting.vote_submissions(id,round_id,username,username_normalized,country_code,status)
values ('00000000-0000-4000-8000-00000000f403','00000000-0000-4000-8000-00000000f402','Receipt Voter','receipt voter','HOME','active');
insert into televoting.vote_entries(submission_id,target_country_code,points)
select '00000000-0000-4000-8000-00000000f403'::uuid, key, 4 from unnest(array['A','B','C','D','E']) key;
insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,submission_id,submitted_at,expires_at)
values ('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402','receipt voter','HOME','{"A":4,"B":4,"C":4,"D":4,"E":4}','00000000-0000-4000-8000-00000000f403',now()-interval '1 day',now()-interval '1 hour');

insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map)
values ('00000000-0000-4000-8000-00000000f405','00000000-0000-4000-8000-00000000f402','receipt voter','HOME','{"A":4,"B":4,"C":4,"D":4,"E":4}');

-- Execute the real RPC as an unprivileged client. Neither private table is
-- directly readable; the capability grants only exact receipt metadata.
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
update televoting.vote_entries set points=5 where submission_id='00000000-0000-4000-8000-00000000f403' and target_country_code='A';
do $$ begin
 if public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402','Receipt Voter','HOME','[{"target_country_code":"A","points":4},{"target_country_code":"B","points":4},{"target_country_code":"C","points":4},{"target_country_code":"D","points":4},{"target_country_code":"E","points":4}]')->>'found' <> 'false' then raise exception 'Edited committed ballot accepted'; end if;
end $$;
update televoting.vote_entries set points=4 where submission_id='00000000-0000-4000-8000-00000000f403' and target_country_code='A';
update televoting.vote_submissions set status='deleted' where id='00000000-0000-4000-8000-00000000f403';
do $$ begin
 if public.v3_reconcile_televote('00000000-0000-4000-8000-00000000f404','00000000-0000-4000-8000-00000000f402','Receipt Voter','HOME','[{"target_country_code":"A","points":4},{"target_country_code":"B","points":4},{"target_country_code":"C","points":4},{"target_country_code":"D","points":4},{"target_country_code":"E","points":4}]')->>'found' <> 'false' then raise exception 'Deleted ballot accepted'; end if;
end $$;
-- Metadata contract used by the canonical read-only pre-request gate.
do $$ begin
 if (select provolatile from pg_proc where oid='public.v3_reconcile_televote(uuid,uuid,text,text,jsonb)'::regprocedure) <> 's' then raise exception 'Receipt is not read-only'; end if;
end $$;
rollback;
begin transaction read only;
set local role anon;
select public.v3_reconcile_televote(null,null,null,null,null);
rollback;
SQL
