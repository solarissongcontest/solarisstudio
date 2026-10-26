begin;

-- Worker 6 / System #598. Restore the canonical O6 metadata authority without
-- importing the historical draft's broad Organizer workspace cutover.
select public.v3_register_migration_contract(
  'v3.show-lineup-metadata-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'O6 participant metadata edits and reusable-entry sync move behind the canonical command, CAS, audit and receipt boundary'
);

create or replace function private.v3_show_metadata_state_payload(
  p_edition_id uuid,
  p_show_id uuid
)
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
    'show', private.v3_show_lineup_state_payload(p_show_id),
    'editionSources', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'showId', p.show_id,
          'countryId', p.country_id,
          'contestEntityId', p.contest_entity_id,
          'artist', p.artist,
          'song', p.song,
          'publicationStatus', p.publication_status,
          'updatedAt', p.updated_at
        ) order by p.id
      ),
      '[]'::jsonb
    )
  )
  into v_state
  from public.participants p
  where p.edition_id = p_edition_id;

  if v_state is null then
    v_state := jsonb_build_object(
      'show', private.v3_show_lineup_state_payload(p_show_id),
      'editionSources', '[]'::jsonb
    );
  end if;
  return v_state;
end
$state$;

revoke all on function private.v3_show_metadata_state_payload(uuid, uuid)
  from public, anon, authenticated;

create or replace function private.v3_show_metadata_state_version(
  p_edition_id uuid,
  p_show_id uuid
)
returns text
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $version$
  select encode(
    extensions.digest(
      convert_to(private.v3_show_metadata_state_payload(p_edition_id, p_show_id)::text, 'UTF8'),
      'sha256'
    ),
    'hex'
  )
$version$;

revoke all on function private.v3_show_metadata_state_version(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.v3_show_lineup_metadata_preflight(
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
  v_participant public.participants%rowtype;
  v_state_version text;
  v_blockers text[] := array[]::text[];
  v_syncable integer := 0;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null or jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_action not in ('member_metadata_update', 'sync_entry_metadata') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_state_version := private.v3_show_metadata_state_version(p_edition_id, p_show_id);

  if v_action = 'member_metadata_update' then
    if nullif(v_payload ->> 'participantId', '') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    select * into v_participant
    from public.participants p
    where p.id = (v_payload ->> 'participantId')::uuid
      and p.show_id = p_show_id;
    if v_participant.id is null or v_participant.edition_id is distinct from p_edition_id then
      v_blockers := array_append(v_blockers, 'participant_scope_mismatch');
    elsif v_participant.publication_status = 'published' then
      v_blockers := array_append(v_blockers, 'published_entry_metadata');
    end if;
  else
    select count(*)::integer
    into v_syncable
    from public.participants target
    where target.edition_id = p_edition_id
      and target.show_id = p_show_id
      and target.publication_status <> 'published'
      and target.artist is null
      and target.song is null
      and exists (
        select 1
        from public.participants source
        where source.edition_id = p_edition_id
          and source.id <> target.id
          and source.show_id is distinct from p_show_id
          and (source.artist is not null or source.song is not null)
          and (
            (target.contest_entity_id is not null and source.contest_entity_id = target.contest_entity_id)
            or (target.country_id is not null and source.country_id = target.country_id)
          )
      );
  end if;

  return jsonb_build_object(
    'ok', cardinality(v_blockers) = 0,
    'editionId', p_edition_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'action', v_action,
    'stateVersion', v_state_version,
    'syncableCount', v_syncable,
    'blockers', to_jsonb(v_blockers),
    'consequences', case v_action
      when 'member_metadata_update' then jsonb_build_array('update_unpublished_show_entry_metadata')
      else jsonb_build_array('fill_blank_unpublished_metadata_from_same_edition_identity')
    end,
    'serverTime', now()
  );
end
$preflight$;

revoke all on function public.v3_show_lineup_metadata_preflight(uuid, uuid, text, jsonb)
  from public, anon;
grant execute on function public.v3_show_lineup_metadata_preflight(uuid, uuid, text, jsonb)
  to authenticated, service_role;

create or replace function public.v3_execute_show_lineup_metadata_operation(
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
  v_claim jsonb;
  v_operation_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_before_version text;
  v_after_version text;
  v_participant public.participants%rowtype;
  v_target public.participants%rowtype;
  v_source public.participants%rowtype;
  v_artist text;
  v_song text;
  v_changed integer := 0;
  v_event_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or nullif(btrim(coalesce(p_expected_state_version, '')), '') is null
     or jsonb_typeof(v_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if v_action not in ('member_metadata_update', 'sync_entry_metadata') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or v_show.edition_id is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    case v_action
      when 'member_metadata_update' then 'show.lineup.member.metadata.update'
      else 'show.lineup.metadata.sync'
    end,
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
  where p.edition_id = p_edition_id
  order by p.id
  for update;

  v_before := private.v3_show_metadata_state_payload(p_edition_id, p_show_id);
  v_before_version := private.v3_show_metadata_state_version(p_edition_id, p_show_id);
  if v_before_version is distinct from p_expected_state_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if v_action = 'member_metadata_update' then
    if nullif(v_payload ->> 'participantId', '') is null then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    select * into v_participant
    from public.participants p
    where p.id = (v_payload ->> 'participantId')::uuid
      and p.show_id = p_show_id;
    if v_participant.id is null or v_participant.edition_id is distinct from p_edition_id then
      raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
    end if;
    if v_participant.publication_status = 'published' then
      raise exception using errcode = '23503', message = 'PUBLISHED_ENTRY_METADATA';
    end if;

    v_artist := nullif(btrim(coalesce(v_payload ->> 'artist', '')), '');
    v_song := nullif(btrim(coalesce(v_payload ->> 'song', '')), '');
    update public.participants p
    set artist = v_artist,
        song = v_song,
        updated_at = now()
    where p.id = v_participant.id
      and (p.artist is distinct from v_artist or p.song is distinct from v_song);
    if found then v_changed := 1; end if;
  else
    for v_target in
      select target.*
      from public.participants target
      where target.edition_id = p_edition_id
        and target.show_id = p_show_id
        and target.publication_status <> 'published'
        and target.artist is null
        and target.song is null
      order by target.id
    loop
      v_source := null;
      select source.* into v_source
      from public.participants source
      where source.edition_id = p_edition_id
        and source.id <> v_target.id
        and source.show_id is distinct from p_show_id
        and (source.artist is not null or source.song is not null)
        and (
          (v_target.contest_entity_id is not null and source.contest_entity_id = v_target.contest_entity_id)
          or (v_target.country_id is not null and source.country_id = v_target.country_id)
        )
      order by source.updated_at desc, source.created_at desc
      limit 1;

      if v_source.id is not null then
        update public.participants p
        set artist = v_source.artist,
            song = v_source.song,
            updated_at = now()
        where p.id = v_target.id;
        v_changed := v_changed + 1;
      end if;
    end loop;
  end if;

  if v_changed > 0 then
    update public.shows set updated_at = now() where id = p_show_id;
  end if;

  v_after := private.v3_show_metadata_state_payload(p_edition_id, p_show_id);
  v_after_version := private.v3_show_metadata_state_version(p_edition_id, p_show_id);

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
    case v_action
      when 'member_metadata_update' then 'show.lineup.member.metadata.update'
      else 'show.lineup.metadata.sync'
    end,
    'shows',
    p_show_id::text,
    p_edition_id,
    v_before,
    v_after || jsonb_build_object('reason', v_reason, 'changedCount', v_changed)
  );

  if v_changed > 0 then
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
        'changedCount', v_changed
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
    'stateVersion', v_after_version,
    'participantCount', jsonb_array_length(private.v3_show_lineup_state_payload(p_show_id) -> 'participants'),
    'changedCount', v_changed
  );

  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$execute$;

revoke all on function public.v3_execute_show_lineup_metadata_operation(
  uuid, uuid, text, jsonb, uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.v3_execute_show_lineup_metadata_operation(
  uuid, uuid, text, jsonb, uuid, text, text, text, uuid
) to authenticated, service_role;

comment on function public.v3_show_lineup_metadata_preflight(uuid, uuid, text, jsonb) is
  'O6 preflight for unpublished show-entry metadata edits and active-show reusable-entry metadata synchronization.';
comment on function public.v3_execute_show_lineup_metadata_operation(uuid, uuid, text, jsonb, uuid, text, text, text, uuid) is
  'O6 metadata command with edition-wide source locking, deterministic CAS, S2 replay protection, audit and show.changed evidence.';

notify pgrst, 'reload schema';

commit;
