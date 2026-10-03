begin;

-- Organisation OS V5 Maintenance / Read-only exit preflight.
--
-- Recovery from restricted modes requires a recent, actor-bound server
-- attestation plus a fresh database re-check at apply time. The attestation
-- includes the existing cross-service Sync Health + Storage runtime probes.

create table if not exists public.studio2_platform_exit_preflights (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id) on delete cascade,
  from_mode text not null check (from_mode in ('maintenance', 'read_only')),
  target_mode text not null check (target_mode in ('read_only', 'degraded')),
  platform_version bigint not null check (platform_version > 0),
  checks jsonb not null check (jsonb_typeof(checks) = 'object'),
  critical_failures text[] not null default '{}'::text[],
  ready boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  consumed_at timestamptz,
  constraint studio2_platform_exit_preflight_expiry_check check (expires_at > created_at)
);

create index if not exists studio2_platform_exit_preflights_actor_idx
  on public.studio2_platform_exit_preflights (actor_id, created_at desc);

alter table public.studio2_platform_exit_preflights enable row level security;
revoke all on table public.studio2_platform_exit_preflights
  from public, anon, authenticated;
grant all on table public.studio2_platform_exit_preflights to service_role;

create table if not exists private.studio2_platform_exit_write_probe (
  id uuid primary key,
  actor_id uuid not null,
  created_at timestamptz not null default now()
);

create or replace function private.studio2_platform_exit_transition(
  p_from text,
  p_to text
)
returns boolean
language sql
immutable
strict
set search_path = pg_catalog
as $allowed$
  select
    (p_from = 'maintenance' and p_to = 'read_only')
    or (p_from = 'read_only' and p_to = 'degraded');
$allowed$;

revoke all on function private.studio2_platform_exit_transition(text, text)
  from public, anon, authenticated;

create or replace function public.studio2_platform_exit_database_preflight(
  p_target_mode text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, storage
as $preflight$
declare
  v_actor uuid := auth.uid();
  v_state public.studio2_platform_operational_state;
  v_target text := lower(btrim(coalesce(p_target_mode, '')));
  v_database_ok boolean := true;
  v_database_error text;
  v_reads_ok boolean := true;
  v_reads_error text;
  v_write_ok boolean := true;
  v_write_error text;
  v_storage_ok boolean := true;
  v_storage_error text;
  v_confirmation_events integer := 0;
  v_televoting_events integer := 0;
  v_stale_bindings integer := 0;
  v_due_show_publications integer := 0;
  v_due_notices integer := 0;
  v_due_entry_publications integer := 0;
  v_future_scheduled integer := 0;
  v_overdue_reminders integer := 0;
  v_expired_confirmation_rounds integer := 0;
  v_unacked_required integer := 0;
  v_checks jsonb;
  v_critical_failures text[];
  v_ready boolean;
  v_probe uuid := gen_random_uuid();
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not public.studio2_access_allowed('maintenance.manage', null, false) then
    raise exception 'Missing Solaris capability: maintenance.manage' using errcode = '42501';
  end if;

  select *
  into v_state
  from public.studio2_platform_operational_state
  where singleton = true;

  if v_state.mode is null then
    raise exception 'Solaris platform operational state is unavailable'
      using errcode = '25006';
  end if;
  if not private.studio2_platform_exit_transition(v_state.mode, v_target) then
    raise exception 'Exit preflight is only valid for Maintenance -> Read-only or Read-only -> Degraded'
      using errcode = '23514';
  end if;

  begin
    perform 1;
    perform count(*) from public.studio2_platform_operational_state;
  exception when others then
    v_database_ok := false;
    v_database_error := left(sqlerrm, 500);
  end;

  begin
    perform count(*) from public.editions;
    perform count(*) from public.shows;
    perform count(*) from public.participants;
    perform count(*) from public.studio2_operation_receipts;
    perform count(*) from public.studio2_organizer_tasks;
  exception when others then
    v_reads_ok := false;
    v_reads_error := left(sqlerrm, 500);
  end;

  begin
    insert into private.studio2_platform_exit_write_probe (id, actor_id)
    values (v_probe, v_actor);
    delete from private.studio2_platform_exit_write_probe where id = v_probe;
  exception when others then
    v_write_ok := false;
    v_write_error := left(sqlerrm, 500);
  end;

  begin
    perform count(*) from storage.buckets;
    perform count(*) from storage.objects;
  exception when others then
    v_storage_ok := false;
    v_storage_error := left(sqlerrm, 500);
  end;

  select count(*)
  into v_confirmation_events
  from public.integration_events event
  where event.service = 'confirmations'
    and event.status <> 'completed';

  select count(*)
  into v_televoting_events
  from public.integration_events event
  where event.service = 'televoting'
    and event.status <> 'completed';

  select count(*)
  into v_stale_bindings
  from public.televoting_round_bindings binding
  join public.editions edition on edition.id = binding.edition_id
  where binding.frozen_at is null
    and (
      binding.last_synced_at is null
      or coalesce(binding.last_synced_revision, 0) < coalesce(edition.data_revision, 0)
    );

  select count(*)
  into v_due_show_publications
  from public.studio2_show_publication_controls control
  where control.state = 'scheduled'
    and control.scheduled_for is not null
    and control.scheduled_for <= now();

  select count(*)
  into v_due_notices
  from public.studio2_official_notices notice
  where notice.status = 'scheduled'
    and notice.scheduled_at is not null
    and notice.scheduled_at <= now();

  select count(*)
  into v_due_entry_publications
  from public.participants participant
  where participant.publication_status = 'scheduled'
    and participant.scheduled_publish_at is not null
    and participant.scheduled_publish_at <= now();

  select
    (select count(*) from public.studio2_show_publication_controls
      where state = 'scheduled' and scheduled_for > now())
    + (select count(*) from public.studio2_official_notices
      where status = 'scheduled' and scheduled_at > now())
    + (select count(*) from public.participants
      where publication_status = 'scheduled' and scheduled_publish_at > now())
  into v_future_scheduled;

  select count(*)
  into v_overdue_reminders
  from public.admin_deadlines deadline
  where deadline.completed_at is null
    and deadline.due_at < now();

  select count(*)
  into v_expired_confirmation_rounds
  from public.submission_rounds round
  where round.status = 'open'
    and round.closes_at is not null
    and round.closes_at < now();

  select count(*)
  into v_unacked_required
  from public.studio2_notice_receipts receipt
  join public.studio2_official_notices notice on notice.id = receipt.notice_id
  where notice.status = 'published'
    and notice.acknowledgement_required
    and receipt.acknowledged_at is null;

  v_checks := jsonb_build_object(
    'database_health', jsonb_build_object(
      'pass', v_database_ok,
      'critical', true,
      'detail', coalesce(v_database_error, 'Canonical database state is readable.')
    ),
    'auth_health', jsonb_build_object(
      'pass', exists(select 1 from auth.users actor where actor.id = v_actor),
      'critical', true,
      'detail', 'The current Organizer identity exists in auth.users.'
    ),
    'critical_service_reads', jsonb_build_object(
      'pass', v_reads_ok,
      'critical', true,
      'detail', coalesce(v_reads_error, 'Core contest, operation and Task projections are readable.')
    ),
    'critical_safe_write', jsonb_build_object(
      'pass', v_write_ok,
      'critical', true,
      'detail', coalesce(v_write_error, 'A disposable internal write probe completed and was removed.')
    ),
    'confirmation_sync', jsonb_build_object(
      'pass', v_confirmation_events = 0,
      'critical', true,
      'detail', format('%s unresolved Confirmations integration event(s).', v_confirmation_events),
      'unresolvedEvents', v_confirmation_events
    ),
    'voting_health', jsonb_build_object(
      'pass', v_televoting_events = 0 and v_stale_bindings = 0,
      'critical', true,
      'detail', format('%s unresolved Televoting event(s); %s stale round binding(s). Runtime reachability is attested by the server.', v_televoting_events, v_stale_bindings),
      'unresolvedEvents', v_televoting_events,
      'staleBindings', v_stale_bindings,
      'runtimeAttested', false
    ),
    'storage', jsonb_build_object(
      'pass', v_storage_ok,
      'critical', true,
      'detail', coalesce(v_storage_error, 'Storage catalog is readable. Storage API reachability is attested by the server.'),
      'runtimeAttested', false
    ),
    'pending_scheduled_operations', jsonb_build_object(
      'pass', (v_due_show_publications + v_due_notices + v_due_entry_publications) = 0,
      'critical', false,
      'detail', format('%s due show publication(s), %s due notice(s), %s due entry publication(s); %s future scheduled operation(s).', v_due_show_publications, v_due_notices, v_due_entry_publications, v_future_scheduled),
      'dueShowPublications', v_due_show_publications,
      'dueNotices', v_due_notices,
      'dueEntryPublications', v_due_entry_publications,
      'futureScheduled', v_future_scheduled
    ),
    'expired_deadlines', jsonb_build_object(
      'pass', (v_overdue_reminders + v_expired_confirmation_rounds) = 0,
      'critical', false,
      'detail', format('%s overdue Organizer reminder(s); %s confirmation round(s) still open after close time.', v_overdue_reminders, v_expired_confirmation_rounds),
      'overdueReminders', v_overdue_reminders,
      'expiredConfirmationRounds', v_expired_confirmation_rounds
    ),
    'replacement_communication_requirements', jsonb_build_object(
      'pass', v_due_notices = 0,
      'critical', false,
      'detail', format('%s scheduled communication(s) are overdue and may require rescheduling or replacement. %s required acknowledgement(s) remain outstanding.', v_due_notices, v_unacked_required),
      'overdueScheduledNotices', v_due_notices,
      'outstandingRequiredAcknowledgements', v_unacked_required
    )
  );

  select coalesce(array_agg(check_row.key order by check_row.key), '{}'::text[])
  into v_critical_failures
  from jsonb_each(v_checks) check_row
  where coalesce((check_row.value ->> 'critical')::boolean, false)
    and not coalesce((check_row.value ->> 'pass')::boolean, false);

  v_ready := cardinality(v_critical_failures) = 0;

  return jsonb_build_object(
    'currentMode', v_state.mode,
    'targetMode', v_target,
    'platformVersion', v_state.version,
    'ready', v_ready,
    'criticalFailures', to_jsonb(v_critical_failures),
    'checks', v_checks,
    'generatedAt', now()
  );
end
$preflight$;

revoke all on function public.studio2_platform_exit_database_preflight(text)
  from public, anon;
grant execute on function public.studio2_platform_exit_database_preflight(text)
  to authenticated, service_role;

create or replace function public.studio2_record_platform_exit_preflight(
  p_actor_id uuid,
  p_target_mode text,
  p_database_checks jsonb,
  p_external_checks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $record$
declare
  v_state public.studio2_platform_operational_state;
  v_target text := lower(btrim(coalesce(p_target_mode, '')));
  v_checks jsonb := coalesce(p_database_checks -> 'checks', '{}'::jsonb);
  v_confirmation_pass boolean;
  v_voting_pass boolean;
  v_storage_pass boolean;
  v_critical_failures text[];
  v_ready boolean;
  v_row public.studio2_platform_exit_preflights;
begin
  if not private.studio2_user_has_capability(p_actor_id, 'maintenance.manage', null) then
    raise exception 'Organizer maintenance capability required' using errcode = '42501';
  end if;

  select *
  into v_state
  from public.studio2_platform_operational_state
  where singleton = true
  for update;

  if not private.studio2_platform_exit_transition(v_state.mode, v_target) then
    raise exception 'Platform exit preflight no longer matches a valid recovery transition'
      using errcode = '23514';
  end if;

  if coalesce((p_database_checks ->> 'platformVersion')::bigint, -1) <> v_state.version
     or p_database_checks ->> 'currentMode' <> v_state.mode
     or p_database_checks ->> 'targetMode' <> v_target then
    raise exception 'Platform state changed while exit preflight was running'
      using errcode = '40001';
  end if;

  v_confirmation_pass :=
    coalesce((v_checks #>> '{confirmation_sync,pass}')::boolean, false)
    and coalesce((p_external_checks ->> 'confirmationHealthy')::boolean, false);
  v_voting_pass :=
    coalesce((v_checks #>> '{voting_health,pass}')::boolean, false)
    and coalesce((p_external_checks ->> 'votingHealthy')::boolean, false);
  v_storage_pass :=
    coalesce((v_checks #>> '{storage,pass}')::boolean, false)
    and coalesce((p_external_checks ->> 'storageHealthy')::boolean, false);

  v_checks := jsonb_set(v_checks, '{confirmation_sync,pass}', to_jsonb(v_confirmation_pass), false);
  v_checks := jsonb_set(
    v_checks,
    '{confirmation_sync,external}',
    coalesce(p_external_checks -> 'confirmation', '{}'::jsonb),
    true
  );
  v_checks := jsonb_set(v_checks, '{voting_health,pass}', to_jsonb(v_voting_pass), false);
  v_checks := jsonb_set(v_checks, '{voting_health,runtimeAttested}', 'true'::jsonb, true);
  v_checks := jsonb_set(
    v_checks,
    '{voting_health,external}',
    coalesce(p_external_checks -> 'voting', '{}'::jsonb),
    true
  );
  v_checks := jsonb_set(v_checks, '{storage,pass}', to_jsonb(v_storage_pass), false);
  v_checks := jsonb_set(v_checks, '{storage,runtimeAttested}', 'true'::jsonb, true);
  v_checks := jsonb_set(
    v_checks,
    '{storage,external}',
    coalesce(p_external_checks -> 'storage', '{}'::jsonb),
    true
  );

  select coalesce(array_agg(check_row.key order by check_row.key), '{}'::text[])
  into v_critical_failures
  from jsonb_each(v_checks) check_row
  where coalesce((check_row.value ->> 'critical')::boolean, false)
    and not coalesce((check_row.value ->> 'pass')::boolean, false);

  v_ready := cardinality(v_critical_failures) = 0;

  insert into public.studio2_platform_exit_preflights (
    actor_id,
    from_mode,
    target_mode,
    platform_version,
    checks,
    critical_failures,
    ready
  )
  values (
    p_actor_id,
    v_state.mode,
    v_target,
    v_state.version,
    v_checks,
    v_critical_failures,
    v_ready
  )
  returning * into v_row;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    p_actor_id,
    'platform_exit_preflight_run',
    'studio2_platform_exit_preflights',
    v_row.id::text,
    jsonb_build_object(
      'mode', v_row.from_mode,
      'version', v_row.platform_version
    ),
    jsonb_build_object(
      'targetMode', v_row.target_mode,
      'ready', v_row.ready,
      'criticalFailures', to_jsonb(v_row.critical_failures),
      'expiresAt', v_row.expires_at,
      'checks', v_row.checks
    )
  );

  return jsonb_build_object(
    'id', v_row.id,
    'currentMode', v_row.from_mode,
    'targetMode', v_row.target_mode,
    'platformVersion', v_row.platform_version,
    'ready', v_row.ready,
    'criticalFailures', to_jsonb(v_row.critical_failures),
    'checks', v_row.checks,
    'createdAt', v_row.created_at,
    'expiresAt', v_row.expires_at
  );
end
$record$;

revoke all on function public.studio2_record_platform_exit_preflight(uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.studio2_record_platform_exit_preflight(uuid, text, jsonb, jsonb)
  to service_role;

drop function if exists public.studio2_apply_platform_mode_change(
  text, text, text[], text, text, uuid, text, bigint
);

create function public.studio2_apply_platform_mode_change(
  p_target_mode text,
  p_reason text,
  p_affected_services text[],
  p_message text,
  p_incident_reference text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint,
  p_exit_preflight_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_actor uuid := auth.uid();
  v_state public.studio2_platform_operational_state;
  v_existing public.studio2_operation_receipts;
  v_preflight public.studio2_platform_exit_preflights;
  v_db_recheck jsonb;
  v_target text := lower(btrim(coalesce(p_target_mode, '')));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_before_mode text;
  v_exit_required boolean := false;
  v_risk text;
  v_claim jsonb;
  v_operation_id uuid;
  v_auth_evidence jsonb;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('maintenance.manage', null, false) then
    raise exception 'Missing Solaris capability: maintenance.manage' using errcode = '42501';
  end if;

  perform set_config('studio2.platform_recovery_write', 'on', true);

  if v_reason is null or length(v_reason) < 5 then
    raise exception 'A platform mode change reason of at least 5 characters is required'
      using errcode = '22023';
  end if;

  select receipt.*
  into v_existing
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
    and receipt.actor_id = v_actor
    and receipt.command = 'system.platform_mode.change'
    and receipt.idempotency_key = nullif(btrim(coalesce(p_idempotency_key, '')), '')
    and receipt.status = 'succeeded'
  limit 1;

  if v_existing.operation_id is not null then
    return v_existing.result;
  end if;

  select *
  into v_state
  from public.studio2_platform_operational_state
  where singleton = true
  for update;

  if v_state.version is distinct from p_expected_version then
    raise exception 'Platform operating mode changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  v_before_mode := v_state.mode;

  if not private.studio2_platform_mode_transition_allowed(v_state.mode, v_target) then
    raise exception 'Invalid platform mode transition: % -> %', v_state.mode, v_target
      using errcode = '23514';
  end if;

  if v_state.mode = v_target then
    return jsonb_build_object(
      'ok', true,
      'alreadyApplied', true,
      'mode', v_state.mode,
      'version', v_state.version
    );
  end if;

  v_exit_required := private.studio2_platform_exit_transition(v_state.mode, v_target);

  if v_exit_required then
    if p_exit_preflight_id is null then
      raise exception 'A recent successful maintenance exit preflight is required'
        using errcode = '23514';
    end if;

    select *
    into v_preflight
    from public.studio2_platform_exit_preflights preflight
    where preflight.id = p_exit_preflight_id
      and preflight.actor_id = v_actor
    for update;

    if v_preflight.id is null
       or not v_preflight.ready
       or cardinality(v_preflight.critical_failures) > 0
       or v_preflight.consumed_at is not null
       or v_preflight.expires_at <= now()
       or v_preflight.from_mode <> v_state.mode
       or v_preflight.target_mode <> v_target
       or v_preflight.platform_version <> v_state.version then
      raise exception 'Maintenance exit preflight is missing, stale, blocked or already consumed'
        using errcode = '23514';
    end if;

    v_db_recheck := public.studio2_platform_exit_database_preflight(v_target);
    if not coalesce((v_db_recheck ->> 'ready')::boolean, false) then
      raise exception 'Maintenance exit database checks changed after preflight. Run the preflight again.'
        using errcode = '23514',
              detail = coalesce((v_db_recheck -> 'criticalFailures')::text, '[]');
    end if;
  elsif p_exit_preflight_id is not null then
    raise exception 'Exit preflight receipt was supplied for a transition that does not use one'
      using errcode = '22023';
  end if;

  v_risk := case
    when v_state.mode in ('read_only', 'maintenance')
      or v_target in ('read_only', 'maintenance')
    then 'R3'
    else 'R2'
  end;

  if v_risk = 'R3' then
    v_auth_evidence := private.studio2_require_fresh_auth(300);
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'system.platform_mode.change',
    v_risk,
    jsonb_build_object(
      'fromMode', v_state.mode,
      'toMode', v_target,
      'expectedVersion', p_expected_version,
      'exitPreflightId', p_exit_preflight_id
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  update public.studio2_platform_operational_state
  set
    mode = v_target,
    version = version + 1,
    affected_services = coalesce(p_affected_services, '{}'::text[]),
    message = nullif(btrim(coalesce(p_message, '')), ''),
    incident_reference = nullif(btrim(coalesce(p_incident_reference, '')), ''),
    reason = v_reason,
    changed_by = v_actor,
    changed_at = now()
  where singleton = true
  returning * into v_state;

  if v_exit_required then
    update public.studio2_platform_exit_preflights
    set consumed_at = now()
    where id = v_preflight.id;
  end if;

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  )
  values (
    v_actor,
    'platform_operational_mode_changed',
    'studio2_platform_operational_state',
    'platform',
    jsonb_build_object(
      'fromMode', v_before_mode,
      'expectedVersion', p_expected_version,
      'exitPreflightId', p_exit_preflight_id
    ),
    jsonb_build_object(
      'mode', v_state.mode,
      'version', v_state.version,
      'affectedServices', to_jsonb(v_state.affected_services),
      'message', v_state.message,
      'incidentReference', v_state.incident_reference,
      'reason', v_state.reason,
      'exitPreflightId', p_exit_preflight_id
    )
  );

  if v_auth_evidence is not null then
    update public.studio2_operation_receipts
    set
      actor_session_id = v_auth_evidence ->> 'sessionId',
      auth_freshness_evidence = v_auth_evidence,
      updated_at = now()
    where operation_id = v_operation_id
      and actor_id = v_actor;
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'alreadyApplied', false,
    'mode', v_state.mode,
    'version', v_state.version,
    'affectedServices', to_jsonb(v_state.affected_services),
    'message', v_state.message,
    'incidentReference', v_state.incident_reference,
    'changedAt', v_state.changed_at,
    'operationId', v_operation_id,
    'exitPreflightId', p_exit_preflight_id
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_platform_mode_change(
  text, text, text[], text, text, uuid, text, bigint, uuid
) from public, anon;
grant execute on function public.studio2_apply_platform_mode_change(
  text, text, text[], text, text, uuid, text, bigint, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
