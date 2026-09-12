begin;

create or replace function private.studio2_can_manage_broadcast(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    coalesce(public.has_role(p_user_id, 'organizer'::public.app_role), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'edition.manage', p_edition_id), false);
$$;

revoke all on function private.studio2_can_manage_broadcast(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_can_manage_broadcast(uuid, uuid)
  to service_role;

create or replace function private.studio2_validate_rundown_segments(p_segments jsonb)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_count integer;
  v_distinct_count integer;
begin
  if p_segments is null or jsonb_typeof(p_segments) <> 'array' then
    raise exception 'Rundown segments must be a JSON array' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_segments) segment
    where jsonb_typeof(segment) <> 'object'
       or nullif(btrim(segment ->> 'id'), '') is null
       or nullif(btrim(segment ->> 'label'), '') is null
       or coalesce((segment ->> 'plannedDurationSeconds') ~ '^[0-9]+$', false) = false
       or (segment ->> 'plannedDurationSeconds')::integer <= 0
       or coalesce(segment ->> 'status', '') not in ('planned', 'ready', 'live', 'completed', 'skipped')
  ) then
    raise exception 'Every rundown segment requires id, label, positive integer duration and valid status' using errcode = '22023';
  end if;

  select count(*), count(distinct segment ->> 'id')
    into v_count, v_distinct_count
  from jsonb_array_elements(p_segments) segment;

  if v_count <> v_distinct_count then
    raise exception 'Rundown segment ids must be unique' using errcode = '22023';
  end if;

  if (
    select count(*)
    from jsonb_array_elements(p_segments) segment
    where segment ->> 'status' = 'live'
  ) > 1 then
    raise exception 'Only one rundown segment can be live at a time' using errcode = '22023';
  end if;
end
$$;

revoke all on function private.studio2_validate_rundown_segments(jsonb)
  from public, anon, authenticated;
grant execute on function private.studio2_validate_rundown_segments(jsonb)
  to service_role;

create or replace function public.studio2_broadcast_rundown(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_edition_id uuid;
  v_config jsonb;
begin
  if p_show_id is null then
    raise exception 'Show id is required' using errcode = '22023';
  end if;

  select s.edition_id, coalesce(s.broadcast_config, '{}'::jsonb)
    into v_edition_id, v_config
  from public.shows s
  where s.id = p_show_id;

  if not found then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not v_is_service and not private.studio2_can_manage_broadcast(v_actor, v_edition_id) then
    raise exception 'Organizer or edition.manage capability required' using errcode = '42501';
  end if;

  return v_config -> 'studio2Rundown';
end
$$;

revoke all on function public.studio2_broadcast_rundown(uuid) from public, anon;
grant execute on function public.studio2_broadcast_rundown(uuid) to authenticated, service_role;

create or replace function public.studio2_save_broadcast_rundown(
  p_show_id uuid,
  p_expected_revision integer,
  p_start_at timestamptz,
  p_segments jsonb,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_edition_id uuid;
  v_config jsonb;
  v_current jsonb;
  v_current_revision integer;
  v_next jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_show_id is null or p_start_at is null then
    raise exception 'Show id and rundown start time are required' using errcode = '22023';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Expected rundown revision is required' using errcode = '22023';
  end if;
  if length(v_reason) < 5 then
    raise exception 'A reason of at least 5 characters is required' using errcode = '22023';
  end if;

  perform private.studio2_validate_rundown_segments(p_segments);

  select s.edition_id, coalesce(s.broadcast_config, '{}'::jsonb)
    into v_edition_id, v_config
  from public.shows s
  where s.id = p_show_id
  for update;

  if not found then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not v_is_service and not private.studio2_can_manage_broadcast(v_actor, v_edition_id) then
    raise exception 'Organizer or edition.manage capability required' using errcode = '42501';
  end if;

  v_current := v_config -> 'studio2Rundown';
  v_current_revision := coalesce((v_current ->> 'revision')::integer, 0);

  if v_current_revision <> p_expected_revision then
    raise exception 'Rundown changed since it was loaded. Refresh before saving.' using errcode = '40001';
  end if;

  if nullif(v_current ->> 'lockedAt', '') is not null then
    raise exception 'Unlock the broadcast rundown before editing its structure' using errcode = '55000';
  end if;

  v_next := jsonb_build_object(
    'version', 2,
    'revision', v_current_revision + 1,
    'startAt', p_start_at,
    'segments', p_segments,
    'lockedAt', null,
    'lockedBy', null,
    'lockReason', null,
    'updatedAt', now(),
    'updatedBy', v_actor
  );

  update public.shows
  set broadcast_config = jsonb_set(v_config, '{studio2Rundown}', v_next, true)
  where id = p_show_id;

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    v_edition_id,
    'rule.changed',
    v_actor,
    'broadcast_rundown',
    p_show_id::text,
    jsonb_build_object(
      'changeKind', 'broadcast.rundown_updated',
      'showId', p_show_id,
      'revision', v_current_revision + 1,
      'reason', v_reason
    )
  );

  return v_next;
end
$$;

revoke all on function public.studio2_save_broadcast_rundown(uuid, integer, timestamptz, jsonb, text) from public, anon;
grant execute on function public.studio2_save_broadcast_rundown(uuid, integer, timestamptz, jsonb, text) to authenticated, service_role;

create or replace function public.studio2_set_broadcast_rundown_lock(
  p_show_id uuid,
  p_expected_revision integer,
  p_locked boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_edition_id uuid;
  v_config jsonb;
  v_current jsonb;
  v_revision integer;
  v_next jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if p_show_id is null or p_expected_revision is null or p_locked is null then
    raise exception 'Show, revision and lock state are required' using errcode = '22023';
  end if;
  if length(v_reason) < 5 then
    raise exception 'A lock reason of at least 5 characters is required' using errcode = '22023';
  end if;

  select s.edition_id, coalesce(s.broadcast_config, '{}'::jsonb)
    into v_edition_id, v_config
  from public.shows s
  where s.id = p_show_id
  for update;

  if not found then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;
  if not v_is_service and not private.studio2_can_manage_broadcast(v_actor, v_edition_id) then
    raise exception 'Organizer or edition.manage capability required' using errcode = '42501';
  end if;

  v_current := v_config -> 'studio2Rundown';
  if v_current is null then
    raise exception 'Create the rundown before locking it' using errcode = '55000';
  end if;
  perform private.studio2_validate_rundown_segments(v_current -> 'segments');
  v_revision := coalesce((v_current ->> 'revision')::integer, 0);
  if v_revision <> p_expected_revision then
    raise exception 'Rundown changed since it was loaded. Refresh before changing the lock.' using errcode = '40001';
  end if;

  if p_locked and nullif(v_current ->> 'lockedAt', '') is not null then
    return v_current;
  end if;
  if not p_locked and nullif(v_current ->> 'lockedAt', '') is null then
    return v_current;
  end if;

  v_next := v_current || jsonb_build_object(
    'version', 2,
    'revision', v_revision + 1,
    'lockedAt', case when p_locked then to_jsonb(now()) else 'null'::jsonb end,
    'lockedBy', case when p_locked then to_jsonb(v_actor) else 'null'::jsonb end,
    'lockReason', case when p_locked then to_jsonb(v_reason) else 'null'::jsonb end,
    'updatedAt', now(),
    'updatedBy', v_actor
  );

  update public.shows
  set broadcast_config = jsonb_set(v_config, '{studio2Rundown}', v_next, true)
  where id = p_show_id;

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    v_edition_id,
    'rule.changed',
    v_actor,
    'broadcast_rundown',
    p_show_id::text,
    jsonb_build_object(
      'changeKind', case when p_locked then 'broadcast.rundown_locked' else 'broadcast.rundown_unlocked' end,
      'showId', p_show_id,
      'revision', v_revision + 1,
      'reason', v_reason
    )
  );

  return v_next;
end
$$;

revoke all on function public.studio2_set_broadcast_rundown_lock(uuid, integer, boolean, text) from public, anon;
grant execute on function public.studio2_set_broadcast_rundown_lock(uuid, integer, boolean, text) to authenticated, service_role;

create or replace function public.studio2_transition_broadcast_segment(
  p_show_id uuid,
  p_expected_revision integer,
  p_segment_id text,
  p_to_status text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_edition_id uuid;
  v_config jsonb;
  v_current jsonb;
  v_segments jsonb;
  v_revision integer;
  v_from_status text;
  v_next_segments jsonb;
  v_next jsonb;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_event_type text;
  v_change_kind text;
begin
  if p_show_id is null or p_expected_revision is null or nullif(btrim(coalesce(p_segment_id, '')), '') is null then
    raise exception 'Show, revision and segment id are required' using errcode = '22023';
  end if;
  if p_to_status not in ('ready', 'live', 'completed', 'skipped') then
    raise exception 'Unsupported rundown segment status: %', p_to_status using errcode = '22023';
  end if;
  if length(v_reason) < 5 then
    raise exception 'A transition reason of at least 5 characters is required' using errcode = '22023';
  end if;

  select s.edition_id, coalesce(s.broadcast_config, '{}'::jsonb)
    into v_edition_id, v_config
  from public.shows s
  where s.id = p_show_id
  for update;

  if not found then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;
  if not v_is_service and not private.studio2_can_manage_broadcast(v_actor, v_edition_id) then
    raise exception 'Organizer or edition.manage capability required' using errcode = '42501';
  end if;

  v_current := v_config -> 'studio2Rundown';
  if v_current is null then
    raise exception 'Broadcast rundown is not configured' using errcode = '55000';
  end if;
  v_segments := v_current -> 'segments';
  perform private.studio2_validate_rundown_segments(v_segments);
  v_revision := coalesce((v_current ->> 'revision')::integer, 0);
  if v_revision <> p_expected_revision then
    raise exception 'Rundown changed since it was loaded. Refresh before changing segment state.' using errcode = '40001';
  end if;

  select segment ->> 'status'
    into v_from_status
  from jsonb_array_elements(v_segments) segment
  where segment ->> 'id' = p_segment_id;

  if v_from_status is null then
    raise exception 'Rundown segment not found: %', p_segment_id using errcode = 'P0002';
  end if;

  if not (
    (v_from_status = 'planned' and p_to_status in ('ready', 'skipped'))
    or (v_from_status = 'ready' and p_to_status in ('live', 'skipped'))
    or (v_from_status = 'live' and p_to_status in ('completed', 'skipped'))
  ) then
    raise exception 'Invalid segment transition: % -> %', v_from_status, p_to_status using errcode = '22023';
  end if;

  if p_to_status = 'live' and exists (
    select 1 from jsonb_array_elements(v_segments) segment
    where segment ->> 'id' <> p_segment_id and segment ->> 'status' = 'live'
  ) then
    raise exception 'Another rundown segment is already live' using errcode = '55000';
  end if;

  select jsonb_agg(
    case
      when segment ->> 'id' <> p_segment_id then segment
      else segment
        || jsonb_build_object('status', p_to_status)
        || case when p_to_status = 'live' then jsonb_build_object('actualStartedAt', coalesce(segment -> 'actualStartedAt', to_jsonb(now()))) else '{}'::jsonb end
        || case when p_to_status in ('completed', 'skipped') then jsonb_build_object('actualCompletedAt', coalesce(segment -> 'actualCompletedAt', to_jsonb(now()))) else '{}'::jsonb end
    end
    order by ordinal
  ) into v_next_segments
  from jsonb_array_elements(v_segments) with ordinality as item(segment, ordinal);

  v_next := v_current || jsonb_build_object(
    'version', 2,
    'revision', v_revision + 1,
    'segments', v_next_segments,
    'updatedAt', now(),
    'updatedBy', v_actor
  );

  update public.shows
  set broadcast_config = jsonb_set(v_config, '{studio2Rundown}', v_next, true)
  where id = p_show_id;

  v_event_type := case
    when p_to_status = 'live' then 'broadcast.segment_started'
    when p_to_status = 'completed' then 'broadcast.segment_completed'
    else 'rule.changed'
  end;
  v_change_kind := 'broadcast.segment_' || p_to_status;

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    v_edition_id,
    v_event_type,
    v_actor,
    'broadcast_segment',
    p_show_id::text || ':' || p_segment_id,
    jsonb_build_object(
      'changeKind', v_change_kind,
      'showId', p_show_id,
      'segmentId', p_segment_id,
      'fromStatus', v_from_status,
      'toStatus', p_to_status,
      'revision', v_revision + 1,
      'reason', v_reason
    )
  );

  return v_next;
end
$$;

revoke all on function public.studio2_transition_broadcast_segment(uuid, integer, text, text, text) from public, anon;
grant execute on function public.studio2_transition_broadcast_segment(uuid, integer, text, text, text) to authenticated, service_role;

commit;
