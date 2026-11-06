-- WORLD-05 TG8 second half. Requires rehearsal fixture from the FIRST
-- -f file in the same local psql session. Ends with ROLLBACK.
set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $anonymous$
declare v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
begin
  begin
    perform public.world_open_vote_v1((v->>'measureId')::uuid,1,
      (v->>'ruleId')::uuid,now()+interval '2 hours',
      gen_random_uuid(),'tg8-anon-open');
    raise exception 'TG8_ANONYMOUS_OPEN_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.world_vote_electorate;
    raise exception 'TG8_ANONYMOUS_ELECTORATE_READ_ALLOWED';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from private.world_legislative_ballots;
    raise exception 'TG8_ANONYMOUS_BALLOT_READ_ALLOWED';
  exception when insufficient_privilege then null; end;
  if public.world_vote_public_detail_v1((v->>'closedVoteId')::uuid) is not null then
    raise exception 'TG8_UNCERTIFIED_RESULT_LEAKED';
  end if;
end $anonymous$;
reset role;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $outsider$
declare v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'outsider',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'outsider','role','authenticated')::text,true);
  if public.world_vote_my_ballot_v1((v->>'closedVoteId')::uuid) is not null
      or public.world_vote_manage_v1((v->>'closedVoteId')::uuid) is not null then
    raise exception 'TG8_OUTSIDER_PRIVATE_VOTE_VISIBLE';
  end if;
  begin
    perform public.world_cast_ballot_v1((v->>'closedVoteId')::uuid,
      (v->>'countryA')::uuid,1,'aye',gen_random_uuid(),'tg8-outsider');
    raise exception 'TG8_OUTSIDER_BALLOT_ACCEPTED';
  exception when insufficient_privilege then null; end;
end $outsider$;

do $open$
declare
  v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
  v_receipt jsonb;v_replay jsonb;
  v_vote uuid;
  v_closes timestamptz:=now()+interval '2 hours';
begin
  perform set_config('request.jwt.claim.sub',v->>'chair',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'chair','role','authenticated')::text,true);
  v_receipt:=public.world_open_vote_v1((v->>'measureId')::uuid,2,
    (v->>'ruleId')::uuid,v_closes,
    (v->>'openOperationId')::uuid,'tg8-rehearsal-open:'||(v->>'openOperationId'));
  if v_receipt->>'status'<>'succeeded'
      or v_receipt #>> '{result,status}'<>'open'
      or v_receipt #>> '{result,electorateCount}'<>'2' then
    raise exception 'TG8_OPEN_RECEIPT_INVALID: %',v_receipt; end if;
  v_vote:=(v_receipt #>> '{result,voteId}')::uuid;
  perform set_config('solaris.tg8_open_vote_id',v_vote::text,true);
  if v_vote is null or
      (select count(*) from public.world_vote_electorate where vote_id=v_vote)<>2 then
    raise exception 'TG8_FROZEN_ELECTORATE_NOT_TWO'; end if;
  v_replay:=public.world_open_vote_v1((v->>'measureId')::uuid,2,
    (v->>'ruleId')::uuid,v_closes,
    (v->>'openOperationId')::uuid,'tg8-rehearsal-open:'||(v->>'openOperationId'));
  if v_replay->>'replayed'<>'true' or
     v_replay #>> '{result,voteId}'<>v_vote::text then
    raise exception 'TG8_OPEN_REPLAY_FAILED'; end if;
  if public.world_vote_public_detail_v1(v_vote) is not null then
    raise exception 'TG8_ACTIVE_VOTE_EXPOSED_PUBLICLY'; end if;
end $open$;

do $cast$
declare
  v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
  v_vote uuid:=current_setting('solaris.tg8_open_vote_id')::uuid;
  v_operation uuid:=gen_random_uuid();
  v_receipt jsonb;v_replay jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'repA',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'repA','role','authenticated')::text,true);
  v_receipt:=public.world_cast_ballot_v1(v_vote,(v->>'countryA')::uuid,
    1,'aye',v_operation,'tg8-rehearsal-ballot:'||v_operation);
  if v_receipt->>'status'<>'succeeded'
     or v_receipt #>> '{result,status}'<>'cast' then
    raise exception 'TG8_CAST_RECEIPT_INVALID'; end if;
  v_replay:=public.world_cast_ballot_v1(v_vote,(v->>'countryA')::uuid,
    1,'aye',v_operation,'tg8-rehearsal-ballot:'||v_operation);
  if v_replay->>'replayed'<>'true' then
    raise exception 'TG8_CAST_REPLAY_FAILED'; end if;
  begin
    perform public.world_cast_ballot_v1(v_vote,(v->>'countryA')::uuid,
      1,'nay',gen_random_uuid(),'tg8-new-duplicate');
    raise exception 'TG8_SECOND_BALLOT_ACCEPTED';
  exception when unique_violation then null; end;
end $cast$;

do $certify$
declare
  v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
  v_receipt jsonb;v_replay jsonb;
begin
  perform set_config('request.jwt.claim.sub',v->>'chair',true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub',v->>'chair','role','authenticated')::text,true);
  begin
    perform public.world_certify_vote_v1(
      current_setting('solaris.tg8_open_vote_id')::uuid,1,
      gen_random_uuid(),'tg8-too-early');
    raise exception 'TG8_PREMATURE_CERTIFICATION';
  exception when serialization_failure then null; end;
  v_receipt:=public.world_certify_vote_v1((v->>'closedVoteId')::uuid,1,
    (v->>'certifyOperationId')::uuid,
    'tg8-rehearsal-certify:'||(v->>'certifyOperationId'));
  if v_receipt->>'status'<>'succeeded'
    or v_receipt #>> '{result,status}'<>'certified'
    or v_receipt #>> '{result,outcome}'<>'passed'
    or length(v_receipt #>> '{result,resultHash}')<>64 then
    raise exception 'TG8_CERTIFICATION_RECEIPT_INVALID: %',v_receipt; end if;
  v_replay:=public.world_certify_vote_v1((v->>'closedVoteId')::uuid,1,
    (v->>'certifyOperationId')::uuid,
    'tg8-rehearsal-certify:'||(v->>'certifyOperationId'));
  if v_replay->>'replayed'<>'true' then
    raise exception 'TG8_CERTIFICATION_REPLAY_FAILED'; end if;
end $certify$;
reset role;

set local role anon;
set local request.jwt.claim.role='anon';
set local request.jwt.claim.sub='';
do $published$
declare v jsonb:=current_setting('solaris.tg8_fixture')::jsonb;
  v_result jsonb;v_list jsonb;
begin
  v_result:=public.world_vote_public_detail_v1((v->>'closedVoteId')::uuid);
  if v_result->>'outcome'<>'passed' or v_result->>'ayeCount'<>'2'
     or v_result->>'eligibleElectorate'<>'2'
     or jsonb_array_length(v_result->'rollCall')<>2 then
    raise exception 'TG8_PUBLISHED_RESULT_MISMATCH'; end if;
  v_list:=public.world_vote_public_list_v1(v->>'orgSlug',30);
  if jsonb_array_length(v_list)<>1 then
    raise exception 'TG8_PUBLISHED_DIRECTORY_MISMATCH'; end if;
  begin
    perform 1 from public.world_vote_results;
    raise exception 'TG8_ANONYMOUS_DIRECT_RESULT_READ_ALLOWED';
  exception when insufficient_privilege then null; end;
end $published$;
reset role;

set local role service_role;
do $service_role$
begin
  begin
    update public.world_votes set status='certified' where false;
    raise exception 'TG8_SERVICE_ROLE_DIRECT_WRITER';
  exception when insufficient_privilege then null; end;
  begin
    insert into private.world_legislative_ballots
      (vote_id,country_id,choice,cast_by_user_id,operation_id)
    values(gen_random_uuid(),gen_random_uuid(),'aye',gen_random_uuid(),gen_random_uuid());
    raise exception 'TG8_SERVICE_ROLE_BALLOT_FORGERY';
  exception when insufficient_privilege then null; end;
end $service_role$;
reset role;
rollback;

do $clean$
begin
  if exists(select 1 from auth.users where email like '%@tg8-legislative.invalid')
    or exists(select 1 from public.world_organizations
              where slug like 'tg8-legislative-%') then
    raise exception 'TG8_TEST_DATA_PERSISTED'; end if;
  raise notice 'PASS: TG8 frozen electorate, ballots, certified publication and rollback';
end $clean$;
