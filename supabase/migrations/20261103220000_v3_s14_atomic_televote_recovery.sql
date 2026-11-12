begin;

select public.v3_register_migration_contract(
  'v3.results.atomic-televote-recovery',
  1, 'forward_fix_only', false, null,
  'Recover an already-published Televote through one source-authoritative, show-serialized, audited transaction.'
);

create or replace function public.v3_reconcile_published_televote(
  p_source_type text,
  p_source_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, extensions
as $recover$
declare
  v_show_id uuid;
  v_edition_id uuid;
  v_binding_count integer := 0;
  v_round_count integer := 0;
  v_target_count integer := 0;
  v_round_ids text[];
  v_frozen_count integer := 0;
  v_show public.shows%rowtype;
  v_result jsonb;
  v_source private.v3_televote_result_projection_sources%rowtype;
  v_payload jsonb;
  v_hash text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Atomic Televote recovery requires server-only service_role'
      using errcode = '42501';
  end if;
  if p_source_id is null or p_source_type not in ('round', 'combined') then
    raise exception 'Invalid Televote recovery source identity'
      using errcode = '22023';
  end if;

  if p_source_type = 'round' then
    select binding.show_id, binding.edition_id
    into v_show_id, v_edition_id
    from public.televoting_round_bindings binding
    where binding.remote_round_id = p_source_id::text;
    v_round_ids := array[p_source_id::text];
  else
    -- Ignore enabled non-round sources (such as activity components). Every
    -- enabled voting round must be bound to the same target.
    with round_sources as (
      select distinct src.source_round_id::text as remote_round_id
      from televoting.televote_aggregation_sources src
      where src.aggregation_id = p_source_id
        and src.enabled
        and src.source_round_id is not null
    ), bound as (
      select src.remote_round_id, binding.edition_id, binding.show_id
      from round_sources src
      left join public.televoting_round_bindings binding
        on binding.remote_round_id = src.remote_round_id
    )
    select
      count(*)::integer,
      count(*) filter (where bound.show_id is not null)::integer,
      count(distinct bound.edition_id::text || ':' || bound.show_id::text)
        filter (where bound.show_id is not null)::integer,
      min(bound.show_id::text) filter (where bound.show_id is not null)::uuid,
      min(bound.edition_id::text) filter (where bound.show_id is not null)::uuid,
      coalesce(array_agg(bound.remote_round_id order by bound.remote_round_id), array[]::text[])
    into v_round_count, v_binding_count, v_target_count,
      v_show_id, v_edition_id, v_round_ids
    from bound;

    if v_round_count < 1
       or v_binding_count <> v_round_count
       or v_target_count <> 1 then
      raise exception 'Every enabled Combined voting round must bind to one Solaris show'
        using errcode = '23514';
    end if;
  end if;

  if v_show_id is null or v_edition_id is null then
    raise exception 'Televote source is not bound to a Solaris show'
      using errcode = '23514';
  end if;

  -- Serialize with the governed publication RPC, which takes the show-row
  -- lock before the per-show Results advisory lock.
  select * into v_show from public.shows
  where id = v_show_id
  for update;
  if v_show.id is null or v_show.edition_id is distinct from v_edition_id then
    raise exception 'Televote binding resolved a missing or mismatched Solaris show'
      using errcode = '23514';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended('studio2-results:' || v_show_id::text, 0)
  );
  if coalesce(v_show.published, false)
     and private.studio2_publication_has_outcomes(v_show.publication_config) then
    raise exception 'Cannot resynchronize publicly released Solaris outcomes'
      using errcode = '55000';
  end if;
  if exists (
    select 1 from public.studio2_result_operations op
    where op.show_id = v_show_id and op.calculation_version > 0
  ) or exists (
    select 1 from private.v3_result_versions version
    where version.show_id = v_show_id
  ) then
    raise exception 'Results calculation already started; use governed recalculation instead of Televote recovery'
      using errcode = '55000';
  end if;

  if p_source_type = 'round' then
    v_result := private.v3_sync_published_televote_round(p_source_id);
  else
    v_result := private.v3_sync_published_televote_aggregation(p_source_id);
  end if;
  if not coalesce((v_result ->> 'ok')::boolean, false) then
    raise exception 'Canonical published Televote projection rejected the source: %',
      coalesce(v_result ->> 'status', 'unknown') using errcode = '55000';
  end if;
  if v_result ->> 'showId' is distinct from v_show_id::text then
    raise exception 'Canonical Televote projection resolved another Solaris show'
      using errcode = '23514';
  end if;

  -- A healthy source-projection replay may be a no-op. Explicit recovery also
  -- repairs any legacy application-side drift in the mutable Results rows.
  -- This does not advance the governed Results calculation version.
  perform public.sync_show_results_from_votes(v_show_id);

  update public.televoting_round_bindings binding
  set frozen_at = coalesce(binding.frozen_at, now()),
      updated_at = now()
  where binding.remote_round_id = any(v_round_ids)
    and binding.show_id = v_show_id
    and binding.edition_id = v_edition_id;
  get diagnostics v_frozen_count = row_count;
  if v_frozen_count <> cardinality(v_round_ids) then
    raise exception 'Not every Televote source binding was frozen atomically'
      using errcode = '23514';
  end if;

  select source.* into v_source
  from private.v3_televote_result_projection_sources source
  where source.show_id = v_show_id;
  if v_source.show_id is null
     or v_source.source_type is distinct from p_source_type
     or v_source.source_id is distinct from p_source_id::text then
    raise exception 'Canonical Televote source receipt is missing or mismatched'
      using errcode = '23514';
  end if;

  v_payload := jsonb_build_object(
    'outcome', jsonb_build_object(
      'ok', true, 'status', 'synced',
      'sourceType', p_source_type, 'sourceId', p_source_id::text,
      'showId', v_show_id::text, 'imported', v_source.row_count
    ),
    'sourceVersion', v_source.source_version,
    'payloadFingerprint', v_source.payload_fingerprint,
    'rowCount', v_source.row_count,
    'pointsTotal', v_source.points_total
  );
  v_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');
  perform public.v3_record_televote_sync_event(
    p_source_type, p_source_id::text, v_show_id,
    v_payload, v_hash, 'completed', null
  );

  return jsonb_build_object(
    'ok', true,
    'sourceType', p_source_type,
    'sourceId', p_source_id::text,
    'showId', v_show_id::text,
    'editionId', v_edition_id::text,
    'rowCount', v_source.row_count,
    'sourceVersion', v_source.source_version,
    'projectionRevision', v_source.projection_revision,
    'replayed', coalesce((v_result ->> 'replayed')::boolean, false)
  );
end
$recover$;

revoke all on function public.v3_reconcile_published_televote(text,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.v3_reconcile_published_televote(text,uuid)
  to service_role;

notify pgrst, 'reload schema';
commit;
