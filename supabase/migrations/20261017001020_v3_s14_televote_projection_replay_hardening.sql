begin;

-- System V3 / S14 hardening: published Televote projection replacement must be
-- operationally idempotent as well as semantically idempotent. A healthy exact
-- replay is a no-op. A drifted materialized projection is repaired atomically,
-- while genuine replacements suppress the legacy per-row result-sync trigger
-- and perform exactly one canonical show reconciliation afterwards.

create or replace function private.v3_televote_projection_snapshot(p_show_id uuid)
returns table (
  payload_fingerprint text,
  row_count integer,
  points_total bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $snapshot$
  with normalized as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'country_id', vote.country_id,
          'contest_entity_id', vote.contest_entity_id,
          'points', vote.points
        )
        order by coalesce(vote.country_id::text, vote.contest_entity_id::text)
      ),
      '[]'::jsonb
    ) as rows,
    count(*)::integer as row_count,
    coalesce(sum(vote.points), 0)::bigint as points_total
    from public.televote_votes vote
    where vote.show_id = p_show_id
  )
  select
    encode(extensions.digest(convert_to(normalized.rows::text, 'UTF8'), 'sha256'), 'hex'),
    normalized.row_count,
    normalized.points_total
  from normalized;
$snapshot$;

revoke all on function private.v3_televote_projection_snapshot(uuid)
  from public, anon, authenticated;

create or replace function public.sync_results_after_vote_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $sync$
begin
  if tg_table_schema = 'public'
     and tg_table_name = 'televote_votes'
     and coalesce(current_setting('solaris.v3_televote_projection_write', true), '') = '1'
     and coalesce(current_setting('solaris.v3_televote_projection_bulk_replace', true), '') = '1' then
    return coalesce(new, old);
  end if;

  perform public.sync_show_results_from_votes(coalesce(new.show_id, old.show_id));
  if tg_op = 'UPDATE' and new.show_id is distinct from old.show_id then
    perform public.sync_show_results_from_votes(old.show_id);
  end if;
  return coalesce(new, old);
end;
$sync$;

create or replace function private.v3_apply_published_televote_projection(
  p_edition_id uuid,
  p_show_id uuid,
  p_source_type text,
  p_source_id text,
  p_source_version integer,
  p_source_published_at timestamptz,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $apply$
declare
  v_show_edition uuid;
  v_participant_count integer := 0;
  v_row_count integer := 0;
  v_distinct_identity_count integer := 0;
  v_points_total bigint := 0;
  v_rows jsonb := '[]'::jsonb;
  v_fingerprint text;
  v_existing private.v3_televote_result_projection_sources%rowtype;
  v_current_fingerprint text;
  v_current_row_count integer := 0;
  v_current_points_total bigint := 0;
  v_revision bigint := 1;
  v_replayed boolean := false;
  v_repaired boolean := false;
begin
  if p_edition_id is null or p_show_id is null then
    raise exception 'Televote projection requires edition and show identity'
      using errcode = '22023';
  end if;
  if p_source_type not in ('round', 'combined')
     or nullif(btrim(coalesce(p_source_id, '')), '') is null
     or length(p_source_id) > 160
     or p_source_version is null
     or p_source_version < 1
     or p_source_published_at is null then
    raise exception 'Televote projection source identity is invalid'
      using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_rows, 'null'::jsonb)) <> 'array'
     or jsonb_array_length(p_rows) not between 1 and 500
     or pg_column_size(p_rows) > 65536 then
    raise exception 'Televote projection rows must be a bounded non-empty array'
      using errcode = '22023';
  end if;

  select show_row.edition_id
  into v_show_edition
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_show_edition is null then
    raise exception 'Televote projection show does not exist'
      using errcode = 'P0002';
  end if;
  if v_show_edition is distinct from p_edition_id then
    raise exception 'Televote projection show belongs to a different edition'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) item
    where jsonb_typeof(item) <> 'object'
       or item - array['country_id', 'contest_entity_id', 'points']::text[] <> '{}'::jsonb
       or (
         nullif(item ->> 'country_id', '') is null
         and nullif(item ->> 'contest_entity_id', '') is null
       )
       or coalesce(item ->> 'points', '') !~ '^[0-9]+$'
       or (item ->> 'points')::numeric > 2147483647
  ) then
    raise exception 'Televote projection row is invalid'
      using errcode = '22023';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'country_id', normalized.country_id,
        'contest_entity_id', normalized.contest_entity_id,
        'points', normalized.points
      )
      order by coalesce(normalized.country_id::text, normalized.contest_entity_id::text)
    ),
    '[]'::jsonb
  ),
  count(*)::integer,
  count(distinct coalesce(normalized.country_id, normalized.contest_entity_id))::integer,
  coalesce(sum(normalized.points), 0)::bigint
  into v_rows, v_row_count, v_distinct_identity_count, v_points_total
  from (
    select
      nullif(item ->> 'country_id', '')::uuid as country_id,
      nullif(item ->> 'contest_entity_id', '')::uuid as contest_entity_id,
      (item ->> 'points')::integer as points
    from jsonb_array_elements(p_rows) item
  ) normalized;

  if v_row_count <> v_distinct_identity_count then
    raise exception 'Televote projection contains duplicate recipient identities'
      using errcode = '23505';
  end if;

  select count(*)::integer
  into v_participant_count
  from public.participants participant
  where participant.show_id = p_show_id
    and coalesce(participant.participation_status, 'confirmed') = 'confirmed';

  if v_participant_count < 1 or v_row_count <> v_participant_count then
    raise exception 'Published Televote lineup does not exactly match the Solaris show'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(v_rows)
      as incoming(country_id uuid, contest_entity_id uuid, points integer)
    where not exists (
      select 1
      from public.participants participant
      where participant.show_id = p_show_id
        and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
        and coalesce(participant.country_id, participant.contest_entity_id)
          = coalesce(incoming.country_id, incoming.contest_entity_id)
        and (
          incoming.country_id is null
          or participant.country_id is not distinct from incoming.country_id
        )
        and (
          incoming.contest_entity_id is null
          or participant.contest_entity_id is not distinct from incoming.contest_entity_id
        )
    )
  ) then
    raise exception 'Published Televote recipient is outside the bound Solaris show lineup'
      using errcode = '23514';
  end if;

  v_fingerprint := encode(
    extensions.digest(convert_to(v_rows::text, 'UTF8'), 'sha256'),
    'hex'
  );

  perform pg_advisory_xact_lock(
    hashtextextended('v3-televote-result-projection:' || p_show_id::text, 0)
  );

  select source.*
  into v_existing
  from private.v3_televote_result_projection_sources source
  where source.show_id = p_show_id
  for update;

  if v_existing.show_id is not null then
    if v_existing.source_type = p_source_type
       and v_existing.source_id = p_source_id then
      if p_source_version < v_existing.source_version then
        raise exception 'STALE_VERSION: published Televote source version is older than the canonical projection'
          using errcode = '40001';
      elsif p_source_version = v_existing.source_version then
        if v_fingerprint is distinct from v_existing.payload_fingerprint then
          raise exception 'IDEMPOTENCY_CONFLICT: published Televote source version changed semantics'
            using errcode = 'P0001';
        end if;

        select snapshot.payload_fingerprint, snapshot.row_count, snapshot.points_total
        into v_current_fingerprint, v_current_row_count, v_current_points_total
        from private.v3_televote_projection_snapshot(p_show_id) snapshot;

        v_revision := v_existing.projection_revision;
        v_replayed := true;

        if v_current_fingerprint = v_existing.payload_fingerprint
           and v_current_row_count = v_existing.row_count
           and v_current_points_total = v_existing.points_total then
          return jsonb_build_object(
            'ok', true,
            'showId', p_show_id,
            'sourceType', p_source_type,
            'sourceId', p_source_id,
            'sourceVersion', p_source_version,
            'projectionRevision', v_revision,
            'rowCount', v_existing.row_count,
            'pointsTotal', v_existing.points_total,
            'replayed', true,
            'repaired', false
          );
        end if;

        v_repaired := true;
      else
        if p_source_published_at < v_existing.source_published_at then
          raise exception 'STALE_VERSION: newer source version has an older publication epoch'
            using errcode = '40001';
        end if;
        v_revision := v_existing.projection_revision + 1;
      end if;
    else
      if p_source_published_at <= v_existing.source_published_at then
        raise exception 'STALE_VERSION: an older published Televote source cannot replace the canonical projection'
          using errcode = '40001';
      end if;
      v_revision := v_existing.projection_revision + 1;
    end if;
  end if;

  perform set_config('solaris.v3_televote_projection_write', '1', true);
  perform set_config('solaris.v3_televote_projection_bulk_replace', '1', true);

  delete from public.televote_votes vote
  where vote.show_id = p_show_id;

  insert into public.televote_votes (
    edition_id,
    show_id,
    country_id,
    contest_entity_id,
    points
  )
  select
    p_edition_id,
    p_show_id,
    incoming.country_id,
    incoming.contest_entity_id,
    incoming.points
  from jsonb_to_recordset(v_rows)
    as incoming(country_id uuid, contest_entity_id uuid, points integer);

  perform set_config('solaris.v3_televote_projection_bulk_replace', '0', true);

  insert into private.v3_televote_result_projection_sources (
    show_id,
    edition_id,
    source_type,
    source_id,
    source_version,
    source_published_at,
    payload_fingerprint,
    row_count,
    points_total,
    projection_revision,
    synced_at
  ) values (
    p_show_id,
    p_edition_id,
    p_source_type,
    p_source_id,
    p_source_version,
    p_source_published_at,
    v_fingerprint,
    v_row_count,
    v_points_total,
    v_revision,
    now()
  )
  on conflict (show_id) do update
  set edition_id = excluded.edition_id,
      source_type = excluded.source_type,
      source_id = excluded.source_id,
      source_version = excluded.source_version,
      source_published_at = excluded.source_published_at,
      payload_fingerprint = excluded.payload_fingerprint,
      row_count = excluded.row_count,
      points_total = excluded.points_total,
      projection_revision = excluded.projection_revision,
      synced_at = excluded.synced_at;

  perform public.sync_show_results_from_votes(p_show_id);

  return jsonb_build_object(
    'ok', true,
    'showId', p_show_id,
    'sourceType', p_source_type,
    'sourceId', p_source_id,
    'sourceVersion', p_source_version,
    'projectionRevision', v_revision,
    'rowCount', v_row_count,
    'pointsTotal', v_points_total,
    'replayed', v_replayed,
    'repaired', v_repaired
  );
end
$apply$;

revoke all on function private.v3_apply_published_televote_projection(
  uuid, uuid, text, text, integer, timestamptz, jsonb
) from public, anon, authenticated;

commit;
