begin;

select public.v3_register_migration_contract(
  'v3.results.televote-sync-audit-rpc',
  1,
  'forward_fix_only',
  false,
  null,
  'Record published Televote synchronization evidence without granting direct integration-event SELECT access.'
);

create or replace function public.v3_record_televote_sync_event(
  p_source_type text,
  p_source_id text,
  p_show_id uuid,
  p_payload jsonb,
  p_payload_hash text,
  p_status text,
  p_last_error text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, televoting
as $$
declare
  v_version integer;
  v_source_count bigint;
  v_matched_count bigint;
  v_studio_count bigint;
  v_orphan_count bigint;
  v_event_type text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'Televote synchronization audit requires service_role'
      using errcode = '42501';
  end if;

  if p_source_type not in ('round', 'combined')
     or nullif(btrim(p_source_id), '') is null
     or p_status not in ('completed', 'failed', 'skipped')
     or p_payload is null
     or jsonb_typeof(p_payload) <> 'object'
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid Televote synchronization audit payload';
  end if;

  v_event_type := case p_source_type
    when 'round' then 'round.results.imported'
    else 'combined.results.imported'
  end;

  if p_status = 'completed' then
    if p_show_id is null
       or p_payload #>> '{outcome,ok}' is distinct from 'true'
       or p_payload #>> '{outcome,status}' is distinct from 'synced'
       or p_payload #>> '{outcome,sourceType}' is distinct from p_source_type
       or p_payload #>> '{outcome,sourceId}' is distinct from p_source_id
       or p_payload #>> '{outcome,showId}' is distinct from p_show_id::text
       or p_last_error is not null then
      raise exception 'Completed sync receipt is inconsistent with its outcome';
    end if;

    if p_source_type = 'round' then
      select r.calculation_version
      into v_version
      from televoting.rounds r
      join public.televoting_round_bindings b
        on b.remote_round_id = r.id::text
      where r.id::text = p_source_id
        and r.results_status = 'published'
        and b.show_id = p_show_id
        and b.frozen_at is not null;

      if v_version is null or v_version < 1 then
        raise exception 'Published round and frozen show binding not verified';
      end if;

      select count(*),
             count(sr.id)
      into v_source_count, v_matched_count
      from televoting.round_results rr
      left join public.countries c
        on upper(c.short_code) = upper(rr.country_code)
      left join public.results sr
        on sr.country_id = c.id
       and sr.show_id = p_show_id
       and sr.televote_points = rr.final_points
      where rr.round_id::text = p_source_id
        and rr.calculation_version = v_version;

    else
      select a.calculation_version
      into v_version
      from televoting.televote_aggregations a
      where a.id::text = p_source_id
        and a.status = 'published'
        and not a.results_outdated;

      if v_version is null or v_version < 1 then
        raise exception 'Published Combined Televote source not verified';
      end if;

      -- Every enabled voting *round* source must point at the same frozen
      -- Solaris show. Enabled activity/non-round sources may have no round ID.
      if not exists (
        select 1
        from televoting.televote_aggregation_sources src
        where src.aggregation_id::text = p_source_id
          and src.enabled
          and src.source_round_id is not null
      ) or exists (
        select 1
        from televoting.televote_aggregation_sources src
        left join public.televoting_round_bindings b
          on b.remote_round_id = src.source_round_id::text
        where src.aggregation_id::text = p_source_id
          and src.enabled
          and src.source_round_id is not null
          and (
            b.remote_round_id is null
            or b.show_id is distinct from p_show_id
            or b.frozen_at is null
          )
      ) then
        raise exception 'Not every enabled Combined round source is frozen to this show';
      end if;

      select count(*),
             count(sr.id)
      into v_source_count, v_matched_count
      from televoting.combined_televote_results rr
      left join public.countries c
        on upper(c.short_code) = upper(rr.country_code)
      left join public.results sr
        on sr.country_id = c.id
       and sr.show_id = p_show_id
       and sr.televote_points = rr.final_combined_points
      where rr.aggregation_id::text = p_source_id
        and rr.calculation_version = v_version;
    end if;

    -- Preserve historical Results rows for withdrawn/disqualified participants.
    -- Only the active confirmed lineup belongs in the published-source equality
    -- proof, matching the canonical Results reconciliation projection.
    select count(*) into v_studio_count
    from public.results result_row
    where result_row.show_id = p_show_id
      and exists (
        select 1
        from public.participants participant
        where participant.show_id = p_show_id
          and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
          and (
            (
              participant.country_id is not null
              and result_row.country_id = participant.country_id
            )
            or (
              participant.country_id is null
              and participant.contest_entity_id is not null
              and result_row.contest_entity_id = participant.contest_entity_id
            )
          )
      );

    -- A truly unowned Results row is still a failure. Inactive historical
    -- participants remain linked to a real participant and are not orphans.
    select count(*) into v_orphan_count
    from public.results result_row
    where result_row.show_id = p_show_id
      and not exists (
        select 1
        from public.participants participant
        where participant.show_id = p_show_id
          and (
            (
              participant.country_id is not null
              and result_row.country_id = participant.country_id
            )
            or (
              participant.country_id is null
              and participant.contest_entity_id is not null
              and result_row.contest_entity_id = participant.contest_entity_id
            )
          )
      );

    if v_source_count = 0
       or v_source_count <> v_matched_count
       or v_source_count <> v_studio_count
       or v_orphan_count <> 0 then
      raise exception
        'Cannot certify Televote sync: source %, matched %, active Studio %, orphans %',
        v_source_count, v_matched_count, v_studio_count, v_orphan_count;
    end if;
  end if;

  insert into public.integration_events (
    service, event_type, entity_type, entity_id, remote_id,
    payload, payload_hash, status, attempts, last_error,
    completed_at, updated_at
  )
  values (
    'televoting', v_event_type, 'show', p_show_id, p_source_id,
    p_payload, p_payload_hash, p_status, 1, p_last_error,
    case when p_status = 'completed' then now() else null end,
    now()
  )
  -- A successful receipt is immutable. Identical retries are no-ops; any
  -- different semantics under the same dedupe identity are rejected.
  on conflict (service, event_type, payload_hash) do nothing;

  if exists (
    select 1
    from public.integration_events event
    where event.service = 'televoting'
      and event.event_type = v_event_type
      and event.payload_hash = p_payload_hash
      and (
        event.entity_type is distinct from 'show'
        or event.entity_id is distinct from p_show_id
        or event.remote_id is distinct from p_source_id
        or event.payload is distinct from p_payload
        or event.status is distinct from p_status
        or event.last_error is distinct from p_last_error
      )
  ) then
    raise exception 'IDEMPOTENCY_CONFLICT: Televote sync receipt changed semantics'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.v3_record_televote_sync_event(
  text, text, uuid, jsonb, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.v3_record_televote_sync_event(
  text, text, uuid, jsonb, text, text, text
) to service_role;

do $$
begin
  if not has_function_privilege(
    'service_role',
    'public.v3_record_televote_sync_event(text,text,uuid,jsonb,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'public.v3_record_televote_sync_event(text,text,uuid,jsonb,text,text,text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.v3_record_televote_sync_event(text,text,uuid,jsonb,text,text,text)',
    'EXECUTE'
  ) then
    raise exception 'Televote sync audit RPC permission contract failed';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
