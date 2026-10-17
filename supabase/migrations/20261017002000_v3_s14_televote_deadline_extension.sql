begin;

-- System V3 / S14 Stage 7: make televoting.rounds.closes_at the authoritative
-- server-side vote-acceptance deadline and govern deadline changes through the
-- existing S2 operation + round-version model.
--
-- Compatibility: pre-existing open rounds with NULL closes_at remain accepted
-- until they are transitioned again. Every new transition to open requires a
-- future deadline, and every configured deadline is enforced at the canonical
-- vote_submissions write boundary using database server time.

create or replace function private.v3_televote_solaris_edition_for_round(p_round_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, televoting
as $resolve$
declare
  v_remote_edition_id uuid;
  v_binding_edition_id uuid;
  v_link_edition_id uuid;
begin
  select round_row.edition_id
  into v_remote_edition_id
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_remote_edition_id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  select binding.edition_id
  into v_binding_edition_id
  from public.televoting_round_bindings binding
  where binding.remote_round_id = p_round_id::text;

  select link.solaris_id
  into v_link_edition_id
  from public.integration_links link
  where link.service = 'televoting'
    and link.entity_type = 'edition'
    and link.remote_id = v_remote_edition_id::text
  limit 1;

  if v_binding_edition_id is not null
     and v_link_edition_id is not null
     and v_binding_edition_id is distinct from v_link_edition_id then
    raise exception 'Televote round binding and edition integration link disagree'
      using errcode = '23514';
  end if;

  if coalesce(v_binding_edition_id, v_link_edition_id) is null then
    raise exception 'Voting round is not linked to a Solaris edition'
      using errcode = 'P0002';
  end if;

  return coalesce(v_binding_edition_id, v_link_edition_id);
end
$resolve$;

revoke all on function private.v3_televote_solaris_edition_for_round(uuid)
  from public, anon, authenticated;

-- Prevent a direct browser edit from silently changing the acceptance window.
-- Existing SECURITY DEFINER operation functions execute as their trusted owner.
create or replace function private.v3_guard_direct_televote_deadline()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
begin
  if new.closes_at is distinct from old.closes_at
     and current_user in ('authenticated', 'anon') then
    raise exception
      'Televote deadline must use the governed deadline operation contract.'
      using errcode = '42501';
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_direct_televote_deadline()
  from public, anon, authenticated;

drop trigger if exists v3_guard_direct_televote_deadline
  on televoting.rounds;
create trigger v3_guard_direct_televote_deadline
before update of closes_at on televoting.rounds
for each row execute function private.v3_guard_direct_televote_deadline();

-- Any *new* transition to open must have a future server deadline. Existing
-- already-open legacy rows are not rewritten by this migration.
create or replace function private.v3_require_televote_deadline_on_open()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $require$
begin
  if new.status = 'open'
     and old.status is distinct from new.status
     and (new.closes_at is null or new.closes_at <= now()) then
    raise exception 'Televote round requires a future voting deadline before opening'
      using errcode = '23514';
  end if;
  return new;
end
$require$;

revoke all on function private.v3_require_televote_deadline_on_open()
  from public, anon, authenticated;

drop trigger if exists v3_require_televote_deadline_on_open
  on televoting.rounds;
create trigger v3_require_televote_deadline_on_open
before update of status on televoting.rounds
for each row execute function private.v3_require_televote_deadline_on_open();

-- Server-time enforcement lives on the final canonical ballot row, not on a
-- browser timer. Historical imports are intentionally outside this live gate.
create or replace function private.v3_enforce_televote_submission_deadline()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, televoting
as $deadline$
declare
  v_status televoting.round_status;
  v_deadline timestamptz;
begin
  if coalesce(new.is_historical, false) then
    return new;
  end if;

  select round_row.status, round_row.closes_at
  into v_status, v_deadline
  from televoting.rounds round_row
  where round_row.id = new.round_id
  for share;

  if v_status is null then
    raise exception 'Voting round not found' using errcode = '23503';
  end if;
  if v_status <> 'open' then
    raise exception 'Round is not open' using errcode = '22023';
  end if;
  if v_deadline is not null and now() >= v_deadline then
    raise exception 'Voting deadline has passed' using errcode = '22023';
  end if;

  return new;
end
$deadline$;

revoke all on function private.v3_enforce_televote_submission_deadline()
  from public, anon, authenticated;

drop trigger if exists v3_enforce_televote_submission_deadline
  on televoting.vote_submissions;
create trigger v3_enforce_televote_submission_deadline
before insert on televoting.vote_submissions
for each row execute function private.v3_enforce_televote_submission_deadline();

create or replace function televoting.studio2_round_deadline_change_preview(
  p_round_id uuid,
  p_new_deadline_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $preview$
declare
  v_round televoting.rounds%rowtype;
  v_solaris_edition_id uuid;
  v_round_version bigint := 0;
  v_action text;
  v_blockers jsonb := '[]'::jsonb;
begin
  if p_round_id is null or p_new_deadline_at is null then
    raise exception 'Round and deadline are required' using errcode = '22023';
  end if;

  select round_row.* into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  v_solaris_edition_id := private.v3_televote_solaris_edition_for_round(p_round_id);

  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  select coalesce((
    select version_row.version
    from public.studio2_televote_round_versions version_row
    where version_row.round_id = p_round_id
  ), 0)
  into v_round_version;

  v_action := case when v_round.closes_at is null then 'set' else 'extend' end;

  if p_new_deadline_at <= now() then
    v_blockers := v_blockers || jsonb_build_array('New Televote deadline must be in the future.');
  end if;
  if v_round.closes_at is not null and p_new_deadline_at <= v_round.closes_at then
    v_blockers := v_blockers || jsonb_build_array('New Televote deadline must extend the existing deadline.');
  end if;
  if v_round.results_status in ('locked', 'published') then
    v_blockers := v_blockers || jsonb_build_array('Locked or published Televote results cannot change the voting deadline.');
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'roundId', v_round.id,
    'remoteEditionId', v_round.edition_id,
    'solarisEditionId', v_solaris_edition_id,
    'status', v_round.status,
    'action', v_action,
    'currentDeadline', v_round.closes_at,
    'requestedDeadline', p_new_deadline_at,
    'expectedRoundVersion', v_round_version,
    'resultsStatus', v_round.results_status,
    'blockers', v_blockers,
    'alreadyApplied', v_round.closes_at is not distinct from p_new_deadline_at
  );
end
$preview$;

revoke all on function televoting.studio2_round_deadline_change_preview(uuid, timestamptz)
  from public, anon;
grant execute on function televoting.studio2_round_deadline_change_preview(uuid, timestamptz)
  to authenticated, service_role;

create or replace function televoting.studio2_apply_round_deadline_change(
  p_round_id uuid,
  p_new_deadline_at timestamptz,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_round_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $apply$
declare
  v_round televoting.rounds%rowtype;
  v_solaris_edition_id uuid;
  v_current_round_version bigint := 0;
  v_next_round_version bigint := 0;
  v_action text;
  v_command text;
  v_claim jsonb;
  v_canonical_operation_id uuid;
  v_result jsonb;
begin
  if p_round_id is null
     or p_new_deadline_at is null
     or p_operation_id is null
     or p_expected_round_version is null
     or p_expected_round_version < 0 then
    raise exception 'Round, deadline, operation and expected version are required'
      using errcode = '22023';
  end if;

  select round_row.* into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id;

  if v_round.id is null then
    raise exception 'Voting round not found' using errcode = 'P0002';
  end if;

  v_solaris_edition_id := private.v3_televote_solaris_edition_for_round(p_round_id);

  if not public.studio2_access_allowed('voting.manage', v_solaris_edition_id, false) then
    raise exception 'Missing Solaris capability: voting.manage'
      using errcode = '42501';
  end if;

  v_action := case when v_round.closes_at is null then 'set' else 'extend' end;
  v_command := case when v_action = 'set' then 'televote.deadline.set' else 'televote.extend' end;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    v_command,
    'R2',
    jsonb_build_object(
      'roundId', p_round_id,
      'solarisEditionId', v_solaris_edition_id
    ),
    jsonb_build_object(
      'newDeadline', p_new_deadline_at,
      'expectedRoundVersion', p_expected_round_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_canonical_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-televote-round-deadline:' || p_round_id::text, 0)
  );

  select round_row.* into v_round
  from televoting.rounds round_row
  where round_row.id = p_round_id
  for update;

  select coalesce((
    select version_row.version
    from public.studio2_televote_round_versions version_row
    where version_row.round_id = p_round_id
  ), 0)
  into v_current_round_version;

  if p_expected_round_version <> v_current_round_version then
    raise exception 'Televote round deadline changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  if p_new_deadline_at <= now() then
    raise exception 'New Televote deadline must be in the future'
      using errcode = '23514';
  end if;
  if v_round.closes_at is not null and p_new_deadline_at <= v_round.closes_at then
    raise exception 'New Televote deadline must extend the existing deadline'
      using errcode = '23514';
  end if;
  if v_round.results_status in ('locked', 'published') then
    raise exception 'Locked or published Televote results cannot change the voting deadline'
      using errcode = '23514';
  end if;

  -- Re-evaluate action after the lock. A concurrent deadline set would already
  -- have changed the version and been rejected above.
  v_action := case when v_round.closes_at is null then 'set' else 'extend' end;
  if v_action = 'set' and v_command <> 'televote.deadline.set' then
    raise exception 'Televote deadline operation semantics changed since claim'
      using errcode = '40001';
  end if;
  if v_action = 'extend' and v_command <> 'televote.extend' then
    raise exception 'Televote deadline operation semantics changed since claim'
      using errcode = '40001';
  end if;

  update televoting.rounds
  set closes_at = p_new_deadline_at,
      updated_at = now()
  where id = p_round_id;

  select coalesce((
    select version_row.version
    from public.studio2_televote_round_versions version_row
    where version_row.round_id = p_round_id
  ), v_current_round_version + 1)
  into v_next_round_version;

  v_result := jsonb_build_object(
    'ok', true,
    'roundId', p_round_id,
    'solarisEditionId', v_solaris_edition_id,
    'status', v_round.status,
    'action', v_action,
    'previousDeadline', v_round.closes_at,
    'deadline', p_new_deadline_at,
    'previousRoundVersion', v_current_round_version,
    'roundVersion', v_next_round_version
  );

  return private.studio2_complete_operation(v_canonical_operation_id, v_result);
end
$apply$;

revoke all on function televoting.studio2_apply_round_deadline_change(
  uuid, timestamptz, uuid, text, bigint
) from public, anon;
grant execute on function televoting.studio2_apply_round_deadline_change(
  uuid, timestamptz, uuid, text, bigint
) to authenticated, service_role;

-- Emit the deadline operation as a canonical DomainEvent. The older Televote
-- event trigger ignores these command identities, so this trigger is additive
-- and cannot duplicate opened/closed/ballot events.
create or replace function private.v3_emit_televote_deadline_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $emit$
declare
  v_event_type text;
  v_round_id uuid;
  v_edition_id uuid;
  v_round_version bigint;
  v_payload jsonb;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not in ('televote.deadline.set', 'televote.extend') then
    return new;
  end if;

  begin
    v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
    v_edition_id := nullif(new.scope ->> 'solarisEditionId', '')::uuid;
    v_round_version := nullif(new.result ->> 'roundVersion', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed Televote deadline operation has invalid event provenance'
      using errcode = '23514';
  end;

  if v_round_id is null or v_edition_id is null or v_round_version is null then
    raise exception 'Completed Televote deadline operation lacks event provenance'
      using errcode = '23514';
  end if;

  if private.v3_televote_solaris_edition_for_round(v_round_id)
     is distinct from v_edition_id then
    raise exception 'Completed Televote deadline operation is outside canonical edition scope'
      using errcode = '23514';
  end if;

  v_event_type := case
    when new.command = 'televote.extend' then 'televote.extended'
    else 'televote.deadline_set'
  end;
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'roundId', v_round_id,
    'status', new.result ->> 'status',
    'previousDeadline', new.result -> 'previousDeadline',
    'deadline', new.result -> 'deadline',
    'previousRoundVersion', new.result -> 'previousRoundVersion',
    'roundVersion', new.result -> 'roundVersion'
  ));

  perform private.v3_emit_domain_event(
    v_event_type,
    'televote_round',
    v_round_id::text,
    v_round_version,
    new.operation_id,
    v_edition_id,
    null,
    v_payload,
    1,
    array['televote.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_televote_deadline_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_televote_deadline_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_televote_deadline_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_televote_deadline_operation_event();

-- Extend the existing Televote task consequence consumer to the deadline
-- lifecycle. Notification delivery remains deliberately limited to opened.
create or replace function public.studio2_process_televote_domain_event(
  p_event_id uuid,
  p_consumer_key text,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $process$
declare
  v_event private.v3_domain_events%rowtype;
  v_delivery private.v3_domain_event_outbox%rowtype;
  v_task_notifications integer := 0;
  v_pruned_notifications integer := 0;
  v_delivery_candidates integer := 0;
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key not in ('televote.tasks', 'televote.notifications')
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Televote domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in (
       'televote.opened',
       'televote.closed',
       'televote.ballot_submitted',
       'televote.deadline_set',
       'televote.extended'
     ) then
    raise exception 'Televote consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  if p_consumer_key = 'televote.notifications'
     and v_event.event_type <> 'televote.opened' then
    raise exception 'Televote notification consumer only accepts televote.opened'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Televote domain event delivery was not found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from private.v3_domain_event_consumer_receipts receipt
    where receipt.event_id = p_event_id
      and receipt.consumer_key = p_consumer_key
  ) then
    return public.studio2_complete_domain_event_delivery(
      p_event_id,
      p_consumer_key,
      p_worker_id,
      '{}'::jsonb
    );
  end if;

  if v_delivery.status <> 'processing'
     or v_delivery.lease_owner is distinct from p_worker_id
     or v_delivery.lease_expires_at <= now() then
    raise exception 'Televote domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  if p_consumer_key = 'televote.tasks' then
    perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);
    v_task_notifications := private.studio2_sync_task_notifications(v_event.edition_id);
    v_pruned_notifications := private.studio2_prune_stale_task_notifications(v_event.edition_id);
    v_metadata := jsonb_build_object(
      'effect', 'televote-task-reconciliation',
      'editionId', v_event.edition_id,
      'taskNotificationsChanged', v_task_notifications,
      'staleTaskNotificationsPruned', v_pruned_notifications
    );
  else
    v_delivery_candidates := public.solaris_enqueue_app_notifications(now());
    v_metadata := jsonb_build_object(
      'effect', 'televote-open-notification-evaluation',
      'editionId', v_event.edition_id,
      'deliveryCandidatesInserted', v_delivery_candidates
    );
  end if;

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_televote_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_televote_domain_event(uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
