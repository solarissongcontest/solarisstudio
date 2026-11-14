\set ON_ERROR_STOP on
-- Real SQL against the recovered observed fixture. Synthetic, rollback-only.
begin;
do $verify$ declare s uuid; c uuid; history jsonb; status jsonb; before_frozen jsonb; actor_role text; denied boolean; before_receipts bigint; begin
 foreach s in array array['51000000-0000-4000-8000-000000000002'::uuid,'51000000-0000-4000-8000-000000000003'::uuid] loop
  select jsonb_agg(to_jsonb(r) order by r.id) into history from public.results r where show_id=s and country_id in ('51000000-0000-4000-8000-000000000013','51000000-0000-4000-8000-000000000014');
  select result_rows into before_frozen from private.v3_result_versions where show_id=s and version=1;
  -- Correct active inputs, while old pending/withdrawn/disqualified Results remain.
  update public.shows set qualifier_count=1,voting_config='{"juryEnabled":false,"televoteEnabled":true,"juryWeight":0,"televoteWeight":100,"qualifiers":1,"tieBreak":["televote"]}'::jsonb where id=s;
  insert into public.televote_votes(edition_id,show_id,country_id,points) values
   ('51000000-0000-4000-8000-000000000001',s,'51000000-0000-4000-8000-000000000011',60),
   ('51000000-0000-4000-8000-000000000001',s,'51000000-0000-4000-8000-000000000012',20);
  update public.participants set qualified=true where show_id=s and participation_status in ('withdrawn','disqualified');
  perform public.sync_show_results_from_votes(s);
  status:=private.studio2_result_reconciliation(s);
  if (status->>'invalidNonactiveResultRowCount')::integer<>1 or (status->>'reconciliationConsistent')::boolean then raise exception 'Pending Results were incorrectly certified: %',status; end if;
  -- Remove only intentionally invalid synthetic fixture data; the real writer
  -- must preserve legitimate withdrawn/disqualified history and reject pending.
  delete from public.results where show_id=s and country_id='51000000-0000-4000-8000-000000000015';
  perform public.sync_show_results_from_votes(s);
  status:=private.studio2_result_reconciliation(s);
  if (status->>'reconciliationConsistent')::boolean is distinct from true then raise exception 'Canonical active result reconciliation failed: %',status; end if;
  if not exists(select 1 from public.results where show_id=s and country_id='51000000-0000-4000-8000-000000000011' and total_points=60 and final_rank=1)
   or not exists(select 1 from public.results where show_id=s and country_id='51000000-0000-4000-8000-000000000012' and total_points=20 and final_rank=2) then raise exception 'Canonical ranking failed'; end if;
  if history is distinct from (select jsonb_agg(to_jsonb(r) order by r.id) from public.results r where show_id=s and country_id in ('51000000-0000-4000-8000-000000000013','51000000-0000-4000-8000-000000000014')) then raise exception 'Historical inactive Results changed'; end if;
  if before_frozen is distinct from (select result_rows from private.v3_result_versions where show_id=s and version=1) then raise exception 'Prior immutable snapshot changed'; end if;
  -- Stale rankings must fail the read-only verifier; canonical recalculation repairs them.
  update public.results set final_rank=99 where show_id=s and country_id='51000000-0000-4000-8000-000000000011';
  if (private.studio2_result_reconciliation(s)->>'reconciliationConsistent')::boolean then raise exception 'Stale rank accepted'; end if;
  perform public.sync_show_results_from_votes(s);
 end loop;
 if exists(select 1 from public.participants where edition_id='51000000-0000-4000-8000-000000000001' and participation_status in ('withdrawn','disqualified') and qualified) then raise exception 'Inactive qualifiers survived'; end if;
 if not exists(select 1 from public.participants where show_id='51000000-0000-4000-8000-000000000002' and country_id='51000000-0000-4000-8000-000000000011' and qualified)
 or exists(select 1 from public.participants where show_id='51000000-0000-4000-8000-000000000002' and country_id='51000000-0000-4000-8000-000000000012' and qualified) then raise exception 'Canonical semifinal cutoff not derived from Results'; end if;
 -- Actual grants: normal API actors cannot invoke internal scoring or forge sync evidence.
 if has_function_privilege('authenticated','public.sync_show_results_from_votes(uuid)','EXECUTE') or has_function_privilege('anon','private.studio2_result_reconciliation(uuid)','EXECUTE') then raise exception 'New Results mutation/reconciliation ACL leak'; end if;
 foreach actor_role in array array['anon','authenticated'] loop
  execute format('set local role %I',actor_role);
  denied:=false;
  begin perform public.sync_show_results_from_votes(null); exception when insufficient_privilege then denied:=true; end;
  reset role;
  if not denied then raise exception 'Unauthorized API scoring execution accepted: %',actor_role; end if;
 end loop;
 select count(*) into before_receipts from public.integration_events;
 perform set_config('request.jwt.claim.role','service_role',true);
 perform set_config('request.jwt.claims','{"role":"service_role"}',true);
 execute 'set local role service_role';
 perform public.sync_show_results_from_votes(s); -- canonical owner writer still works after direct DML revocation
 denied:=false;
 begin
  perform public.v3_record_televote_sync_event('round','forged',s,
   jsonb_build_object('outcome',jsonb_build_object('ok',true,'status','synced','sourceType','round','sourceId','forged','showId',s)),repeat('a',64),'completed',null);
 exception when raise_exception then
  if sqlerrm<>'Published round and frozen show binding not verified' then raise; end if;
  denied:=true;
 end;
 reset role;
 if not denied or before_receipts<>(select count(*) from public.integration_events) then raise exception 'Invalid privileged sync receipt mutated evidence'; end if;
end $verify$;
rollback;
select 'PASS: recovered canonical ranking, active qualification, reconciliation and historical snapshot preservation';
