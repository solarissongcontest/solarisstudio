-- TG9 companion to WORLD-05 TG8 disposable fixture.
-- The first -f script already started a transaction. NEVER COMMIT.
\set ON_ERROR_STOP on

-- Explicitly equip the fixture chair with the existing TG2 capability.
-- No application role or browser-side office title grants publish authority.
insert into public.world_office_capabilities(office_id,capability)
select term.office_id,'world.resolution.publish'
from public.world_office_terms term
where term.holder_user_id=(current_setting('solaris.tg8_fixture')::jsonb->>'chair')::uuid
  and term.status='active'
on conflict do nothing;

set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $pre_cert$
declare v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
begin
 if public.world_public_resolution_v1(gen_random_uuid()) is not null then
   raise exception 'TG9_UNCERTIFIED_OR_MISSING_RESOLUTION_EXPOSED';
 end if;
 begin
   perform 1 from public.world_resolutions;
   raise exception 'TG9_ANONYMOUS_RAW_RESOLUTION_READ';
 exception when insufficient_privilege then null;
 end;
 begin
   perform public.world_materialize_certified_resolution_v1(
     (v->>'closedVoteId')::uuid,2,gen_random_uuid(),'tg9-anon-materialize-1');
   raise exception 'TG9_ANONYMOUS_MATERIALIZATION_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $pre_cert$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $outsider$
declare v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
begin
 perform set_config('request.jwt.claim.sub',v->>'outsider',true);
 perform set_config('request.jwt.claims',
   jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
 begin
   perform public.world_resolution_candidate_v1((v->>'closedVoteId')::uuid);
   raise exception 'TG9_OUTSIDER_CANDIDATE_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $outsider$;

do $certify_and_materialize$
declare
 v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
 v_vote uuid:=(v->>'closedVoteId')::uuid;
 v_cert jsonb;
 v_candidate jsonb;
 v_published jsonb;
 v_replay jsonb;
 v_operation uuid:=gen_random_uuid();
 v_resolution uuid;
 v_measure_revision bigint;
 v_result_hash text;
begin
 perform set_config('request.jwt.claim.sub',v->>'chair',true);
 perform set_config('request.jwt.claims',
   jsonb_build_object('sub',v->>'chair','role','authenticated')::text,true);
 -- Real TG8 certifier and exact tally must run; TG9 must not fake result rows.
 v_cert:=public.world_certify_vote_v1(
   v_vote,1,(v->>'certifyOperationId')::uuid,
   'tg9-real-certify:'||(v->>'certifyOperationId'));
 if v_cert->>'status'<>'succeeded'
    or v_cert #>> '{result,outcome}'<>'passed'
    or v_cert #>> '{result,status}'<>'certified' then
   raise exception 'TG9_UPSTREAM_CERTIFICATION_FAILED: %',v_cert;
 end if;
 select revision into strict v_measure_revision
   from public.world_measures where id=(select measure_id from public.world_votes where id=v_vote);
 v_result_hash:=v_cert #>> '{result,resultHash}';
 v_candidate:=public.world_resolution_candidate_v1(v_vote);
 if v_candidate->>'title'<>'Closed test measure'
    or v_candidate->>'text'<>'Closed proposal text'
    or v_candidate->>'resultHash'<>v_result_hash
    or (v_candidate->>'expectedMeasureRevision')::bigint<>v_measure_revision
 then raise exception 'TG9_FROZEN_SOURCE_PREVIEW_MISMATCH: %',v_candidate; end if;

 -- New operation, exactly the observed adopted measure revision.
 v_published:=public.world_materialize_certified_resolution_v1(
   v_vote,v_measure_revision,v_operation,
   'tg9-materialize:'||v_operation);
 if v_published->>'status'<>'succeeded'
    or v_published->>'command'<>'world.resolution.publish'
    or v_published #>> '{result,status}'<>'adopted'
    or v_published #>> '{result,operationId}'<>v_operation::text
 then raise exception 'TG9_CANONICAL_RECEIPT_FAILED: %',v_published; end if;
 v_resolution:=(v_published #>> '{result,resolutionId}')::uuid;
 if v_resolution is null then raise exception 'TG9_RESOLUTION_ID_MISSING'; end if;
 perform set_config('solaris.tg9_resolution_id',v_resolution::text,true);
 perform set_config('solaris.tg9_operation_id',v_operation::text,true);

 -- Same-operation retries may not fork a second resolution/receipt/event.
 v_replay:=public.world_materialize_certified_resolution_v1(
   v_vote,v_measure_revision,v_operation,
   'tg9-materialize:'||v_operation);
 if v_replay->>'replayed'<>'true'
    or v_replay #>> '{result,resolutionId}'<>v_resolution::text
 then raise exception 'TG9_REPLAY_DIVERGED: %',v_replay; end if;
 if (select count(*) from public.world_resolutions where source_measure_id =
    (select measure_id from public.world_votes where id=v_vote))<>1 then
   raise exception 'TG9_DUPLICATE_RESOLUTION'; end if;
 if (select count(*) from public.studio2_operation_receipts
     where operation_id=v_operation and command='world.resolution.publish')<>1 then
   raise exception 'TG9_RESOLUTION_OPERATION_DUPLICATED'; end if;
 if (select count(*) from private.v3_domain_events
     where aggregate_type='world_resolution' and aggregate_id=v_resolution::text
       and event_type='world.resolution.adopted')<>1 then
   raise exception 'TG9_ADOPTION_EVENT_MISSING_OR_DUPLICATED'; end if;
end $certify_and_materialize$;
reset role;

do $frozen$
declare
 v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
 v_id uuid:=current_setting('solaris.tg9_resolution_id')::uuid;
 v_version uuid;
 v_result_hash text;
begin
 select adopted_version_id,certification_hash into strict v_version,v_result_hash
 from public.world_resolutions where id=v_id;
 if not exists(select 1 from public.world_vote_results result
   join public.world_resolutions resolution on resolution.vote_id=result.vote_id
   where resolution.id=v_id and result.result_hash=v_result_hash
     and result.outcome='passed' and result.quorum_met and result.threshold_met)
 then raise exception 'TG9_RESULT_PROVENANCE_NOT_CERTIFIED'; end if;
 if not exists(select 1 from public.world_measure_versions
   where id=v_version and title='Closed test measure'
     and full_text='Closed proposal text' and publication_state='published')
 then raise exception 'TG9_SOURCE_TEXT_NOT_FROZEN'; end if;
 begin
   update public.world_resolutions set title='forged revised text' where id=v_id;
   raise exception 'TG9_IMMUTABLE_RESOLUTION_REWRITE_ALLOWED';
 exception when sqlstate '23514' then
   if sqlerrm<>'IMMUTABLE_CERTIFIED_RESOLUTION' then raise; end if;
 end;
end $frozen$;

set local role service_role;
do $no_raw_writer$
begin
 begin
   insert into public.world_resolutions(
     organization_id,organ_id,identifier,source_measure_id,adopted_version_id,
     title,text,adopted_at,vote_id,certification_hash,publication_operation_id)
   values(gen_random_uuid(),gen_random_uuid(),'INVALID/RES',gen_random_uuid(),
     gen_random_uuid(),'Forgery','Forgery',now(),gen_random_uuid(),
     repeat('a',64),gen_random_uuid());
   raise exception 'TG9_SERVICE_ROLE_RAW_INSERT_ALLOWED';
 exception when insufficient_privilege then null;
 end;
end $no_raw_writer$;
reset role;

set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $public$
declare
 v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
 v_id uuid:=current_setting('solaris.tg9_resolution_id')::uuid;
 v_detail jsonb;
 v_list jsonb;
begin
 v_detail:=public.world_public_resolution_v1(v_id);
 v_list:=public.world_public_resolutions_v1(v->>'orgSlug',20);
 if v_detail->>'text'<>'Closed proposal text'
    or v_detail->>'sourceMeasureId' is null
    or v_detail->>'resultHash' is null
    or jsonb_array_length(v_list)<>1
 then raise exception 'TG9_PUBLIC_CERTIFIED_PROJECTION_MISMATCH'; end if;
 if v_detail ? 'ballots' or v_detail ? 'actorId' or v_detail ? 'userId' then
   raise exception 'TG9_PRIVATE_VOTE_DATA_LEAKED'; end if;
end $public$;
reset role;

-- Fail-closed direct RPC rollout, even when someone guesses the UUID.
update public.studio2_feature_flags
set enabled=false where key='terra_world_public';
set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $dark$
declare
 v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
 v_id uuid:=current_setting('solaris.tg9_resolution_id')::uuid;
begin
 if public.world_public_resolution_v1(v_id) is not null
    or jsonb_array_length(public.world_public_resolutions_v1(v->>'orgSlug',20))<>0
 then raise exception 'TG9_DARK_ROLLOUT_LEAK'; end if;
end $dark$;
reset role;
rollback;

do $clean$
begin
 if exists(select 1 from auth.users where email like '%@tg8-legislative.invalid')
    or exists(select 1 from public.world_organizations where slug like 'tg8-legislative-%')
 then raise exception 'TG9_LOCAL_FIXTURE_PERSISTED'; end if;
 raise notice 'PASS: TG9 adoption, exact frozen text, S2 receipt and replay, privacy, immutability, dark rollout and rollback';
end $clean$;
