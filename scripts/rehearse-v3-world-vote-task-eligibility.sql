\set ON_ERROR_STOP on
-- TG10 companion acceptance rehearsal for WORLD-05's TG8 local fixture.
-- MANDATORY: invoke AFTER rehearse-v3-world-legislative-votes.sql and BEFORE
-- rehearse-v3-world-legislative-votes-checks.sql in the SAME local psql session.
-- Parent fixture owns BEGIN, companion TG8 checks own ROLLBACK.
-- NEVER target hosted/production Supabase. A repaired, strict loopback-only
-- parent runner is a prerequisite for execution. Fail closed otherwise.
--
-- Isolate the entire TG10 exercise from TG8's subsequent open/cast tests.
savepoint tg10_vote_task_eligibility;

do $tg10_setup$
declare
  v jsonb := current_setting('solaris.tg8_fixture', true)::jsonb;
  v_vote_id uuid := gen_random_uuid();
  v_inserted integer;
begin
  if v is null
    or v->>'repA' is null or v->>'repB' is null
    or v->>'countryA' is null or v->>'measureId' is null
    or v->>'ruleId' is null or v->>'orgId' is null then
    raise exception 'TG10_REQUIRES_CANONICAL_TG8_LOCAL_FIXTURE';
  end if;

  if to_regprocedure('private.world_vote_task_recipient_eligible_v1(uuid,uuid,uuid)') is null then
    raise exception 'TG10_TASK_RECIPIENT_PREDICATE_MISSING';
  end if;

  -- Trusted fixture insertion: the canonical TG8 commands are separately
  -- rehearsed by WORLD-05. TG10 only needs an OPEN frozen seat for this test,
  -- and must not alter TG8's measure/version or official vote lifecycle.
  insert into public.world_votes (
    id, organization_id, organ_id, measure_id, measure_version_id,
    rule_id, rule_snapshot, electorate_count,
    opened_at, closes_at, open_operation_id
  )
  select
    v_vote_id, measure.organization_id, measure.organ_id,
    measure.id, measure.current_version_id,
    rule.id, private.world_voting_rule_snapshot_v1(rule.id), 1,
    clock_timestamp() - interval '5 minutes',
    clock_timestamp() + interval '1 hour',
    gen_random_uuid()
  from public.world_measures measure
  join public.world_voting_rules rule
    on rule.id = (v->>'ruleId')::uuid
   and rule.organization_id = measure.organization_id
  where measure.id = (v->>'measureId')::uuid
    and measure.organization_id = (v->>'orgId')::uuid
    and measure.current_version_id is not null;
  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'TG10_LOCAL_VOTE_FIXTURE_NOT_CREATED';
  end if;

  insert into public.world_vote_eligibility (
    vote_id, country_id, membership_id, membership_revision,
    representation_id, representation_revision, representative_person_id,
    snapshotted_at
  )
  select
    v_vote_id, membership.country_id, membership.id, membership.revision,
    representative.id, representative.revision, representative.person_id,
    clock_timestamp()
  from public.world_organization_memberships membership
  join public.world_organization_representations representative
    on representative.organization_id = membership.organization_id
   and representative.country_id = membership.country_id
  where membership.organization_id = (v->>'orgId')::uuid
    and membership.country_id = (v->>'countryA')::uuid
    and membership.status = 'member'
    and representative.user_id = (v->>'repA')::uuid;
  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'TG10_FROZEN_COUNTRY_SEAT_NOT_CREATED';
  end if;

  perform set_config('solaris.tg10_vote_id', v_vote_id::text, true);
end $tg10_setup$;

do $tg10_reader$
declare
  v jsonb := current_setting('solaris.tg8_fixture')::jsonb;
  v_vote uuid := current_setting('solaris.tg10_vote_id')::uuid;
  v_country uuid := (v->>'countryA')::uuid;
begin
  if not private.world_vote_task_recipient_eligible_v1(
    v_vote, v_country, (v->>'repA')::uuid
  ) then raise exception 'TG10_VALID_REPRESENTATIVE_TASK_DENIED'; end if;

  if private.world_vote_task_recipient_eligible_v1(
    v_vote, v_country, (v->>'repB')::uuid
  ) then raise exception 'TG10_OTHER_COUNTRY_REP_LEAK'; end if;

  if private.world_vote_task_recipient_eligible_v1(
    v_vote, v_country, (v->>'outsider')::uuid
  ) then raise exception 'TG10_OUTSIDER_TASK_LEAK'; end if;

  if private.world_vote_task_recipient_eligible_v1(
    v_vote, v_country, null
  ) then raise exception 'TG10_NULL_ACTOR_TASK_LEAK'; end if;

  if private.world_vote_task_recipient_eligible_v1(
    null, v_country, (v->>'repA')::uuid
  ) then raise exception 'TG10_NULL_VOTE_TASK_LEAK'; end if;

  if private.world_vote_task_recipient_eligible_v1(
    v_vote, null, (v->>'repA')::uuid
  ) then raise exception 'TG10_NULL_COUNTRY_TASK_LEAK'; end if;

  if private.world_vote_task_recipient_eligible_v1(
    (v->>'closedVoteId')::uuid, v_country, (v->>'repA')::uuid
  ) then raise exception 'TG10_EXPIRED_VOTE_TASK_LEAK'; end if;
end $tg10_reader$;

-- The private service predicate must never become callable by a browser role.
set local role anon;
do $tg10_anonymous$
declare
  v jsonb := current_setting('solaris.tg8_fixture')::jsonb;
  v_vote uuid := current_setting('solaris.tg10_vote_id')::uuid;
begin
  begin
    perform private.world_vote_task_recipient_eligible_v1(
      v_vote, (v->>'countryA')::uuid, (v->>'repA')::uuid
    );
    raise exception 'TG10_ANON_EXECUTE_ALLOWED';
  exception when insufficient_privilege then null;
  end;
end $tg10_anonymous$;
reset role;

update public.studio2_feature_flags set enabled = false
  where key = 'terra_world_legislative_voting';
do $tg10_dark_vote$
declare
  v jsonb := current_setting('solaris.tg8_fixture')::jsonb;
begin
  if private.world_vote_task_recipient_eligible_v1(
    current_setting('solaris.tg10_vote_id')::uuid,
    (v->>'countryA')::uuid, (v->>'repA')::uuid
  ) then raise exception 'TG10_DISABLED_VOTING_TASK_LEAK'; end if;
end $tg10_dark_vote$;
update public.studio2_feature_flags set enabled = true
  where key = 'terra_world_legislative_voting';

update public.studio2_feature_flags set enabled = false
  where key = 'terra_world_voting_rules';
do $tg10_dark_rules$
declare v jsonb := current_setting('solaris.tg8_fixture')::jsonb;
begin
  if private.world_vote_task_recipient_eligible_v1(
    current_setting('solaris.tg10_vote_id')::uuid,
    (v->>'countryA')::uuid, (v->>'repA')::uuid
  ) then raise exception 'TG10_DISABLED_RULES_TASK_LEAK'; end if;
end $tg10_dark_rules$;
update public.studio2_feature_flags set enabled = true
  where key = 'terra_world_voting_rules';

update public.studio2_platform_operational_state
  set mode = 'read_only', version = version + 1 where singleton = true;
do $tg10_read_only$
declare v jsonb := current_setting('solaris.tg8_fixture')::jsonb;
begin
  if private.world_vote_task_recipient_eligible_v1(
    current_setting('solaris.tg10_vote_id')::uuid,
    (v->>'countryA')::uuid, (v->>'repA')::uuid
  ) then raise exception 'TG10_READ_ONLY_TASK_LEAK'; end if;
end $tg10_read_only$;
update public.studio2_platform_operational_state
  set mode = 'normal', version = version + 1 where singleton = true;

-- A REAL TG8 command inserts an immutable private ballot and receipt. The
-- same actor that was eligible above must immediately become ineligible.
do $tg10_cast$
declare
  v jsonb := current_setting('solaris.tg8_fixture')::jsonb;
  v_vote uuid := current_setting('solaris.tg10_vote_id')::uuid;
  v_operation uuid := gen_random_uuid();
  v_receipt jsonb;
begin
  if not private.world_vote_task_recipient_eligible_v1(
    v_vote, (v->>'countryA')::uuid, (v->>'repA')::uuid
  ) then raise exception 'TG10_REP_ELIGIBILITY_NOT_RESTORED'; end if;

  perform set_config('request.jwt.claim.sub', v->>'repA', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v->>'repA', 'role', 'authenticated')::text, true);
  v_receipt := public.world_cast_ballot_v1(
    v_vote, (v->>'countryA')::uuid, 1, 'aye', v_operation,
    'tg10-local-eligibility-cast:' || v_operation::text
  );
  if v_receipt->>'status' <> 'succeeded'
     or v_receipt #>> '{result,status}' <> 'cast' then
    raise exception 'TG10_CANONICAL_CAST_FAILED: %', v_receipt;
  end if;

  if private.world_vote_task_recipient_eligible_v1(
    v_vote, (v->>'countryA')::uuid, (v->>'repA')::uuid
  ) then raise exception 'TG10_ALREADY_CAST_VOTE_TASK_LEAK'; end if;
end $tg10_cast$;


-- A frozen approved proxy is eligible instead of the representative. A live
-- revocation must immediately invalidate this task without relying on an
-- asynchronous notification projection or modifying immutable electorate.
do $tg10_proxy_revocation$
declare
  v jsonb := current_setting('solaris.tg8_fixture')::jsonb;
  v_proxy uuid := gen_random_uuid();
  v_proxy_vote uuid := gen_random_uuid();
  v_rep public.world_organization_representations%rowtype;
  v_member public.world_organization_memberships%rowtype;
  v_inserted integer;
begin
  select * into strict v_rep
  from public.world_organization_representations
  where organization_id = (v->>'orgId')::uuid
    and country_id = (v->>'countryA')::uuid
    and user_id = (v->>'repA')::uuid;

  select * into strict v_member
  from public.world_organization_memberships
  where organization_id = (v->>'orgId')::uuid
    and country_id = (v->>'countryA')::uuid
    and status = 'member' and ended_at is null;

  insert into public.world_representation_proxies (
    id, representation_id, proxy_person_id, proxy_user_id,
    valid_from, valid_until, status, revision
  ) select
    v_proxy, v_rep.id, person.id, (v->>'repB')::uuid,
    clock_timestamp() - interval '1 hour',
    clock_timestamp() + interval '1 hour',
    'approved', 1
  from public.delegation_people person
  where person.identity_key = 'tg8:' || (
    select rep_b.person_id::text
    from public.world_organization_representations rep_b
    where rep_b.organization_id = (v->>'orgId')::uuid
      and rep_b.user_id = (v->>'repB')::uuid
    limit 1
  );
  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'TG10_PROXY_PERSON_IDENTITY_MISSING';
  end if;

  -- The parent TG8 fixture has an already-closed independent measure/vote.
  -- Freeze another transient OPEN vote for that measure, fully inside TG10's
  -- savepoint, so the ordinary TG10 cast test can keep its own electorate.
  insert into public.world_votes (
    id, organization_id, organ_id, measure_id, measure_version_id,
    rule_id, rule_snapshot, electorate_count,
    opened_at, closes_at, open_operation_id
  )
  select
    v_proxy_vote, old_vote.organization_id, old_vote.organ_id,
    old_vote.measure_id, old_vote.measure_version_id,
    old_vote.rule_id, old_vote.rule_snapshot, 1,
    clock_timestamp() - interval '5 minutes',
    clock_timestamp() + interval '1 hour', gen_random_uuid()
  from public.world_votes old_vote
  where old_vote.id = (v->>'closedVoteId')::uuid
    and old_vote.status = 'open';
  -- TG8's historical fixture is still an 'open' status row until certified;
  -- only its close instant has already elapsed. That is expected here.
  get diagnostics v_inserted = row_count;
  if v_inserted <> 1 then
    raise exception 'TG10_PROXY_VOTE_FIXTURE_MISSING';
  end if;

  insert into public.world_vote_eligibility (
    vote_id, country_id, membership_id, membership_revision,
    representation_id, representation_revision, representative_person_id,
    proxy_id, proxy_revision, snapshotted_at
  ) values (
    v_proxy_vote, v_member.country_id, v_member.id, v_member.revision,
    v_rep.id, v_rep.revision, v_rep.person_id,
    v_proxy, 1, clock_timestamp()
  );

  if not private.world_vote_task_recipient_eligible_v1(
    v_proxy_vote, v_member.country_id, (v->>'repB')::uuid
  ) then raise exception 'TG10_APPROVED_PROXY_TASK_DENIED'; end if;

  if private.world_vote_task_recipient_eligible_v1(
    v_proxy_vote, v_member.country_id, (v->>'repA')::uuid
  ) then raise exception 'TG10_REPLACED_REPRESENTATIVE_TASK_LEAK'; end if;

  update public.world_representation_proxies proxy
  set status = 'revoked', revoked_at = clock_timestamp(), revision = revision + 1
  where proxy.id = v_proxy;

  if private.world_vote_task_recipient_eligible_v1(
    v_proxy_vote, v_member.country_id, (v->>'repB')::uuid
  ) then raise exception 'TG10_REVOKED_PROXY_TASK_LEAK'; end if;
end $tg10_proxy_revocation$;

-- Restore TG8 fixture, vote, actor GUCs, flags and all sensitive test records.
-- TG8 must still be able to open and certify its own separate fixture votes.
rollback to savepoint tg10_vote_task_eligibility;
release savepoint tg10_vote_task_eligibility;
\echo 'PASS: TG10 read-only vote-task entitlement regression passed in rollback-only TG8 fixture'
