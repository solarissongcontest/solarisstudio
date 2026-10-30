begin;
select public.v3_register_migration_contract('v3.jury.command-recovery-boundary',1,'forward_fix_only',false,null,'Extend the existing manual Jury score and ballot review commands with active scoped authorization, recovery before mutable-state checks, canonical CAS, complete fingerprints and protected-input lifecycle guards. Preserve synchronous derived consequences and atomic audit/receipt failure rollback.');
-- A unique-key loser can observe a receipt committed while INSERT waited.
-- The S2 primitive must distinguish its own INSERT from that existing claim;
-- operation-id equality alone is not evidence that this call created it.
do $claim_creator$
declare definition text;
begin
 definition:=pg_get_functiondef('private.studio2_claim_operation(uuid,text,uuid,text,text,jsonb,jsonb)'::regprocedure);
 if position('v_created boolean' in definition)>0 then return; end if;
 if position('  v_receipt public.studio2_operation_receipts;' in definition)=0 or position('  on conflict do nothing;' in definition)=0 or position('  if v_receipt.operation_id is distinct from p_operation_id then' in definition)=0 then raise exception 'S2 claim implementation drift'; end if;
 definition:=replace(definition,'  v_receipt public.studio2_operation_receipts;',E'  v_receipt public.studio2_operation_receipts;\n  v_created boolean := false;');
 definition:=replace(definition,'  on conflict do nothing;','  on conflict do nothing returning true into v_created;');
 definition:=replace(definition,'  if v_receipt.operation_id is distinct from p_operation_id then','  if not coalesce(v_created,false) or v_receipt.operation_id is distinct from p_operation_id then');
 execute definition;
end $claim_creator$;
-- This is a guard on Jury inputs, not an official Results writer. The frozen
-- Results command family remains responsible for official calculation/cutover.
create or replace function private.v3_assert_mutable_jury_input(p_edition_id uuid,p_show_id uuid) returns void
language plpgsql stable security definer set search_path=pg_catalog,public,private,pg_temp as $guard$
begin
 if not exists(select 1 from public.shows where id=p_show_id and edition_id=p_edition_id) then raise exception 'Jury show not found in this edition' using errcode='42501'; end if;
 if exists(select 1 from public.studio2_edition_runtime where edition_id=p_edition_id and state='archived') then raise exception 'Archived edition is read-only' using errcode='55000'; end if;
 if exists(select 1 from public.studio2_result_operations where show_id=p_show_id and (locked_version is not null or reveal_ready_version is not null))
 or exists(select 1 from public.studio2_show_publication_controls where show_id=p_show_id and state in ('scheduled','public') and private.studio2_publication_has_outcomes(frozen_config))
 or exists(select 1 from public.shows where id=p_show_id and published and private.studio2_publication_has_outcomes(publication_config)) then
  raise exception 'Finalized, scheduled or published result inputs are immutable' using errcode='55000';
 end if;
end $guard$;
revoke all on function private.v3_assert_mutable_jury_input(uuid,uuid) from public,anon,authenticated,service_role;
create or replace function public.studio2_jury_vote_change_preview(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid,
  p_points integer,
  p_action text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, pg_temp
as $preview$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_show_edition_id uuid;
  v_version bigint := 0;
  v_existing public.jury_votes%rowtype;
  config jsonb; voter_country uuid; recipient_country uuid;
begin
  perform private.v3_require_active_auth_session();
  if v_action not in ('assign', 'clear') then
    raise exception 'Unknown jury score action' using errcode = '22023';
  end if;
  if p_edition_id is null or p_show_id is null or p_points is null then
    raise exception 'Edition, show and jury point value are required'
      using errcode = '22023';
  end if;

  select show_row.edition_id
  into v_show_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show_edition_id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;
  if v_show_edition_id is distinct from p_edition_id then
    raise exception 'Jury score show belongs to another edition'
      using errcode = '42501';
  end if;
  if not private.studio2_user_has_capability(auth.uid(),'jury.ballots.manage',p_edition_id) then
    raise exception 'Missing Solaris capability: jury.ballots.manage'
      using errcode = '42501';
  end if;

  perform private.v3_assert_jury_vote_object_scope(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    case when v_action = 'assign' then p_receiving_country_id else null end,
    case when v_action = 'assign' then p_receiving_entity_id else null end,
    null
  );

  if v_action = 'assign'
     and coalesce(p_receiving_entity_id, p_receiving_country_id) is null then
    raise exception 'A jury score recipient is required' using errcode = '22023';
  end if;

  perform private.v3_assert_mutable_jury_input(p_edition_id,p_show_id);
  if coalesce(p_voter_id,p_voter_entity_id,p_voter_country_id) is null then
    raise exception 'A canonical jury voter is required' using errcode='22023';
  end if;
  if p_voter_id is null and not exists(select 1 from public.participants p where p.edition_id=p_edition_id and p.show_id=p_show_id and coalesce(p.participation_status,'confirmed')='confirmed' and ((p_voter_entity_id is not null and p.contest_entity_id=p_voter_entity_id) or (p_voter_country_id is not null and p.country_id=p_voter_country_id and (p_voter_entity_id is null or p.contest_entity_id is null)))) and not exists(select 1 from public.voters v where v.edition_id=p_edition_id and (v.show_id is null or v.show_id=p_show_id) and ((p_voter_entity_id is not null and v.contest_entity_id=p_voter_entity_id) or (p_voter_country_id is not null and v.country_id=p_voter_country_id and (p_voter_entity_id is null or v.contest_entity_id is null)))) then
    raise exception 'Jury voter does not belong to this show' using errcode='42501';
  end if;
  -- Submitted ballot rows are immutable evidence. Fast manual entry cannot
  -- unlink/delete them or create a second counting ballot around review state.
  if exists(select 1 from public.jury_ballot_submissions b where b.edition_id=p_edition_id and b.show_id=p_show_id and
    ((p_voter_id is not null and b.voter_id=p_voter_id) or (p_voter_entity_id is not null and b.voter_entity_id=p_voter_entity_id) or (p_voter_country_id is not null and b.voter_country_id=p_voter_country_id))) then
    raise exception 'Review the submitted jury ballot instead of rewriting participant evidence' using errcode='55000';
  end if;
  if v_action='assign' then
    select coalesce(voting_config,'{}') into config from public.shows where id=p_show_id;
    if coalesce(config->>'juryEnabled','true')<>'true' then raise exception 'Jury voting is disabled' using errcode='23514'; end if;
    if exists(select 1 from private.studio2_find_jury_dnv(p_show_id,p_voter_id,p_voter_country_id,p_voter_entity_id) d where d.id is not null) then
      raise exception 'Restore this did-not-vote jury before assigning points' using errcode='55000';
    end if;
    if jsonb_typeof(config->'juryPoints')='array' and config->'juryPoints'<>'[]'::jsonb then
      if not (config->'juryPoints' @> jsonb_build_array(p_points)) then raise exception 'Point value is not configured for this jury' using errcode='22023'; end if;
    elsif not p_points=any(array[12,10,8,7,6,5,4,3,2,1]) then
      raise exception 'Point value is not configured for this jury' using errcode='22023';
    end if;
    if not exists(select 1 from public.participants p where p.edition_id=p_edition_id and p.show_id=p_show_id and coalesce(p.participation_status,'confirmed')='confirmed'
      and ((p_receiving_entity_id is not null and p.contest_entity_id=p_receiving_entity_id)
        or (p_receiving_country_id is not null and p.country_id=p_receiving_country_id and (p_receiving_entity_id is null or p.contest_entity_id is null)))) then
      raise exception 'Jury recipient is not a confirmed participant in this show' using errcode='23514';
    end if;
    select coalesce(p_voter_country_id,(select country_id from public.contest_entities where id=p_voter_entity_id),(select country_id from public.voters where id=p_voter_id)) into voter_country;
    select coalesce(p_receiving_country_id,(select country_id from public.contest_entities where id=p_receiving_entity_id)) into recipient_country;
    if coalesce(config->>'allowSelfVote','false')<>'true' and
      ((voter_country is not null and voter_country=recipient_country) or (p_voter_entity_id is not null and p_voter_entity_id=p_receiving_entity_id)) then
      raise exception 'A jury cannot vote for its own entry' using errcode='23514';
    end if;
  end if;

  select coalesce((
    select version_row.version
    from public.studio2_jury_vote_versions version_row
    where version_row.show_id = p_show_id
      and version_row.edition_id = p_edition_id
  ), 0)
  into v_version;

  select vote.*
  into v_existing
  from public.jury_votes vote
  where vote.edition_id = p_edition_id
    and vote.show_id = p_show_id
    and coalesce(vote.voter_id, vote.voter_entity_id, vote.voter_country_id)
      = coalesce(p_voter_id, p_voter_entity_id, p_voter_country_id)
    and vote.points = p_points
  order by vote.created_at desc, vote.id desc
  limit 1;

  return jsonb_build_object(
    'riskClass', 'R2',
    'action', v_action,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'expectedVersion', v_version,
    'currentVoteId', v_existing.id,
    'currentReceivingCountryId', v_existing.receiving_country_id,
    'currentReceivingEntityId', v_existing.receiving_entity_id,
    'points', p_points,
    'alreadyApplied', case
      when v_action = 'clear' then v_existing.id is null
      else v_existing.id is not null
        and v_existing.receiving_country_id is not distinct from p_receiving_country_id
        and v_existing.receiving_entity_id is not distinct from p_receiving_entity_id
    end
  );
end
$preview$;


create or replace function public.studio2_apply_jury_vote_change(
  p_edition_id uuid,
  p_show_id uuid,
  p_voter_id uuid,
  p_voter_country_id uuid,
  p_voter_entity_id uuid,
  p_receiving_country_id uuid,
  p_receiving_entity_id uuid,
  p_points integer,
  p_action text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $apply$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_request jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_vote_id uuid;
  v_deleted integer := 0;
  v_result jsonb;
begin
  perform private.v3_require_active_auth_session();
  if not private.studio2_user_has_capability(auth.uid(),'jury.ballots.manage',p_edition_id) then
    raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode='42501';
  end if;
  if v_action not in ('assign', 'clear') then
    raise exception 'Unknown jury score action' using errcode = '22023';
  end if;
  if p_operation_id is null
     or p_expected_version is null
     or p_expected_version < 0
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Operation id, idempotency key and expected jury score version are required'
      using errcode = '22023';
  end if;

  v_request := jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'voterId', p_voter_id,
      'voterCountryId', p_voter_country_id,
      'voterEntityId', p_voter_entity_id,
      'receivingCountryId', p_receiving_country_id,
      'receivingEntityId', p_receiving_entity_id,
      'points', p_points,
      'action', v_action,
      'expectedVersion', p_expected_version
    );
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'jury.vote.' || v_action,
    'R2',
    v_request
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim->>'status'<>'succeeded' or v_claim->'result' is null then raise exception 'OPERATION_PENDING'; end if;
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('result',(v_claim->'result')||jsonb_build_object('request',v_request),'replayed',true);
  end if;

  -- Result publication/finalization and every canonical Jury write share this
  -- lock order. Recovery above does not need the current source row to exist.
  perform pg_advisory_xact_lock(hashtextextended('studio2-results:'||p_show_id::text,0));
  perform 1 from public.shows where id=p_show_id for share;
  perform 1 from public.studio2_edition_runtime where edition_id=p_edition_id for share;
  perform private.v3_assert_mutable_jury_input(p_edition_id,p_show_id);
  perform pg_advisory_xact_lock(
    hashtextextended('studio2-jury-votes:' || p_show_id::text, 0)
  );

  insert into public.studio2_jury_vote_versions (
    show_id, edition_id, version, updated_at
  )
  values (p_show_id, p_edition_id, 0, now())
  on conflict (show_id) do nothing;

  select version_row.version
  into v_current_version
  from public.studio2_jury_vote_versions version_row
  where version_row.show_id = p_show_id
    and version_row.edition_id = p_edition_id
  for update;

  if not found then
    raise exception 'Jury score version belongs to another edition'
      using errcode = '42501';
  end if;
  if p_expected_version is distinct from v_current_version then
    raise exception using errcode = 'PT409', message = 'VERSION_CONFLICT';
  end if;

  -- Re-run the impact preflight inside the authoritative transaction. Preview
  -- is evidence for the user, never permission for the later mutation.
  perform public.studio2_jury_vote_change_preview(
    p_edition_id,
    p_show_id,
    p_voter_id,
    p_voter_country_id,
    p_voter_entity_id,
    p_receiving_country_id,
    p_receiving_entity_id,
    p_points,
    v_action
  );

  if v_action = 'assign' then
    v_vote_id := public.assign_jury_vote(
      p_edition_id,
      p_show_id,
      p_voter_id,
      p_voter_country_id,
      p_voter_entity_id,
      p_receiving_country_id,
      p_receiving_entity_id,
      p_points
    );
  else
    v_deleted := public.clear_jury_point(
      p_edition_id,
      p_show_id,
      p_voter_id,
      p_voter_country_id,
      p_voter_entity_id,
      p_points
    );
  end if;

  select version_row.version
  into v_next_version
  from public.studio2_jury_vote_versions version_row
  where version_row.show_id = p_show_id
    and version_row.edition_id = p_edition_id;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    auth.uid(),
    'jury_vote_' || v_action,
    'jury_votes',
    coalesce(v_vote_id::text, p_show_id::text),
    jsonb_build_object(
      'showId', p_show_id,
      'points', p_points,
      'expectedVersion', p_expected_version
    ),
    jsonb_build_object(
      'showId', p_show_id,
      'points', p_points,
      'voteId', v_vote_id,
      'deletedRows', v_deleted,
      'version', coalesce(v_next_version, v_current_version),
      'operationId', v_operation_id
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'request', v_request,
    'riskClass', 'R2',
    'operationId', v_operation_id,
    'action', v_action,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'points', p_points,
    'voteId', v_vote_id,
    'deletedRows', v_deleted,
    'previousVersion', v_current_version,
    'version', coalesce(v_next_version, v_current_version)
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$apply$;


-- Preserve the existing public signature. Edition/show authority for a deleted
-- source is recoverable from its committed receipt, never from a caller actor.
create or replace function public.studio2_apply_jury_ballot_review(
 p_ballot_id uuid,p_target_status text,p_reason text,p_operation_id uuid,p_idempotency_key text,p_expected_version bigint
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $review$
declare
 ballot public.jury_ballot_submissions; prior public.studio2_operation_receipts;
 target text:=lower(btrim(coalesce(p_target_status,''))); reason text:=nullif(btrim(p_reason),'');
 v_edition_id uuid; v_show_id uuid; scope jsonb; claim jsonb; result jsonb; previous_status text;
begin
 perform private.v3_require_active_auth_session();
 if p_ballot_id is null or target not in ('valid','needs_review','invalidated','superseded') or p_expected_version is null or p_expected_version<0 or p_operation_id is null or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Valid ballot review and operation identity are required' using errcode='22023'; end if;
 if target<>'valid' and reason is null then raise exception 'A reason is required for this jury ballot transition' using errcode='22023'; end if;
 select r.* into prior from public.studio2_operation_receipts r where r.operation_id=p_operation_id or (r.actor_id=auth.uid() and r.command='jury.ballot.review.'||target and r.idempotency_key=p_idempotency_key)
 order by (r.operation_id=p_operation_id) desc limit 1 for update;
 if prior.operation_id is not null then
  if prior.actor_id is distinct from auth.uid() or prior.command is distinct from 'jury.ballot.review.'||target or prior.idempotency_key is distinct from p_idempotency_key or prior.scope->>'ballotId' is distinct from p_ballot_id::text then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  v_edition_id:=(prior.scope->>'editionId')::uuid; v_show_id:=(prior.scope->>'showId')::uuid;
 else
  select b.* into ballot from public.jury_ballot_submissions b where b.id=p_ballot_id;
  if ballot.id is null then raise exception 'Jury ballot not found' using errcode='P0002'; end if;
  v_edition_id:=ballot.edition_id; v_show_id:=ballot.show_id;
 end if;
 if v_edition_id is null or not private.studio2_user_has_capability(auth.uid(),'jury.ballots.manage',v_edition_id) then raise exception 'Missing Solaris capability: jury.ballots.manage' using errcode='42501'; end if;
 -- Old successful receipts omitted reason from their fingerprint. Only their
 -- immutable committed audit can bind it now. This compatibility path is
 -- readback-only: it can neither write a ballot nor create new legacy receipts.
 if prior.status='succeeded' and prior.scope ? 'fromStatus' and not (prior.scope ? 'contractVersion') then
  if prior.scope->>'toStatus' is distinct from target or (prior.scope->>'expectedVersion')::bigint is distinct from p_expected_version
   or not exists(select 1 from public.admin_audit_log a where a.actor_id=auth.uid() and a.action='jury_ballot_review_transition' and a.record_id=p_ballot_id::text and a.after_data->>'operationId'=prior.operation_id::text
    and a.before_data->>'status'=prior.scope->>'fromStatus' and (a.before_data->>'version')::bigint=p_expected_version
    and a.after_data->>'status'=target and (a.after_data->>'version')::bigint=p_expected_version+1 and nullif(btrim(a.after_data->>'reason'),'') is not distinct from reason)
   then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return prior.result||jsonb_build_object('reason',reason,'previousVersion',p_expected_version,'editionId',v_edition_id,'showId',v_show_id,'replayed',true);
 end if;
 scope:=jsonb_build_object('ballotId',p_ballot_id,'editionId',v_edition_id,'showId',v_show_id,'fromStatus',coalesce(prior.scope->>'fromStatus',ballot.status),'contractVersion',2);
 claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,p_operation_id,'jury.ballot.review.'||target,'R2',scope,jsonb_build_object('targetStatus',target,'reason',reason,'expectedVersion',p_expected_version));
 if coalesce((claim->>'replayed')::boolean,false) then
  if claim->>'status'<>'succeeded' or claim->'result' is null then raise exception 'OPERATION_PENDING'; end if;
  return (claim->'result')||jsonb_build_object('replayed',true);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('studio2-results:'||v_show_id::text,0));
 perform pg_advisory_xact_lock(hashtextextended('studio2-jury-votes:'||v_show_id::text,0));
 perform 1 from public.shows s where s.id=v_show_id for share;
 perform 1 from public.studio2_edition_runtime r where r.edition_id=v_edition_id for share;
 perform private.v3_assert_mutable_jury_input(v_edition_id,v_show_id);
 select b.* into ballot from public.jury_ballot_submissions b where b.id=p_ballot_id for update;
 if ballot.id is null or ballot.edition_id is distinct from v_edition_id or ballot.show_id is distinct from v_show_id then raise exception 'Jury ballot scope changed' using errcode='PT409'; end if;
 if ballot.review_version is distinct from p_expected_version then raise exception 'VERSION_CONFLICT' using errcode='PT409'; end if;
 perform public.studio2_jury_ballot_review_preview(p_ballot_id,target);
 previous_status:=ballot.status;
 update public.jury_ballot_submissions set status=target,review_version=review_version+1,review_reason=reason,reviewed_at=now(),reviewed_by=auth.uid(),updated_at=now() where id=p_ballot_id returning * into ballot;
 -- Results-cache invalidation and review-task/notification consequences are
 -- synchronous triggers. Either they, audit and receipt all commit or none do.
 insert into public.admin_audit_log(actor_id,action,table_name,record_id,before_data,after_data) values(auth.uid(),'jury_ballot_review_transition','jury_ballot_submissions',p_ballot_id::text,
  jsonb_build_object('status',previous_status,'version',p_expected_version),
  jsonb_build_object('status',ballot.status,'version',ballot.review_version,'reason',reason,'operationId',p_operation_id));
 result:=jsonb_build_object('ok',true,'ballotId',p_ballot_id,'editionId',v_edition_id,'showId',v_show_id,'status',ballot.status,'version',ballot.review_version,'previousVersion',p_expected_version,'reason',reason,'operationId',p_operation_id);
 perform private.studio2_complete_operation(p_operation_id,result);
 return result||jsonb_build_object('replayed',false);
end $review$;
do $manual_evidence$
declare signature regprocedure; definition text; anchor text:='    and vote.show_id is not distinct from p_show_id';
begin
 foreach signature in array array['public.assign_jury_vote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer)'::regprocedure,'public.clear_jury_point(uuid,uuid,uuid,uuid,uuid,integer)'::regprocedure] loop
  definition:=pg_get_functiondef(signature);
  if position(anchor in definition)=0 then raise exception 'Manual jury primitive definition drift: %',signature; end if;
  if position('and vote.ballot_submission_id is null' in definition)=0 then
   execute replace(definition,anchor,anchor||E'\n    and vote.ballot_submission_id is null');
  end if;
 end loop;
end $manual_evidence$;
-- Preview is not permission to commit. Both preview and apply enforce a live
-- session and fresh canonical capability; service credentials confer neither.
do $review_preview$
declare definition text;
begin
 definition:=pg_get_functiondef('public.studio2_jury_ballot_review_preview(uuid,text)'::regprocedure);
 definition:=replace(definition,E'begin\n',E'begin\n  perform private.v3_require_active_auth_session();\n');
 definition:=replace(definition,'public.studio2_access_allowed(''jury.ballots.manage'', v_ballot.edition_id, false)','private.studio2_user_has_capability(auth.uid(),''jury.ballots.manage'',v_ballot.edition_id)');
 execute definition;
end $review_preview$;
alter function public.studio2_jury_ballot_review_preview(uuid,text) set search_path=pg_catalog,public,private,pg_temp;
alter function public.assign_jury_vote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer) set search_path=pg_catalog,public,private,pg_temp;
alter function public.clear_jury_point(uuid,uuid,uuid,uuid,uuid,integer) set search_path=pg_catalog,public,private,pg_temp;
revoke all on function public.assign_jury_vote(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer),public.clear_jury_point(uuid,uuid,uuid,uuid,uuid,integer) from public,anon,authenticated,service_role;
revoke all on function public.studio2_jury_ballot_review_preview(uuid,text),public.studio2_apply_jury_ballot_review(uuid,text,text,uuid,text,bigint),public.studio2_jury_vote_change_preview(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,text),public.studio2_apply_jury_vote_change(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text,bigint) from public,anon,service_role;
grant execute on function public.studio2_jury_ballot_review_preview(uuid,text),public.studio2_apply_jury_ballot_review(uuid,text,text,uuid,text,bigint),public.studio2_jury_vote_change_preview(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,text),public.studio2_apply_jury_vote_change(uuid,uuid,uuid,uuid,uuid,uuid,uuid,integer,text,uuid,text,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
