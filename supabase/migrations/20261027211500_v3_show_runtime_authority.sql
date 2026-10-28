begin;

select public.v3_register_migration_contract(
  'v3.show.runtime-authority', 1, 'forward_fix_only', false, null,
  'Normalize known lifecycle aliases, reject unknown state, then constrain and govern show runtime with scoped CAS, receipts and synchronous audit. Validate clean replay and current-main upgrade before adoption.'
);

-- V3 live-show runtime authority.
--
-- Canonical show lifecycle is public.shows.status and uses the V3 vocabulary:
-- scheduled, preparing, delayed, live, paused, ended, cancelled.
-- broadcast_config.showMode is companion/reveal metadata only. In particular,
-- results_in_progress is a live-show subphase, not a second lifecycle truth.
-- The governed command below advances both representations atomically.

-- Normalize the historical free-text vocabulary before constraining it. Current
-- production rows are all `draft`, but migration replay and older snapshots may
-- contain the aliases below.
update public.shows
set status = case lower(btrim(status))
  when 'draft' then 'scheduled'
  when 'scheduled' then 'scheduled'
  when 'upcoming' then 'scheduled'
  when 'planned' then 'scheduled'
  when 'planning' then 'scheduled'
  when 'announced' then 'scheduled'
  when 'ready' then 'preparing'
  when 'preparing' then 'preparing'
  when 'rehearsal' then 'preparing'
  when 'rehearsals' then 'preparing'
  when 'delayed' then 'delayed'
  when 'live' then 'live'
  when 'on_air' then 'live'
  when 'on-air' then 'live'
  when 'active' then 'live'
  when 'open' then 'live'
  when 'in_progress' then 'live'
  when 'in-progress' then 'live'
  when 'paused' then 'paused'
  when 'hold' then 'paused'
  when 'held' then 'paused'
  when 'ended' then 'ended'
  when 'complete' then 'ended'
  when 'completed' then 'ended'
  when 'finished' then 'ended'
  when 'closed' then 'ended'
  when 'cancelled' then 'cancelled'
  when 'canceled' then 'cancelled'
  else status
end;

do $validate_show_lifecycle$
declare
  v_unknown text;
begin
  select string_agg(distinct status, ', ' order by status)
  into v_unknown
  from public.shows
  where status not in ('scheduled','preparing','delayed','live','paused','ended','cancelled');

  if v_unknown is not null then
    raise exception using
      errcode = '23514',
      message = 'UNKNOWN_SHOW_LIFECYCLE_STATE',
      detail = v_unknown,
      hint = 'Map every historical shows.status value before enabling the V3 lifecycle constraint.';
  end if;
end
$validate_show_lifecycle$;

alter table public.shows alter column status set default 'scheduled';
alter table public.shows drop constraint if exists shows_v3_lifecycle_status_check;
alter table public.shows add constraint shows_v3_lifecycle_status_check
  check (status in ('scheduled','preparing','delayed','live','paused','ended','cancelled'));

create or replace function private.v3_show_runtime_operation_is_current(
  p_operation_id text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $authority$
  select exists (
    select 1
    from public.studio2_operation_receipts receipt
    where receipt.operation_id::text = nullif(btrim(coalesce(p_operation_id, '')), '')
      and receipt.actor_id = auth.uid()
      and receipt.status = 'processing'
      and receipt.command = 'show.transition'
  );
$authority$;

revoke all on function private.v3_show_runtime_operation_is_current(text)
  from public, anon, authenticated, service_role;

create or replace function private.v3_guard_show_runtime_authority()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $guard$
declare
  v_marker text := current_setting('app.v3_show_runtime_operation_id', true);
  v_lifecycle_changed boolean := new.status is distinct from old.status;
  v_companion_changed boolean :=
    coalesce(new.broadcast_config, '{}'::jsonb) -> 'showMode'
      is distinct from
    coalesce(old.broadcast_config, '{}'::jsonb) -> 'showMode';
begin
  if not v_lifecycle_changed and not v_companion_changed then
    return new;
  end if;

  if not private.v3_show_runtime_operation_is_current(v_marker) then
    raise exception using
      errcode = '42501',
      message = 'SHOW_RUNTIME_AUTHORITY',
      hint = 'Mutate canonical show lifecycle/runtime through v3_apply_show_runtime_change.';
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_show_runtime_authority()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_guard_show_runtime_authority on public.shows;
create trigger v3_guard_show_runtime_authority
before update of status, broadcast_config on public.shows
for each row execute function private.v3_guard_show_runtime_authority();

create or replace function public.v3_apply_show_runtime_change(
  p_show_id uuid,
  p_expected_status text,
  p_expected_revision integer,
  p_target_state text,
  p_scheduled_start timestamptz,
  p_youtube_url text,
  p_televote_round_id text,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $command$
declare
  v_actor uuid := auth.uid();
  v_show public.shows%rowtype;
  v_config jsonb;
  v_current jsonb;
  v_current_phase text;
  v_current_state text;
  v_current_revision integer;
  v_next_status text;
  v_next_phase text;
  v_next_revision integer;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_youtube_url text := btrim(coalesce(p_youtube_url, ''));
  v_televote_round_id text := nullif(btrim(coalesce(p_televote_round_id, '')), '');
  v_live_started_at timestamptz;
  v_results_started_at timestamptz;
  v_ended_at timestamptz;
  v_next jsonb;
  v_claim jsonb;
  v_result jsonb;
begin
  if p_show_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_expected_status not in ('scheduled','preparing','delayed','live','paused','ended','cancelled') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_target_state not in (
    'scheduled','preparing','delayed','live','paused','results_in_progress','ended','cancelled'
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if length(v_youtube_url) > 2048 or (v_youtube_url <> '' and v_youtube_url !~ '^https://') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id
  for update;

  if v_show.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not private.studio2_can_manage_broadcast(v_actor, v_show.edition_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_show.status <> p_expected_status then
    raise exception using errcode = '40001', message = 'STATE_CHANGED';
  end if;

  v_config := coalesce(v_show.broadcast_config, '{}'::jsonb);
  v_current := coalesce(v_config -> 'showMode', '{}'::jsonb);
  v_current_phase := case
    when v_current ->> 'phase' in ('scheduled', 'live', 'results_in_progress', 'ended')
      then v_current ->> 'phase'
    when v_show.status in ('live','paused') then 'live'
    when v_show.status in ('ended','cancelled') then 'ended'
    else 'scheduled'
  end;

  begin
    v_current_revision := coalesce((v_current ->> 'revision')::integer, 0);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '23514', message = 'INVALID_SHOW_RUNTIME_REVISION';
  end;
  if v_current_revision < 0 then
    raise exception using errcode = '23514', message = 'INVALID_SHOW_RUNTIME_REVISION';
  end if;
  if v_current_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'STATE_CHANGED';
  end if;

  v_current_state := case
    when v_show.status = 'live' and v_current_phase = 'results_in_progress'
      then 'results_in_progress'
    else v_show.status
  end;

  if p_target_state <> v_current_state and not (
    (v_current_state = 'scheduled' and p_target_state in ('preparing','delayed','live','cancelled'))
    or (v_current_state = 'preparing' and p_target_state in ('scheduled','delayed','live','cancelled'))
    or (v_current_state = 'delayed' and p_target_state in ('scheduled','preparing','live','cancelled'))
    or (v_current_state = 'live' and p_target_state in ('paused','results_in_progress','ended','cancelled'))
    or (v_current_state = 'paused' and p_target_state in ('live','ended','cancelled'))
    or (v_current_state = 'results_in_progress' and p_target_state in ('ended','cancelled'))
  ) then
    raise exception using
      errcode = '55000',
      message = 'ILLEGAL_SHOW_TRANSITION',
      detail = format('%s -> %s', v_current_state, p_target_state);
  end if;

  v_next_status := case p_target_state
    when 'results_in_progress' then 'live'
    else p_target_state
  end;
  v_next_phase := case
    when p_target_state in ('scheduled','preparing','delayed') then 'scheduled'
    when p_target_state in ('live','paused') then 'live'
    when p_target_state = 'results_in_progress' then 'results_in_progress'
    else 'ended'
  end;

  begin
    v_live_started_at := nullif(v_current ->> 'liveStartedAt', '')::timestamptz;
    v_results_started_at := nullif(v_current ->> 'resultsStartedAt', '')::timestamptz;
    v_ended_at := nullif(v_current ->> 'endedAt', '')::timestamptz;
  exception when invalid_datetime_format then
    raise exception using errcode = '23514', message = 'INVALID_SHOW_RUNTIME_TIMESTAMP';
  end;

  if p_target_state in ('scheduled','preparing','delayed') then
    v_live_started_at := null;
    v_results_started_at := null;
    v_ended_at := null;
  elsif p_target_state in ('live','paused') then
    v_live_started_at := coalesce(v_live_started_at, now());
    v_results_started_at := null;
    v_ended_at := null;
  elsif p_target_state = 'results_in_progress' then
    v_live_started_at := coalesce(v_live_started_at, now());
    v_results_started_at := coalesce(v_results_started_at, now());
    v_ended_at := null;
  elsif p_target_state = 'ended' then
    v_live_started_at := coalesce(v_live_started_at, now());
    v_ended_at := coalesce(v_ended_at, now());
  else
    -- Cancellation may occur before air; do not fabricate a live-start time.
    v_ended_at := coalesce(v_ended_at, now());
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'show.transition',
    'R2',
    jsonb_build_object('editionId', v_show.edition_id, 'showId', v_show.id),
    jsonb_build_object(
      'expectedStatus', p_expected_status,
      'expectedRevision', p_expected_revision,
      'fromState', v_current_state,
      'targetState', p_target_state,
      'scheduledStart', p_scheduled_start,
      'youtubeUrl', v_youtube_url,
      'televoteRoundId', v_televote_round_id,
      'reason', v_reason
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return v_claim -> 'result';
    end if;
    raise exception using errcode = '55000', message = 'OPERATION_IN_PROGRESS';
  end if;

  v_next_revision := v_current_revision + 1;
  v_next := jsonb_build_object(
    'revision', v_next_revision,
    'phase', v_next_phase,
    'scheduledStart', p_scheduled_start,
    'youtubeUrl', v_youtube_url,
    'televoteRoundId', v_televote_round_id,
    'liveStartedAt', v_live_started_at,
    'resultsStartedAt', v_results_started_at,
    'endedAt', v_ended_at
  );

  perform set_config('app.v3_show_runtime_operation_id', p_operation_id::text, true);

  update public.shows
  set
    status = v_next_status,
    broadcast_config = jsonb_set(v_config, '{showMode}', v_next, true)
  where id = v_show.id;

  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'showId', v_show.id,
    'editionId', v_show.edition_id,
    'revision', v_next_revision,
    'previousState', v_current_state,
    'state', p_target_state,
    'lifecycleStatus', v_next_status,
    'runtime', v_next
  );

  perform private.v3_emit_domain_event(
    'show.changed',
    'show_runtime',
    v_show.id::text,
    v_next_revision,
    p_operation_id,
    v_show.edition_id,
    v_show.id,
    jsonb_build_object(
      'changeKind', case when p_target_state = v_current_state then 'runtime_metadata_updated' else 'lifecycle_transitioned' end,
      'previousState', v_current_state,
      'state', p_target_state,
      'lifecycleStatus', v_next_status,
      'revision', v_next_revision,
      'reason', v_reason
    ),
    1,
    array[]::text[]
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result;
end
$command$;

revoke all on function public.v3_apply_show_runtime_change(uuid,text,integer,text,timestamptz,text,text,text,uuid,text)
  from public, anon, service_role;
grant execute on function public.v3_apply_show_runtime_change(uuid,text,integer,text,timestamptz,text,text,text,uuid,text)
  to authenticated;

comment on function public.v3_apply_show_runtime_change(uuid,text,integer,text,timestamptz,text,text,text,uuid,text) is
  'Canonical V3 show lifecycle/runtime command. shows.status owns lifecycle; showMode owns companion/reveal metadata. Enforces scope, legal transitions, CAS, idempotency, atomic show.changed persistence and receipt readback.';

notify pgrst, 'reload schema';
commit;
