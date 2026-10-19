begin;

-- #598 follow-up on top of the canonical line-up command authority.
-- Governs the remaining participant metadata/sync/promotion writes that were
-- still browser-owned in ShowLineupWorkspace.
select public.v3_register_migration_contract(
  'v3.show-lineup-entry-qualifier-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern show entry details, edition-wide deterministic detail sync and qualifier promotion using canonical line-up state, S2 receipts and declared show/edition change events.'
);

create or replace function private.v3_edition_entry_detail_state(p_edition_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $fn$
  with rows as (
    select
      p.id, p.show_id, p.country_id, p.contest_entity_id,
      p.artist, p.song, p.updated_at
    from public.participants p
    where p.edition_id = p_edition_id
    order by p.id
  ),
  materialized as (
    select jsonb_build_object(
      'editionId', p_edition_id,
      'participants', coalesce(
        jsonb_agg(jsonb_build_object(
          'id', rows.id,
          'showId', rows.show_id,
          'countryId', rows.country_id,
          'contestEntityId', rows.contest_entity_id,
          'artist', rows.artist,
          'song', rows.song,
          'updatedAt', rows.updated_at
        ) order by rows.id),
        '[]'::jsonb
      )
    ) as state
    from rows
  )
  select materialized.state || jsonb_build_object(
    'stateVersion', encode(
      extensions.digest(convert_to(materialized.state::text, 'UTF8'), 'sha256'),
      'hex'
    )
  )
  from materialized
$fn$;

revoke all on function private.v3_edition_entry_detail_state(uuid)
  from public, anon, authenticated;

create or replace function private.v3_entry_detail_sync_targets(p_edition_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
  with ranked as (
    select
      coalesce(p.country_id, p.contest_entity_id, p.id) as identity_id,
      p.id as source_participant_id,
      p.artist,
      p.song,
      row_number() over (
        partition by coalesce(p.country_id, p.contest_entity_id, p.id)
        order by p.updated_at desc, p.id desc
      ) as rank
    from public.participants p
    where p.edition_id = p_edition_id
      and (p.artist is not null or p.song is not null)
  ),
  sources as (
    select * from ranked where rank = 1
  ),
  targets as (
    select
      p.id as participant_id,
      s.source_participant_id,
      s.artist,
      s.song
    from public.participants p
    join sources s
      on s.identity_id = coalesce(p.country_id, p.contest_entity_id, p.id)
    where p.edition_id = p_edition_id
      and p.artist is null
      and p.song is null
      and p.id <> s.source_participant_id
    order by p.id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'participantId', targets.participant_id,
    'sourceParticipantId', targets.source_participant_id,
    'artist', targets.artist,
    'song', targets.song
  ) order by targets.participant_id), '[]'::jsonb)
  from targets
$fn$;

revoke all on function private.v3_entry_detail_sync_targets(uuid)
  from public, anon, authenticated;

create or replace function public.v3_entry_detail_sync_preflight(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_state jsonb;
  v_targets jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  v_state := private.v3_edition_entry_detail_state(p_edition_id);
  v_targets := private.v3_entry_detail_sync_targets(p_edition_id);
  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'stateVersion', v_state ->> 'stateVersion',
    'targetCount', jsonb_array_length(v_targets),
    'targets', v_targets,
    'serverTime', now()
  );
end
$fn$;

revoke all on function public.v3_entry_detail_sync_preflight(uuid) from public, anon;
grant execute on function public.v3_entry_detail_sync_preflight(uuid)
  to authenticated, service_role;

create or replace function public.v3_execute_show_entry_detail_update(
  p_edition_id uuid,
  p_show_id uuid,
  p_participant_id uuid,
  p_artist text,
  p_song text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_state_version text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_before_version text;
  v_after_version text;
  v_previous_artist text;
  v_previous_song text;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_show_id is null or p_participant_id is null
     or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or nullif(btrim(coalesce(p_expected_state_version, '')), '') is null then
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
    'show.lineup.entry.update',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'participant',
      'subjectId', p_participant_id
    ),
    jsonb_build_object(
      'participantId', p_participant_id,
      'artist', nullif(btrim(coalesce(p_artist, '')), ''),
      'song', nullif(btrim(coalesce(p_song, '')), ''),
      'expectedStateVersion', p_expected_state_version
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  v_before := private.v3_lock_show_lineup_expected(p_show_id, p_expected_state_version);
  v_before_version := v_before ->> 'stateVersion';

  select p.artist, p.song into v_previous_artist, v_previous_song
  from public.participants p
  where p.id = p_participant_id
    and p.show_id = p_show_id
    and p.edition_id = p_edition_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'PARTICIPANT_NOT_FOUND';
  end if;

  update public.participants p
  set artist = nullif(btrim(coalesce(p_artist, '')), ''),
      song = nullif(btrim(coalesce(p_song, '')), ''),
      updated_at = now()
  where p.id = p_participant_id
    and p.show_id = p_show_id
    and p.edition_id = p_edition_id;

  v_after := private.v3_show_lineup_state_payload(p_show_id);
  v_after_version := private.v3_show_lineup_state_version(p_show_id);
  perform private.v3_emit_lineup_changed(
    v_operation_id, p_edition_id, p_show_id, 'entry_detail_update',
    v_before_version, v_after_version,
    jsonb_build_object(
      'participantId', p_participant_id,
      'beforeArtist', v_previous_artist,
      'beforeSong', v_previous_song,
      'artist', nullif(btrim(coalesce(p_artist, '')), ''),
      'song', nullif(btrim(coalesce(p_song, '')), '')
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'action', 'update_entry_detail',
    'lineupStage', v_show.lineup_stage,
    'stateVersion', v_after_version,
    'participantCount', jsonb_array_length(v_after -> 'participants'),
    'changed', true
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$fn$;

revoke all on function public.v3_execute_show_entry_detail_update(
  uuid, uuid, uuid, text, text, uuid, text, text, uuid
) from public, anon;
grant execute on function public.v3_execute_show_entry_detail_update(
  uuid, uuid, uuid, text, text, uuid, text, text, uuid
) to authenticated, service_role;

create or replace function public.v3_execute_entry_detail_sync(
  p_edition_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_state_version text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_claim jsonb;
  v_operation_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_targets jsonb;
  v_current_version text;
  v_affected integer := 0;
  v_event_version bigint;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null or p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null
     or nullif(btrim(coalesce(p_expected_state_version, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'entry.details.sync',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'subjectType', 'edition',
      'subjectId', p_edition_id
    ),
    jsonb_build_object('expectedStateVersion', p_expected_state_version)
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform 1
  from public.participants p
  where p.edition_id = p_edition_id
  order by p.id
  for update;

  v_before := private.v3_edition_entry_detail_state(p_edition_id);
  v_current_version := v_before ->> 'stateVersion';
  if v_current_version is distinct from p_expected_state_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT',
      detail = jsonb_build_object(
        'expectedStateVersion', p_expected_state_version,
        'currentStateVersion', v_current_version
      )::text;
  end if;

  v_targets := private.v3_entry_detail_sync_targets(p_edition_id);

  with ranked as (
    select
      coalesce(p.country_id, p.contest_entity_id, p.id) as identity_id,
      p.artist,
      p.song,
      row_number() over (
        partition by coalesce(p.country_id, p.contest_entity_id, p.id)
        order by p.updated_at desc, p.id desc
      ) as rank
    from public.participants p
    where p.edition_id = p_edition_id
      and (p.artist is not null or p.song is not null)
  ),
  sources as (
    select * from ranked where rank = 1
  )
  update public.participants p
  set artist = s.artist,
      song = s.song,
      updated_at = now()
  from sources s
  where p.edition_id = p_edition_id
    and p.artist is null
    and p.song is null
    and s.identity_id = coalesce(p.country_id, p.contest_entity_id, p.id);
  get diagnostics v_affected = row_count;

  v_after := private.v3_edition_entry_detail_state(p_edition_id);
  v_event_version := hashtextextended(v_after ->> 'stateVersion', 0)
    & 9223372036854775807::bigint;
  perform private.v3_emit_domain_event(
    'edition.changed',
    'edition',
    p_edition_id::text,
    v_event_version,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'changeKind', 'entry_details_synced',
      'beforeStateVersion', v_current_version,
      'afterStateVersion', v_after ->> 'stateVersion',
      'affectedCount', v_affected,
      'targets', v_targets
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', p_edition_id,
    'action', 'sync_entry_details',
    'stateVersion', v_after ->> 'stateVersion',
    'affectedCount', v_affected,
    'changed', v_affected > 0
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$fn$;

revoke all on function public.v3_execute_entry_detail_sync(
  uuid, uuid, text, text, uuid
) from public, anon;
grant execute on function public.v3_execute_entry_detail_sync(
  uuid, uuid, text, text, uuid
) to authenticated, service_role;

create or replace function private.v3_show_qualifier_candidates(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_edition_id uuid;
  v_kind text;
  v_candidates jsonb;
begin
  select s.edition_id, s.kind into v_edition_id, v_kind
  from public.shows s where s.id = p_show_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;
  if v_kind not in ('grand-final', 'final') then
    raise exception using errcode = '22023', message = 'TARGET_NOT_FINAL';
  end if;

  with target_identity as (
    select coalesce(p.country_id, p.contest_entity_id, p.id) as identity_id
    from public.participants p where p.show_id = p_show_id
  ),
  ranked as (
    select
      p.id as source_participant_id,
      p.country_id,
      p.contest_entity_id,
      p.artist,
      p.song,
      p.updated_at,
      coalesce(p.country_id, p.contest_entity_id, p.id) as identity_id,
      row_number() over (
        partition by coalesce(p.country_id, p.contest_entity_id, p.id)
        order by p.updated_at desc, p.id desc
      ) as rank
    from public.participants p
    where p.edition_id = v_edition_id
      and p.show_id is distinct from p_show_id
      and p.qualified is true
  ),
  eligible as (
    select ranked.* from ranked
    where ranked.rank = 1
      and not exists (
        select 1 from target_identity t where t.identity_id = ranked.identity_id
      )
    order by ranked.identity_id, ranked.source_participant_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'sourceParticipantId', eligible.source_participant_id,
    'countryId', eligible.country_id,
    'contestEntityId', eligible.contest_entity_id,
    'artist', eligible.artist,
    'song', eligible.song,
    'sourceUpdatedAt', eligible.updated_at
  ) order by eligible.identity_id, eligible.source_participant_id), '[]'::jsonb)
  into v_candidates
  from eligible;

  return v_candidates;
end
$fn$;

revoke all on function private.v3_show_qualifier_candidates(uuid)
  from public, anon, authenticated;

create or replace function private.v3_show_qualifier_state(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $fn$
declare
  v_lineup jsonb;
  v_candidates jsonb;
  v_state jsonb;
begin
  v_lineup := private.v3_show_lineup_state_payload(p_show_id);
  v_candidates := private.v3_show_qualifier_candidates(p_show_id);
  v_state := jsonb_build_object(
    'showId', p_show_id,
    'editionId', v_lineup ->> 'editionId',
    'lineupStateVersion', private.v3_show_lineup_state_version(p_show_id),
    'candidates', v_candidates
  );
  return v_state || jsonb_build_object(
    'stateVersion', encode(
      extensions.digest(convert_to(v_state::text, 'UTF8'), 'sha256'),
      'hex'
    )
  );
end
$fn$;

revoke all on function private.v3_show_qualifier_state(uuid)
  from public, anon, authenticated;

create or replace function public.v3_show_qualifier_preflight(
  p_edition_id uuid,
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_state jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  v_state := private.v3_show_qualifier_state(p_show_id);
  if (v_state ->> 'editionId')::uuid is distinct from p_edition_id then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  return v_state || jsonb_build_object(
    'ok', true,
    'candidateCount', jsonb_array_length(v_state -> 'candidates'),
    'serverTime', now()
  );
end
$fn$;

revoke all on function public.v3_show_qualifier_preflight(uuid, uuid)
  from public, anon;
grant execute on function public.v3_show_qualifier_preflight(uuid, uuid)
  to authenticated, service_role;

create or replace function public.v3_execute_show_qualifier_promotion(
  p_edition_id uuid,
  p_show_id uuid,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_state_version text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $fn$
declare
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_candidate jsonb;
  v_target_id uuid;
  v_promoted jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_before_lineup_version text;
  v_after_lineup_version text;
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
  select * into v_show from public.shows where id = p_show_id;
  if v_show.id is null or v_show.edition_id is distinct from p_edition_id
     or v_show.kind not in ('grand-final', 'final') then
    raise exception using errcode = '42501', message = 'SCOPE_MISMATCH';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.lineup.promote.qualifiers',
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'showId', p_show_id,
      'subjectType', 'show',
      'subjectId', p_show_id
    ),
    jsonb_build_object('expectedStateVersion', p_expected_state_version)
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform 1 from public.shows s where s.id = p_show_id for update;
  perform 1
  from public.participants p
  where p.edition_id = p_edition_id
  order by p.id
  for update;

  v_before := private.v3_show_qualifier_state(p_show_id);
  if (v_before ->> 'stateVersion') is distinct from p_expected_state_version then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT',
      detail = jsonb_build_object(
        'expectedStateVersion', p_expected_state_version,
        'currentStateVersion', v_before ->> 'stateVersion'
      )::text;
  end if;
  v_before_lineup_version := v_before ->> 'lineupStateVersion';

  for v_candidate in
    select value from jsonb_array_elements(v_before -> 'candidates') candidate(value)
  loop
    insert into public.participants(
      edition_id, show_id, country_id, contest_entity_id,
      running_order, running_order_allocation, semi_final, artist, song
    ) values (
      p_edition_id,
      p_show_id,
      nullif(v_candidate ->> 'countryId', '')::uuid,
      nullif(v_candidate ->> 'contestEntityId', '')::uuid,
      null,
      null,
      v_show.kind,
      nullif(v_candidate ->> 'artist', ''),
      nullif(v_candidate ->> 'song', '')
    ) returning id into v_target_id;

    v_count := v_count + 1;
    v_promoted := v_promoted || jsonb_build_array(jsonb_build_object(
      'sourceParticipantId', v_candidate ->> 'sourceParticipantId',
      'targetParticipantId', v_target_id,
      'countryId', v_candidate ->> 'countryId',
      'contestEntityId', v_candidate ->> 'contestEntityId'
    ));
  end loop;

  v_after := private.v3_show_lineup_state_payload(p_show_id);
  v_after_lineup_version := private.v3_show_lineup_state_version(p_show_id);
  perform private.v3_emit_lineup_changed(
    v_operation_id, p_edition_id, p_show_id, 'qualifiers_promoted',
    v_before_lineup_version, v_after_lineup_version,
    jsonb_build_object('promotedCount', v_count, 'provenance', v_promoted)
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'showId', p_show_id,
    'showName', v_show.name,
    'action', 'promote_qualifiers',
    'lineupStage', v_show.lineup_stage,
    'stateVersion', v_after_lineup_version,
    'participantCount', jsonb_array_length(v_after -> 'participants'),
    'promotedCount', v_count,
    'provenance', v_promoted,
    'changed', v_count > 0
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$fn$;

revoke all on function public.v3_execute_show_qualifier_promotion(
  uuid, uuid, uuid, text, text, uuid
) from public, anon;
grant execute on function public.v3_execute_show_qualifier_promotion(
  uuid, uuid, uuid, text, text, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
