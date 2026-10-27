begin;

-- Lost-response recovery must consult stable operation identity before checking
-- state that the first attempt may already have advanced/deleted. Otherwise a
-- legitimate retry can incorrectly surface STATE_CHANGED/SHOW_NOT_FOUND after
-- the original transaction succeeded. Claim first; then lock/CAS/mutate.

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

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    p_operation_id,
    'show.transition',
    'R2',
    jsonb_build_object('showId', p_show_id),
    jsonb_build_object(
      'expectedStatus', p_expected_status,
      'expectedRevision', p_expected_revision,
      'targetState', p_target_state,
      'scheduledStart', p_scheduled_start,
      'youtubeUrl', v_youtube_url,
      'televoteRoundId', v_televote_round_id,
      'reason', v_reason
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then return v_claim -> 'result'; end if;
    raise exception using errcode = '55000', message = 'OPERATION_IN_PROGRESS';
  end if;

  select show_row.*
  into v_show
  from public.shows show_row
  where show_row.id = p_show_id
  for update;

  if v_show.id is null then raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND'; end if;
  if v_actor is null then raise exception using errcode = '42501', message = 'AUTHENTICATION'; end if;
  if not private.studio2_can_manage_broadcast(v_actor, v_show.edition_id) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if v_show.status <> p_expected_status then
    raise exception using errcode = '40001', message = 'STATE_CHANGED';
  end if;

  v_config := coalesce(v_show.broadcast_config, '{}'::jsonb);
  v_current := coalesce(v_config -> 'showMode', '{}'::jsonb);
  v_current_phase := case
    when v_current ->> 'phase' in ('scheduled','live','results_in_progress','ended') then v_current ->> 'phase'
    when v_show.status in ('live','paused') then 'live'
    when v_show.status in ('ended','cancelled') then 'ended'
    else 'scheduled'
  end;
  begin
    v_current_revision := coalesce((v_current ->> 'revision')::integer, 0);
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode = '23514', message = 'INVALID_SHOW_RUNTIME_REVISION';
  end;
  if v_current_revision < 0 then raise exception using errcode = '23514', message = 'INVALID_SHOW_RUNTIME_REVISION'; end if;
  if v_current_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'STATE_CHANGED';
  end if;

  v_current_state := case
    when v_show.status = 'live' and v_current_phase = 'results_in_progress' then 'results_in_progress'
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
    raise exception using errcode = '55000', message = 'ILLEGAL_SHOW_TRANSITION', detail = format('%s -> %s', v_current_state, p_target_state);
  end if;

  v_next_status := case p_target_state when 'results_in_progress' then 'live' else p_target_state end;
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
    v_live_started_at := null; v_results_started_at := null; v_ended_at := null;
  elsif p_target_state in ('live','paused') then
    v_live_started_at := coalesce(v_live_started_at, now()); v_results_started_at := null; v_ended_at := null;
  elsif p_target_state = 'results_in_progress' then
    v_live_started_at := coalesce(v_live_started_at, now()); v_results_started_at := coalesce(v_results_started_at, now()); v_ended_at := null;
  elsif p_target_state = 'ended' then
    v_live_started_at := coalesce(v_live_started_at, now()); v_ended_at := coalesce(v_ended_at, now());
  else
    v_ended_at := coalesce(v_ended_at, now());
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
  set status = v_next_status,
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
    'show.changed', 'show_runtime', v_show.id::text, v_next_revision,
    p_operation_id, v_show.edition_id, v_show.id,
    jsonb_build_object(
      'changeKind', case when p_target_state = v_current_state then 'runtime_metadata_updated' else 'lifecycle_transitioned' end,
      'previousState', v_current_state,
      'state', p_target_state,
      'lifecycleStatus', v_next_status,
      'revision', v_next_revision,
      'reason', v_reason
    ),
    1, array[]::text[]
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result;
end
$command$;

create or replace function public.v3_update_show_definition(
  p_show_id uuid,
  p_expected_name text,
  p_expected_kind text,
  p_expected_sort_order integer,
  p_name text,
  p_kind text,
  p_sort_order integer,
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
  v_actor uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if p_show_id is null or length(v_name) not between 1 and 160
     or p_kind not in ('heat','semi-final','second-chance','grand-final','special','other')
     or p_sort_order is null or p_sort_order < 1 or length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, p_operation_id,
    'show.definition.update', 'R2',
    jsonb_build_object('showId', p_show_id),
    jsonb_build_object(
      'expectedName', p_expected_name,
      'expectedKind', p_expected_kind,
      'expectedSortOrder', p_expected_sort_order,
      'name', v_name,
      'kind', p_kind,
      'sortOrder', p_sort_order,
      'reason', v_reason
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then return v_claim -> 'result'; end if;
    raise exception using errcode = '55000', message = 'OPERATION_IN_PROGRESS';
  end if;

  select * into v_show from public.shows where id = p_show_id for update;
  if v_show.id is null then raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND'; end if;
  v_actor := private.v3_require_show_definition_manager(v_show.edition_id);
  if v_show.name is distinct from p_expected_name
     or v_show.kind is distinct from p_expected_kind
     or v_show.sort_order is distinct from p_expected_sort_order then
    raise exception using errcode = '40001', message = 'STATE_CHANGED';
  end if;

  update public.shows set name = v_name, kind = p_kind, sort_order = p_sort_order
  where id = v_show.id returning * into v_show;
  v_version := txid_current();
  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'show', jsonb_build_object(
      'id', v_show.id, 'editionId', v_show.edition_id,
      'name', v_show.name, 'kind', v_show.kind, 'sortOrder', v_show.sort_order
    )
  );
  perform private.v3_emit_domain_event(
    'show.changed', 'show_definition', v_show.id::text, v_version,
    p_operation_id, v_show.edition_id, null,
    jsonb_build_object(
      'changeKind', 'show_definition_updated',
      'name', v_show.name, 'kind', v_show.kind, 'sortOrder', v_show.sort_order,
      'reason', v_reason
    ),
    1, array[]::text[]
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result;
end
$command$;

create or replace function public.v3_delete_show(
  p_show_id uuid,
  p_expected_name text,
  p_expected_kind text,
  p_expected_sort_order integer,
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
  v_actor uuid;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_result jsonb;
  v_version bigint;
begin
  if p_show_id is null or length(v_reason) < 5 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, p_operation_id,
    'show.delete', 'R3',
    jsonb_build_object('showId', p_show_id),
    jsonb_build_object(
      'expectedName', p_expected_name,
      'expectedKind', p_expected_kind,
      'expectedSortOrder', p_expected_sort_order,
      'reason', v_reason
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then return v_claim -> 'result'; end if;
    raise exception using errcode = '55000', message = 'OPERATION_IN_PROGRESS';
  end if;

  select * into v_show from public.shows where id = p_show_id for update;
  if v_show.id is null then raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND'; end if;
  v_actor := private.v3_require_show_definition_manager(v_show.edition_id);
  if v_show.name is distinct from p_expected_name
     or v_show.kind is distinct from p_expected_kind
     or v_show.sort_order is distinct from p_expected_sort_order then
    raise exception using errcode = '40001', message = 'STATE_CHANGED';
  end if;
  if v_show.published
     or exists (select 1 from public.participants where show_id = v_show.id)
     or exists (select 1 from public.results where show_id = v_show.id)
     or exists (select 1 from public.jury_votes where show_id = v_show.id)
     or exists (select 1 from public.televote_votes where show_id = v_show.id)
     or exists (select 1 from public.studio2_show_publication_executions where show_id = v_show.id)
     or exists (select 1 from private.v3_domain_events where show_id = v_show.id) then
    raise exception using
      errcode = '55000',
      message = 'SHOW_HAS_DURABLE_HISTORY',
      hint = 'Retain the show and use its lifecycle/publication controls instead of deleting official history.';
  end if;

  v_version := txid_current();
  v_result := jsonb_build_object(
    'operationId', p_operation_id,
    'showId', v_show.id,
    'editionId', v_show.edition_id,
    'deleted', true
  );
  delete from public.shows where id = v_show.id;
  perform private.v3_emit_domain_event(
    'show.changed', 'show_definition', v_show.id::text, v_version,
    p_operation_id, v_show.edition_id, null,
    jsonb_build_object(
      'changeKind', 'show_deleted',
      'name', v_show.name, 'kind', v_show.kind, 'sortOrder', v_show.sort_order,
      'reason', v_reason
    ),
    1, array[]::text[]
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result;
end
$command$;

notify pgrst, 'reload schema';
commit;
