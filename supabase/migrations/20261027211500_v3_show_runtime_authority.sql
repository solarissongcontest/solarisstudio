begin;

-- V3 live-show runtime authority.
--
-- Canonical operational state is broadcast_config.showMode. The legacy
-- shows.status column is not used as a second live-state authority. This
-- command owns phase transitions and companion metadata with optimistic CAS,
-- durable idempotency, atomic show.changed persistence and lost-response
-- readback through the shared operation receipt.

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
      and receipt.command = 'show.runtime.change'
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
begin
  if coalesce(new.broadcast_config, '{}'::jsonb) -> 'showMode'
       is not distinct from
     coalesce(old.broadcast_config, '{}'::jsonb) -> 'showMode' then
    return new;
  end if;

  if not private.v3_show_runtime_operation_is_current(v_marker) then
    raise exception using
      errcode = '42501',
      message = 'SHOW_RUNTIME_AUTHORITY',
      hint = 'Mutate canonical live-show state through v3_apply_show_runtime_change.';
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_show_runtime_authority()
  from public, anon, authenticated, service_role;

drop trigger if exists v3_guard_show_runtime_authority on public.shows;
create trigger v3_guard_show_runtime_authority
before update of broadcast_config on public.shows
for each row execute function private.v3_guard_show_runtime_authority();

create or replace function public.v3_apply_show_runtime_change(
  p_show_id uuid,
  p_expected_revision integer,
  p_phase text,
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
  v_current_revision integer;
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
  if p_phase not in ('scheduled', 'live', 'results_in_progress', 'ended') then
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

  v_config := coalesce(v_show.broadcast_config, '{}'::jsonb);
  v_current := coalesce(v_config -> 'showMode', '{}'::jsonb);
  v_current_phase := case
    when v_current ->> 'phase' in ('scheduled', 'live', 'results_in_progress', 'ended')
      then v_current ->> 'phase'
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

  -- Metadata may be edited without changing phase, but phase progression itself
  -- is one-way. A show can end directly from live when it has no results segment.
  if p_phase <> v_current_phase and not (
    (v_current_phase = 'scheduled' and p_phase = 'live')
    or (v_current_phase = 'live' and p_phase in ('results_in_progress', 'ended'))
    or (v_current_phase = 'results_in_progress' and p_phase = 'ended')
  ) then
    raise exception using
      errcode = '55000',
      message = 'ILLEGAL_SHOW_TRANSITION',
      detail = format('%s -> %s', v_current_phase, p_phase);
  end if;

  begin
    v_live_started_at := nullif(v_current ->> 'liveStartedAt', '')::timestamptz;
    v_results_started_at := nullif(v_current ->> 'resultsStartedAt', '')::timestamptz;
    v_ended_at := nullif(v_current ->> 'endedAt', '')::timestamptz;
  exception when invalid_datetime_format then
    raise exception using errcode = '23514', message = 'INVALID_SHOW_RUNTIME_TIMESTAMP';
  end;

  if p_phase = 'scheduled' then
    v_live_started_at := null;
    v_results_started_at := null;
    v_ended_at := null;
  elsif p_phase = 'live' then
    v_live_started_at := coalesce(v_live_started_at, now());
    v_results_started_at := null;
    v_ended_at := null;
  elsif p_phase = 'results_in_progress' then
    v_live_started_at := coalesce(v_live_started_at, now());
    v_results_started_at := coalesce(v_results_started_at, now());
    v_ended_at := null;
  else
    v_live_started_at := coalesce(v_live_started_at, now());
    v_ended_at := coalesce(v_ended_at, now());
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'show.runtime.change',
    'R2',
    jsonb_build_object('editionId', v_show.edition_id, 'showId', v_show.id),
    jsonb_build_object(
      'expectedRevision', p_expected_revision,
      'fromPhase', v_current_phase,
      'phase', p_phase,
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
    'phase', p_phase,
    'scheduledStart', p_scheduled_start,
    'youtubeUrl', v_youtube_url,
    'televoteRoundId', v_televote_round_id,
    'liveStartedAt', v_live_started_at,
    'resultsStartedAt', v_results_started_at,
    'endedAt', v_ended_at
  );

  perform set_config('app.v3_show_runtime_operation_id', p_operation_id::text, true);

  update public.shows
  set broadcast_config = jsonb_set(v_config, '{showMode}', v_next, true)
  where id = v_show.id;

  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'showId', v_show.id,
    'editionId', v_show.edition_id,
    'revision', v_next_revision,
    'previousPhase', v_current_phase,
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
      'changeKind', case when p_phase = v_current_phase then 'runtime_metadata_updated' else 'runtime_transitioned' end,
      'previousPhase', v_current_phase,
      'phase', p_phase,
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

revoke all on function public.v3_apply_show_runtime_change(uuid, integer, text, timestamptz, text, text, text, uuid, text)
  from public, anon, service_role;
grant execute on function public.v3_apply_show_runtime_change(uuid, integer, text, timestamptz, text, text, text, uuid, text)
  to authenticated;

comment on function public.v3_apply_show_runtime_change(uuid, integer, text, timestamptz, text, text, text, uuid, text) is
  'Canonical V3 live-show runtime command. Enforces scoped authorization, one-way phase transitions, CAS, idempotency, atomic show.changed persistence and receipt readback.';

notify pgrst, 'reload schema';
commit;
