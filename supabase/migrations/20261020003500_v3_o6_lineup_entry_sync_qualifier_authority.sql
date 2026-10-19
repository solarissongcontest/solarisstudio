begin;

-- V3 O6 / #598 final backend authority wave for the current line-up workspace:
-- entry metadata edits, edition-wide artist/song sync and qualifier promotion.
select public.v3_register_migration_contract(
  'v3.o6.lineup-entry-sync-qualifier-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern line-up entry metadata edits, deterministic edition detail sync and qualifier promotion with CAS, idempotency, receipts and provenance.'
);

create or replace function private.v3_edition_entry_detail_snapshot(
  p_edition_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $snapshot$
  with rows as (
    select
      p.id,
      p.show_id,
      p.country_id,
      p.contest_entity_id,
      p.artist,
      p.song,
      p.updated_at
    from public.participants p
    where p.edition_id = p_edition_id
    order by p.id
  ),
  materialized as (
    select jsonb_build_object(
      'editionId', p_edition_id,
      'participants', coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', rows.id,
            'showId', rows.show_id,
            'countryId', rows.country_id,
            'contestEntityId', rows.contest_entity_id,
            'artist', rows.artist,
            'song', rows.song,
            'updatedAt', rows.updated_at
          ) order by rows.id
        ),
        '[]'::jsonb
      )
    ) as snapshot
    from rows
  )
  select materialized.snapshot || jsonb_build_object(
    'stateVersion',
    encode(
      extensions.digest(
        convert_to(materialized.snapshot::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    )
  )
  from materialized
$snapshot$;

revoke all on function private.v3_edition_entry_detail_snapshot(uuid)
  from public, anon, authenticated;

create or replace function private.v3_entry_detail_sync_targets(
  p_edition_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $targets$
  with source_ranked as (
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
    select * from source_ranked where rank = 1
  ),
  target_rows as (
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
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'participantId', target_rows.participant_id,
        'sourceParticipantId', target_rows.source_participant_id,
        'artist', target_rows.artist,
        'song', target_rows.song
      ) order by target_rows.participant_id
    ),
    '[]'::jsonb
  )
  from target_rows
$targets$;

revoke all on function private.v3_entry_detail_sync_targets(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_entry_detail_sync_preflight(
  p_edition_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_snapshot jsonb;
  v_targets jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', p_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_snapshot := private.v3_edition_entry_detail_snapshot(p_edition_id);
  v_targets := private.v3_entry_detail_sync_targets(p_edition_id);

  return jsonb_build_object(
    'editionId', p_edition_id,
    'stateVersion', v_snapshot ->> 'stateVersion',
    'targetCount', jsonb_array_length(v_targets),
    'targets', v_targets
  );
end
$preflight$;

revoke all on function public.studio2_entry_detail_sync_preflight(uuid)
  from public, anon;
grant execute on function public.studio2_entry_detail_sync_preflight(uuid)
  to authenticated, service_role;

create or replace function public.studio2_update_show_lineup_entry(
  p_operation_id uuid,
  p_idempotency_key text,
  p_show_id uuid,
  p_participant_id uuid,
  p_expected_state_version text,
  p_artist text,
  p_song text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $update_entry$
declare
  v_before jsonb;
  v_after jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_edition_id uuid;
  v_previous_artist text;
  v_previous_song text;
  v_result jsonb;
begin
  v_before := private.v3_show_lineup_snapshot(p_show_id);
  if v_before is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  v_edition_id := (v_before ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;
  if p_participant_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.lineup.entry.update',
    'R2',
    jsonb_build_object(
      'editionId', v_edition_id,
      'showId', p_show_id,
      'subjectType', 'participant',
      'subjectId', p_participant_id
    ),
    jsonb_build_object(
      'expectedStateVersion', p_expected_state_version,
      'participantId', p_participant_id,
      'artist', nullif(btrim(coalesce(p_artist, '')), ''),
      'song', nullif(btrim(coalesce(p_song, '')), '')
    )
  );

  v_operation_id := (v_claim ->> 'operationId')::uuid;
  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return public.studio2_reconcile_operation(v_operation_id)
      || jsonb_build_object('replayed', true);
  end if;

  perform private.v3_lock_show_lineup(p_show_id);
  v_before := private.v3_assert_show_lineup_version(
    p_show_id,
    p_expected_state_version
  );

  select p.artist, p.song
  into v_previous_artist, v_previous_song
  from public.participants p
  where p.id = p_participant_id
    and p.show_id = p_show_id
    and p.edition_id = v_edition_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;

  update public.participants p
  set artist = nullif(btrim(coalesce(p_artist, '')), ''),
      song = nullif(btrim(coalesce(p_song, '')), ''),
      updated_at = now()
  where p.id = p_participant_id
    and p.show_id = p_show_id
    and p.edition_id = v_edition_id;

  v_after := private.v3_show_lineup_snapshot(p_show_id);
  perform private.v3_emit_show_lineup_event(
    v_operation_id,
    'show.lineup_entry_updated',
    p_show_id,
    v_edition_id,
    v_before ->> 'stateVersion',
    v_after ->> 'stateVersion',
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
    'editionId', v_edition_id,
    'showId', p_show_id,
    'participantId', p_participant_id,
    'stateVersion', v_after ->> 'stateVersion'
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$update_entry$;

revoke all on function public.studio2_update_show_lineup_entry(
  uuid, text, uuid, uuid, text, text, text, uuid
) from public, anon;
grant execute on function public.studio2_update_show_lineup_entry(
  uuid, text, uuid, uuid, text, text, text, uuid
) to authenticated, service_role;

create or replace function public.studio2_sync_edition_entry_details(
  p_operation_id uuid,
  p_idempotency_key text,
  p_edition_id uuid,
  p_expected_state_version text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $sync_details$
declare
  v_before jsonb;
  v_after jsonb;
  v_targets jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_result jsonb;
  v_affected integer := 0;
  v_event_version bigint;
begin
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

  v_before := private.v3_edition_entry_detail_snapshot(p_edition_id);
  if (v_before ->> 'stateVersion') is distinct from p_expected_state_version then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      detail = jsonb_build_object(
        'expectedStateVersion', p_expected_state_version,
        'currentStateVersion', v_before ->> 'stateVersion'
      )::text;
  end if;

  v_targets := private.v3_entry_detail_sync_targets(p_edition_id);

  with source_ranked as (
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
    select * from source_ranked where rank = 1
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
  v_after := private.v3_edition_entry_detail_snapshot(p_edition_id);
  v_event_version := hashtextextended(v_after ->> 'stateVersion', 0)
    & 9223372036854775807::bigint;

  perform private.v3_emit_domain_event(
    'entry.details_synced',
    'edition',
    p_edition_id::text,
    v_event_version,
    v_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'beforeStateVersion', v_before ->> 'stateVersion',
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
    'affectedCount', v_affected,
    'stateVersion', v_after ->> 'stateVersion'
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$sync_details$;

revoke all on function public.studio2_sync_edition_entry_details(
  uuid, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_sync_edition_entry_details(
  uuid, text, uuid, text, uuid
) to authenticated, service_role;

create or replace function private.v3_show_qualifier_candidates(
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $candidates$
declare
  v_edition_id uuid;
  v_kind text;
  v_candidates jsonb;
begin
  select s.edition_id, s.kind
  into v_edition_id, v_kind
  from public.shows s
  where s.id = p_show_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  if v_kind not in ('grand-final', 'final') then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  with target_identity as (
    select coalesce(p.country_id, p.contest_entity_id, p.id) as identity_id
    from public.participants p
    where p.show_id = p_show_id
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
    select ranked.*
    from ranked
    where ranked.rank = 1
      and not exists (
        select 1 from target_identity target
        where target.identity_id = ranked.identity_id
      )
    order by ranked.identity_id, ranked.source_participant_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'sourceParticipantId', eligible.source_participant_id,
        'countryId', eligible.country_id,
        'contestEntityId', eligible.contest_entity_id,
        'artist', eligible.artist,
        'song', eligible.song,
        'sourceUpdatedAt', eligible.updated_at
      ) order by eligible.identity_id, eligible.source_participant_id
    ),
    '[]'::jsonb
  )
  into v_candidates
  from eligible;

  return v_candidates;
end
$candidates$;

revoke all on function private.v3_show_qualifier_candidates(uuid)
  from public, anon, authenticated;

create or replace function private.v3_show_qualifier_snapshot(
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $snapshot$
declare
  v_lineup jsonb;
  v_candidates jsonb;
  v_materialized jsonb;
begin
  v_lineup := private.v3_show_lineup_snapshot(p_show_id);
  if v_lineup is null then
    raise exception using errcode = 'P0002', message = 'VALIDATION';
  end if;
  v_candidates := private.v3_show_qualifier_candidates(p_show_id);
  v_materialized := jsonb_build_object(
    'showId', p_show_id,
    'editionId', v_lineup ->> 'editionId',
    'lineupStateVersion', v_lineup ->> 'stateVersion',
    'candidates', v_candidates
  );
  return v_materialized || jsonb_build_object(
    'stateVersion',
    encode(
      extensions.digest(convert_to(v_materialized::text, 'UTF8'), 'sha256'),
      'hex'
    )
  );
end
$snapshot$;

revoke all on function private.v3_show_qualifier_snapshot(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_show_qualifier_preflight(
  p_show_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $preflight$
declare
  v_snapshot jsonb;
  v_edition_id uuid;
begin
  v_snapshot := private.v3_show_qualifier_snapshot(p_show_id);
  v_edition_id := (v_snapshot ->> 'editionId')::uuid;

  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  return v_snapshot || jsonb_build_object(
    'candidateCount', jsonb_array_length(v_snapshot -> 'candidates')
  );
end
$preflight$;

revoke all on function public.studio2_show_qualifier_preflight(uuid)
  from public, anon;
grant execute on function public.studio2_show_qualifier_preflight(uuid)
  to authenticated, service_role;

create or replace function public.studio2_promote_show_qualifiers(
  p_operation_id uuid,
  p_idempotency_key text,
  p_show_id uuid,
  p_expected_state_version text,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $promote$
declare
  v_before jsonb;
  v_after jsonb;
  v_claim jsonb;
  v_operation_id uuid;
  v_edition_id uuid;
  v_show_kind text;
  v_candidate jsonb;
  v_target_id uuid;
  v_promoted jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_result jsonb;
begin
  v_before := private.v3_show_qualifier_snapshot(p_show_id);
  v_edition_id := (v_before ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'show.qualifiers.promote',
    'R2',
    jsonb_build_object(
      'editionId', v_edition_id,
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

  perform private.v3_lock_show_lineup(p_show_id);
  perform 1
  from public.participants p
  where p.edition_id = v_edition_id
  order by p.id
  for update;

  v_before := private.v3_show_qualifier_snapshot(p_show_id);
  if (v_before ->> 'stateVersion') is distinct from p_expected_state_version then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      detail = jsonb_build_object(
        'expectedStateVersion', p_expected_state_version,
        'currentStateVersion', v_before ->> 'stateVersion'
      )::text;
  end if;

  select s.kind
  into v_show_kind
  from public.shows s
  where s.id = p_show_id
    and s.edition_id = v_edition_id;

  for v_candidate in
    select value
    from jsonb_array_elements(v_before -> 'candidates') candidate(value)
  loop
    insert into public.participants (
      edition_id,
      show_id,
      country_id,
      contest_entity_id,
      running_order,
      running_order_allocation,
      semi_final,
      artist,
      song
    ) values (
      v_edition_id,
      p_show_id,
      nullif(v_candidate ->> 'countryId', '')::uuid,
      nullif(v_candidate ->> 'contestEntityId', '')::uuid,
      null,
      null,
      coalesce(v_show_kind, 'final'),
      nullif(v_candidate ->> 'artist', ''),
      nullif(v_candidate ->> 'song', '')
    )
    returning id into v_target_id;

    v_count := v_count + 1;
    v_promoted := v_promoted || jsonb_build_array(
      jsonb_build_object(
        'sourceParticipantId', v_candidate ->> 'sourceParticipantId',
        'targetParticipantId', v_target_id,
        'countryId', v_candidate ->> 'countryId',
        'contestEntityId', v_candidate ->> 'contestEntityId'
      )
    );
  end loop;

  v_after := private.v3_show_qualifier_snapshot(p_show_id);
  perform private.v3_emit_show_lineup_event(
    v_operation_id,
    'show.qualifiers_promoted',
    p_show_id,
    v_edition_id,
    v_before ->> 'stateVersion',
    v_after ->> 'stateVersion',
    jsonb_build_object(
      'promotedCount', v_count,
      'provenance', v_promoted
    )
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', v_operation_id,
    'editionId', v_edition_id,
    'showId', p_show_id,
    'promotedCount', v_count,
    'provenance', v_promoted,
    'stateVersion', v_after ->> 'stateVersion'
  );
  perform private.studio2_complete_operation(v_operation_id, v_result);
  return public.studio2_reconcile_operation(v_operation_id)
    || jsonb_build_object('replayed', false);
end
$promote$;

revoke all on function public.studio2_promote_show_qualifiers(
  uuid, text, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_promote_show_qualifiers(
  uuid, text, uuid, text, uuid
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
