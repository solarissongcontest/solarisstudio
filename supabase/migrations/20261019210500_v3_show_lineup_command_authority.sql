begin;

-- V3 System / Organizer O6: govern the show line-up, allocation and running-order
-- write boundary without creating a second source of contest truth. The canonical
-- rows remain public.shows + public.participants; this migration adds an opaque
-- state-version projection and one transactional command envelope over them.
select public.v3_register_migration_contract(
  '20261019210500_v3_show_lineup_command_authority',
  1,
  'forward_fix_only',
  false,
  null,
  'O6 line-up commands add idempotency, exact scope, stale-state rejection, audit and receipt authority without rewriting canonical show data'
);

create or replace function private.v3_show_lineup_state_payload(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $state$
declare
  v_state jsonb;
begin
  select jsonb_build_object(
    'showId', s.id,
    'editionId', s.edition_id,
    'name', s.name,
    'kind', s.kind,
    'lineupStage', s.lineup_stage,
    'showUpdatedAt', s.updated_at,
    'participants', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'countryId', p.country_id,
          'contestEntityId', p.contest_entity_id,
          'artist', p.artist,
          'song', p.song,
          'runningOrder', p.running_order,
          'allocation', p.running_order_allocation,
          'qualified', p.qualified,
          'participationStatus', p.participation_status,
          'updatedAt', p.updated_at
        ) order by p.id
      ) filter (where p.id is not null),
      '[]'::jsonb
    )
  )
  into v_state
  from public.shows s
  left join public.participants p on p.show_id = s.id
  where s.id = p_show_id
  group by s.id, s.edition_id, s.name, s.kind, s.lineup_stage, s.updated_at;

  if v_state is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  return v_state;
end
$state$;

revoke all on function private.v3_show_lineup_state_payload(uuid)
  from public, anon, authenticated;

create or replace function private.v3_show_lineup_state_version(p_show_id uuid)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $version$
  select encode(
    extensions.digest(
      convert_to(private.v3_show_lineup_state_payload(p_show_id)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$version$;

revoke all on function private.v3_show_lineup_state_version(uuid)
  from public, anon, authenticated;

create or replace function public.v3_show_lineup_preflight(
  p_edition_id uuid,
  p_show_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_show public.shows%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_state jsonb;
  v_state_version text;
  v_participant_count integer := 0;
  v_missing_allocations integer := 0;
  v_blockers text[] := array[]::text[];
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_action not in (
    'start_allocation',
    'save_allocation',
    'start_running_order',
    'save_running_order',
    'sync_confirmed_countries'
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_show
  from public.shows
  where id = p_show_id;

  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_state := private.v3_show_lineup_state_payload(p_show_id);
  v_state_version := private.v3_show_lineup_state_version(p_show_id);
  v_participant_count := jsonb_array_length(v_state -> 'participants');

  select count(*)::integer
  into v_missing_allocations
  from public.participants p
  where p.show_id = p_show_id
    and p.running_order_allocation is null;

  if v_action = 'start_allocation' then
    if v_show.lineup_stage is distinct from 'lineup' then
      v_blockers := array_append(v_blockers, 'show_not_in_lineup_stage');
    end if;
    if v_participant_count = 0 then
      v_blockers := array_append(v_blockers, 'show_has_no_participants');
    end if;
  elsif v_action = 'save_allocation' then
    if v_show.lineup_stage is distinct from 'allocation' then
      v_blockers := array_append(v_blockers, 'show_not_in_allocation_stage');
    end if;
  elsif v_action = 'start_running_order' then
    if v_show.lineup_stage is distinct from 'allocation' then
      v_blockers := array_append(v_blockers, 'show_not_in_allocation_stage');
    end if;
    if v_participant_count = 0 then
      v_blockers := array_append(v_blockers, 'show_has_no_participants');
    end if;
    if v_missing_allocations > 0 then
      v_blockers := array_append(v_blockers, 'allocation_incomplete');
    end if;
  elsif v_action = 'save_running_order' then
    if v_show.lineup_stage is distinct from 'running_order' then
      v_blockers := array_append(v_blockers, 'show_not_in_running_order_stage');
    end if;
  elsif v_action = 'sync_confirmed_countries' then
    if v_show.lineup_stage is distinct from 'lineup' then
      v_blockers := array_append(v_blockers, 'membership_locked_after_allocation_started');
    end if;
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_blockers) = 0,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'showKind', v_show.kind,
    'action', v_action,
    'lineupStage', v_show.lineup_stage,
    'participantCount', v_participant_count,
    'missingAllocations', v_missing_allocations,
    'stateVersion', v_state_version,
    'blockers', to_jsonb(v_blockers),
    'consequences', case v_action
      when 'start_allocation' then jsonb_build_array('clear_running_order', 'clear_allocations', 'advance_lineup_stage')
      when 'save_allocation' then jsonb_build_array('replace_complete_allocation_draw')
      when 'start_running_order' then jsonb_build_array('write_complete_running_order', 'advance_lineup_stage')
      when 'save_running_order' then jsonb_build_array('replace_complete_running_order')
      else jsonb_build_array('refresh_or_add_confirmed_country_membership')
    end,
    'serverTime', now()
  );
end
$preflight$;

revoke all on function public.v3_show_lineup_preflight(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.v3_show_lineup_preflight(uuid, uuid, text, jsonb)
  to authenticated, service_role;

create or replace function public.v3_execute_show_lineup_operation(
  p_edition_id uuid,
  p_show_id uuid,
  p_action text,
  p_payload jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_state_version text,
  p_reason text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $execute$
declare
  v_show public.shows%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_payload jsonb := coalesce(p_payload, '{}'::jsonb);
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_command text;
  v_claim jsonb;
  v_operation_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_before_version text;
  v_after_version text;
  v_participant_count integer := 0;
  v_supplied integer := 0;
  v_distinct integer := 0;
  v_invalid integer := 0;
  v_missing_allocations integer := 0;
  v_allocations jsonb;
  v_order jsonb;
  v_country_ids uuid[] := array[]::uuid[];
  v_source record;
  v_existing_id uuid;
  v_added integer := 0;
  v_refreshed integer := 0;
  v_changed integer := 0;
  v_requested integer := 0;
  v_source_count integer := 0;
  v_event_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or nullif(btrim(coalesce(p_expected_state_version, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_action not in (
    'start_allocation',
    'save_allocation',
    'start_running_order',
    'save_running_order',
    'sync_confirmed_countries'
  ) then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_show
  from public.shows
  where id = p_show_id;

  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_command := 'show.lineup.' || replace(v_action, '_', '.');
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    v_command,
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object(
      'action', v_action,
      'payload', v_payload,
      'expectedStateVersion', p_expected_state_version,
      'reason', v_reason
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  select * into v_show
  from public.shows
  where id = p_show_id
  for update;

  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '40001', message = 'STATE_CHANGED';
  end if;

  perform 1
  from public.participants p
  where p.show_id = p_show_id
  order by p.id
  for update;

  v_before := private.v3_show_lineup_state_payload(p_show_id);
  v_before_version := private.v3_show_lineup_state_version(p_show_id);
  if v_before_version is distinct from p_expected_state_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  v_participant_count := jsonb_array_length(v_before -> 'participants');

  if v_action = 'start_allocation' then
    if v_show.lineup_stage is distinct from 'lineup' or v_participant_count = 0 then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;

    update public.participants
    set running_order = null,
        running_order_allocation = null,
        updated_at = now()
    where show_id = p_show_id;

    update public.shows
    set lineup_stage = 'allocation', updated_at = now()
    where id = p_show_id;
    v_changed := 1;

  elsif v_action = 'save_allocation' then
    if v_show.lineup_stage is distinct from 'allocation' then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;

    v_allocations := coalesce(v_payload -> 'allocations', '[]'::jsonb);
    if jsonb_typeof(v_allocations) <> 'array' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select count(*)::integer, count(distinct item.id)::integer
    into v_supplied, v_distinct
    from jsonb_to_recordset(v_allocations) as item(id uuid, allocation text);

    if v_supplied <> v_participant_count or v_distinct <> v_participant_count then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select count(*)::integer
    into v_invalid
    from jsonb_to_recordset(v_allocations) as item(id uuid, allocation text)
    left join public.participants p
      on p.id = item.id and p.show_id = p_show_id
    where p.id is null
       or item.allocation not in ('first_half', 'second_half', 'producer_choice');

    if v_invalid > 0 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    update public.participants p
    set running_order_allocation = item.allocation,
        updated_at = now()
    from jsonb_to_recordset(v_allocations) as item(id uuid, allocation text)
    where p.id = item.id and p.show_id = p_show_id;

    update public.shows set updated_at = now() where id = p_show_id;
    v_changed := 1;

  elsif v_action in ('start_running_order', 'save_running_order') then
    if v_action = 'start_running_order' then
      if v_show.lineup_stage is distinct from 'allocation' then
        raise exception using errcode = '40001', message = 'STATE_CHANGED';
      end if;
      select count(*)::integer into v_missing_allocations
      from public.participants
      where show_id = p_show_id and running_order_allocation is null;
      if v_participant_count = 0 or v_missing_allocations > 0 then
        raise exception using errcode = '40001', message = 'STATE_CHANGED';
      end if;
    elsif v_show.lineup_stage is distinct from 'running_order' then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;

    v_order := coalesce(v_payload -> 'participantIds', '[]'::jsonb);
    if jsonb_typeof(v_order) <> 'array' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select count(*)::integer, count(distinct value)::integer
    into v_supplied, v_distinct
    from jsonb_array_elements_text(v_order) item(value);

    if v_supplied <> v_participant_count or v_distinct <> v_participant_count then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    select count(*)::integer into v_invalid
    from jsonb_array_elements_text(v_order) item(value)
    left join public.participants p
      on p.id = item.value::uuid and p.show_id = p_show_id
    where p.id is null;

    if v_invalid > 0 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    with requested as (
      select item.value::uuid as participant_id, item.ordinality::integer as position
      from jsonb_array_elements_text(v_order) with ordinality as item(value, ordinality)
    )
    update public.participants p
    set running_order = requested.position,
        updated_at = now()
    from requested
    where p.id = requested.participant_id and p.show_id = p_show_id;

    update public.shows
    set lineup_stage = case when v_action = 'start_running_order' then 'running_order' else lineup_stage end,
        updated_at = now()
    where id = p_show_id;
    v_changed := 1;

  else
    if v_show.lineup_stage is distinct from 'lineup' then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;

    if v_payload ? 'countryIds' then
      if jsonb_typeof(v_payload -> 'countryIds') <> 'array' then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      select coalesce(array_agg(distinct item.value::uuid), array[]::uuid[])
      into v_country_ids
      from jsonb_array_elements_text(v_payload -> 'countryIds') item(value);
    end if;

    if exists (
      select 1
      from public.participants p
      where p.show_id = p_show_id and p.country_id is not null
      group by p.country_id
      having count(*) > 1
    ) then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;

    v_requested := coalesce(cardinality(v_country_ids), 0);

    select count(*)::integer
    into v_source_count
    from (
      select distinct on (p.country_id) p.country_id
      from public.participants p
      where p.edition_id = p_edition_id
        and p.show_id is null
        and p.participation_status = 'confirmed'
        and p.country_id is not null
        and (v_requested = 0 or p.country_id = any(v_country_ids))
      order by p.country_id, p.updated_at desc, p.created_at desc
    ) source_count;

    for v_source in
      select distinct on (p.country_id) p.*
      from public.participants p
      where p.edition_id = p_edition_id
        and p.show_id is null
        and p.participation_status = 'confirmed'
        and p.country_id is not null
        and (v_requested = 0 or p.country_id = any(v_country_ids))
      order by p.country_id, p.updated_at desc, p.created_at desc
    loop
      v_existing_id := null;
      select p.id into v_existing_id
      from public.participants p
      where p.show_id = p_show_id and p.country_id = v_source.country_id
      limit 1
      for update;

      if v_existing_id is null then
        insert into public.participants (
          edition_id,
          country_id,
          artist,
          song,
          running_order,
          semi_final,
          show_id,
          qualified,
          notes,
          contest_entity_id,
          participation_status,
          youtube_url,
          spotify_url,
          apple_music_url,
          publication_status,
          scheduled_publish_at,
          published_at,
          publication_source,
          publication_overridden,
          running_order_allocation
        ) values (
          p_edition_id,
          v_source.country_id,
          v_source.artist,
          v_source.song,
          null,
          v_show.kind,
          p_show_id,
          false,
          v_source.notes,
          v_source.contest_entity_id,
          v_source.participation_status,
          v_source.youtube_url,
          v_source.spotify_url,
          v_source.apple_music_url,
          v_source.publication_status,
          v_source.scheduled_publish_at,
          v_source.published_at,
          v_source.publication_source,
          v_source.publication_overridden,
          null
        );
        v_added := v_added + 1;
        v_changed := v_changed + 1;
      else
        update public.participants p
        set contest_entity_id = v_source.contest_entity_id,
            artist = v_source.artist,
            song = v_source.song,
            notes = v_source.notes,
            participation_status = v_source.participation_status,
            youtube_url = v_source.youtube_url,
            spotify_url = v_source.spotify_url,
            apple_music_url = v_source.apple_music_url,
            publication_status = v_source.publication_status,
            scheduled_publish_at = v_source.scheduled_publish_at,
            published_at = v_source.published_at,
            publication_source = v_source.publication_source,
            publication_overridden = v_source.publication_overridden,
            semi_final = v_show.kind,
            updated_at = now()
        where p.id = v_existing_id
          and (
            p.contest_entity_id is distinct from v_source.contest_entity_id
            or p.artist is distinct from v_source.artist
            or p.song is distinct from v_source.song
            or p.notes is distinct from v_source.notes
            or p.participation_status is distinct from v_source.participation_status
            or p.youtube_url is distinct from v_source.youtube_url
            or p.spotify_url is distinct from v_source.spotify_url
            or p.apple_music_url is distinct from v_source.apple_music_url
            or p.publication_status is distinct from v_source.publication_status
            or p.scheduled_publish_at is distinct from v_source.scheduled_publish_at
            or p.published_at is distinct from v_source.published_at
            or p.publication_source is distinct from v_source.publication_source
            or p.publication_overridden is distinct from v_source.publication_overridden
            or p.semi_final is distinct from v_show.kind
          );
        if found then
          v_refreshed := v_refreshed + 1;
          v_changed := v_changed + 1;
        end if;
      end if;
    end loop;

    if v_changed > 0 then
      update public.shows set updated_at = now() where id = p_show_id;
    end if;
  end if;

  v_after := private.v3_show_lineup_state_payload(p_show_id);
  v_after_version := private.v3_show_lineup_state_version(p_show_id);

  if v_changed > 0 then
    insert into public.admin_audit_log (
      actor_id,
      action,
      table_name,
      record_id,
      edition_id,
      before_data,
      after_data
    ) values (
      auth.uid(),
      v_command,
      'shows',
      p_show_id::text,
      p_edition_id,
      v_before,
      v_after
    );

    select coalesce(max(event.aggregate_version), 0) + 1
    into v_event_version
    from private.v3_domain_events event
    where event.event_type = 'show.changed'
      and event.aggregate_type = 'show'
      and event.aggregate_id = p_show_id::text;

    perform private.v3_emit_domain_event(
      'show.changed',
      'show',
      p_show_id::text,
      v_event_version,
      v_operation_id,
      p_edition_id,
      p_show_id,
      jsonb_build_object(
        'lineupAction', v_action,
        'beforeStateVersion', v_before_version,
        'afterStateVersion', v_after_version,
        'participantCount', jsonb_array_length(v_after -> 'participants'),
        'added', v_added,
        'refreshed', v_refreshed
      ),
      1,
      array[]::text[]
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'action', v_action,
    'lineupStage', v_after ->> 'lineupStage',
    'stateVersion', v_after_version,
    'participantCount', jsonb_array_length(v_after -> 'participants'),
    'added', v_added,
    'refreshed', v_refreshed,
    'skipped', case when v_action = 'sync_confirmed_countries' and v_requested > 0 then greatest(0, v_requested - v_source_count) else 0 end,
    'changed', v_changed > 0
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$execute$;

revoke all on function public.v3_execute_show_lineup_operation(
  uuid, uuid, text, jsonb, uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.v3_execute_show_lineup_operation(
  uuid, uuid, text, jsonb, uuid, text, text, text, uuid
) to authenticated, service_role;

comment on function public.v3_show_lineup_preflight(uuid, uuid, text, jsonb) is
  'O6 read/preflight contract for exact-edition show line-up operations with an opaque authoritative state version.';
comment on function public.v3_execute_show_lineup_operation(uuid, uuid, text, jsonb, uuid, text, text, text, uuid) is
  'O6 canonical transactional line-up/allocation/running-order command with S2 receipts, CAS, audit and show.changed DomainEvent evidence.';

notify pgrst, 'reload schema';

commit;
