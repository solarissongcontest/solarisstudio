\set ON_ERROR_STOP on
begin;
do $deny$ declare actor_role text;denied boolean;begin
 if session_user<>'authenticator' then raise exception 'Actual API session required';end if;
 foreach actor_role in array array['anon','authenticated','service_role'] loop
  execute format('set local role %I',actor_role);denied:=false;
  begin perform public.submit_country_jury_ballot(null,'[]',null);exception when insufficient_privilege then denied:=true;end;
  reset role;if not denied then raise exception 'Legacy RPC bypass remains: %',actor_role;end if;
 end loop;
end $deny$;
set local role authenticated;
set local request.jwt.claim.sub='52000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role='authenticated';
set local request.jwt.claims='{"sub":"52000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.v3_submit_jury_ballot('51000000-0000-4000-8000-000000000002','[{"target_country_id":"51000000-0000-4000-8000-000000000012","points":12}]','52000000-0000-4000-8000-000000000010','52000000-0000-4000-8000-000000000020','not-authority') as receipt \gset
commit;
-- Response-loss replay in a fresh transaction returns the original receipt.
begin;
set local role authenticated;
set local request.jwt.claim.sub='52000000-0000-4000-8000-000000000001';
set local request.jwt.claim.role='authenticated';
set local request.jwt.claims='{"sub":"52000000-0000-4000-8000-000000000001","role":"authenticated"}';
select public.v3_submit_jury_ballot('51000000-0000-4000-8000-000000000002','[{"target_country_id":"51000000-0000-4000-8000-000000000012","points":12}]','52000000-0000-4000-8000-000000000010','52000000-0000-4000-8000-000000000020','different-client-hash-is-ignored') as replay \gset
select set_config('security.receipt',:'receipt',true),set_config('security.replay',:'replay',true);
do $check$ declare before_value jsonb:=current_setting('security.receipt')::jsonb;after_value jsonb:=current_setting('security.replay')::jsonb;denied boolean:=false;begin
 if before_value#>>'{receipt,receipt_id}' is distinct from after_value#>>'{receipt,receipt_id}' or after_value#>>'{receipt,replayed}'<>'true' then raise exception 'Jury replay did not retain original receipt';end if;
 begin perform public.v3_submit_jury_ballot('51000000-0000-4000-8000-000000000003','[]','52000000-0000-4000-8000-000000000010','52000000-0000-4000-8000-000000000020',null);exception when invalid_parameter_value then denied:=true;end;
 if not denied then raise exception 'Changed show reused Jury operation';end if;
end $check$;
rollback;
begin;
set local role anon;
do $secret$ begin if exists(select 1 from public.jury_votes where show_id='51000000-0000-4000-8000-000000000002') then raise exception 'Unpublished Jury votes exposed';end if;end $secret$;
rollback;

-- A second signed-in country cannot replay or read another actor's operation.
begin;
set local role authenticated;
set local request.jwt.claim.sub='52000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role='authenticated';
set local request.jwt.claims='{"sub":"52000000-0000-4000-8000-000000000002","role":"authenticated"}';
do $other_actor$ declare denied boolean:=false;begin
 begin perform public.v3_submit_jury_ballot('51000000-0000-4000-8000-000000000002','[{"target_country_id":"51000000-0000-4000-8000-000000000012","points":12}]','52000000-0000-4000-8000-000000000010','52000000-0000-4000-8000-000000000021',null);
 exception when raise_exception then
  if sqlerrm not in ('Run the automatic Voting Integrity System before submitting','Your country is not eligible to jury vote in this show') then raise;end if;denied:=true;
 end;
 if not denied then raise exception 'Another country used original actor preflight';end if;
 if public.v3_reconcile_jury_submission('52000000-0000-4000-8000-000000000020')->>'found' is distinct from 'false' then raise exception 'Another actor read private Jury operation';end if;
end $other_actor$;
rollback;
