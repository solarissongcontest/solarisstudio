begin;
-- Forward-only Results repair; preserve already-applied migration history.
select public.v3_register_migration_contract(
  'v3.results.active-identity-and-rank-verification', 1, 'forward_fix_only',
  false, null,
  'Validate active Televote synchronization, preserve withdrawn history and share authoritative ranking with read-only reconciliation.'
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
  v_active_participant_count bigint;
  v_unique_source_count bigint;
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
             count(sr.id),
             count(distinct eligible.country_id)
      into v_source_count, v_matched_count, v_unique_source_count
      from televoting.round_results rr
      left join public.countries c
        on upper(btrim(c.short_code)) = upper(btrim(rr.country_code))
      left join public.participants eligible
        on eligible.show_id = p_show_id
       and eligible.country_id = c.id
       and coalesce(eligible.participation_status, 'confirmed') = 'confirmed'
      left join public.results sr
        on sr.country_id = eligible.country_id
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
             count(sr.id),
             count(distinct eligible.country_id)
      into v_source_count, v_matched_count, v_unique_source_count
      from televoting.combined_televote_results rr
      left join public.countries c
        on upper(btrim(c.short_code)) = upper(btrim(rr.country_code))
      left join public.participants eligible
        on eligible.show_id = p_show_id
       and eligible.country_id = c.id
       and coalesce(eligible.participation_status, 'confirmed') = 'confirmed'
      left join public.results sr
        on sr.country_id = eligible.country_id
       and sr.show_id = p_show_id
       and sr.televote_points = rr.final_combined_points
      where rr.aggregation_id::text = p_source_id
        and rr.calculation_version = v_version;
    end if;

    select count(*) into v_active_participant_count
    from public.participants p
    where p.show_id = p_show_id
      and coalesce(p.participation_status, 'confirmed') = 'confirmed';

    -- Historical inactive Results rows are intentionally excluded from active parity.
    select count(*) into v_studio_count
    from public.results r
    join public.participants p
      on p.show_id = p_show_id
     and coalesce(p.participation_status, 'confirmed') = 'confirmed'
     and ((p.country_id is not null and r.country_id = p.country_id)
       or (p.country_id is null and p.contest_entity_id is not null
           and r.country_id is null and r.contest_entity_id = p.contest_entity_id))
    where r.show_id = p_show_id;

    -- Orphaned and pending/waitlisted Results are not historical exceptions.
    if exists (
      select 1 from public.results r
      where r.show_id = p_show_id
        and not exists (
          select 1 from public.participants p
          where p.show_id = p_show_id
            and coalesce(p.participation_status, 'confirmed')
              in ('confirmed', 'withdrawn', 'disqualified')
            and ((p.country_id is not null and r.country_id = p.country_id)
              or (p.country_id is null and p.contest_entity_id is not null
                  and r.country_id is null and r.contest_entity_id = p.contest_entity_id))
        )
    ) then
      raise exception 'Cannot certify Televote sync: invalid inactive or orphan Results identity';
    end if;

    if v_source_count = 0
       or v_source_count <> v_active_participant_count
       or v_source_count <> v_unique_source_count
       or v_source_count <> v_matched_count
       or v_source_count <> v_studio_count then
      raise exception
        'Cannot certify Televote sync: source %, matched %, Studio %',
        v_source_count, v_matched_count, v_studio_count;
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


-- Canonical rank/score projection, called by both writer and verifier.
create or replace function private.studio2_expected_result_ranks(p_show_id uuid)
returns table (result_id uuid, jury_points integer, televote_points integer,
               total_points integer, final_rank integer)
language plpgsql stable security definer
set search_path = pg_catalog, public, private
as $expected$
declare
  v_config jsonb;
  v_jury_scale integer[];
  v_countback_scale integer[];
  v_top_score integer;
begin
  select coalesce(s.voting_config, '{}'::jsonb) into v_config
  from public.shows s where s.id = p_show_id;
  select coalesce(array_agg(value::integer order by ord), array[]::integer[])
    into v_jury_scale
  from jsonb_array_elements_text(coalesce(v_config->'juryPoints', '[]'::jsonb))
       with ordinality as scale(value, ord);
  select coalesce(array_agg(score order by score desc), array[]::integer[])
    into v_countback_scale
  from (select distinct value as score from unnest(v_jury_scale) as configured(value)) scores;
  select coalesce(max(value), 12) into v_top_score
  from unnest(v_jury_scale) as value;
  return query
  with valid_jury_votes as (
    select j.*
    from public.jury_votes j
    where j.show_id = p_show_id
      and (
        j.ballot_submission_id is null
        or exists (
          select 1
          from public.jury_ballot_submissions submission
          where submission.id = j.ballot_submission_id
            and submission.status = 'valid'
        )
      )
      and (cardinality(v_jury_scale) = 0 or j.points = any(v_jury_scale))
  ),
  jury_totals as (
    select coalesce(j.receiving_country_id, j.receiving_entity_id) as identity_id,
           sum(j.points)::integer as jury_points,
           count(*) filter (where j.points = v_top_score)::integer as top_scores
    from valid_jury_votes j
    group by coalesce(j.receiving_country_id, j.receiving_entity_id)
  ),
  jury_sums as (
    select totals.identity_id,
           totals.jury_points,
           totals.top_scores,
           array(
             select (
               select count(*)::integer
               from valid_jury_votes counted
               where coalesce(counted.receiving_country_id, counted.receiving_entity_id) = totals.identity_id
                 and counted.points = score.value
             )
             from unnest(v_countback_scale) with ordinality as score(value, ord)
             order by score.ord
           )::integer[] as countback_counts
    from jury_totals totals
  ),
  tele_sums as (
    select coalesce(t.country_id, t.contest_entity_id) as identity_id,
           sum(t.points)::integer as televote_points
    from public.televote_votes t
    where t.show_id = p_show_id
    group by coalesce(t.country_id, t.contest_entity_id)
  ),
  scored as (
    select r.id,
           coalesce(r.country_id, r.contest_entity_id) as identity_id,
           r.final_rank as old_rank,
           coalesce(js.jury_points, 0)::integer as jury_points,
           coalesce(ts.televote_points, 0)::integer as televote_points,
           coalesce(js.top_scores, 0)::integer as top_scores,
           coalesce(
             js.countback_counts,
             array(select 0::integer from unnest(v_countback_scale))
           )::integer[] as countback_counts,
           coalesce(p.running_order, -1)::integer as running_order
    from public.results r
    join public.participants p
      on p.show_id = p_show_id
     and coalesce(p.participation_status, 'confirmed') = 'confirmed'
     and coalesce(p.country_id, p.contest_entity_id) = coalesce(r.country_id, r.contest_entity_id)
    left join jury_sums js
      on js.identity_id = coalesce(r.country_id, r.contest_entity_id)
    left join tele_sums ts
      on ts.identity_id = coalesce(r.country_id, r.contest_entity_id)
    where r.show_id = p_show_id
  ),
  totals as (
    select s.*,
      case
        when coalesce((v_config->>'weightedScoring')::boolean, false) then
          round(
            s.jury_points * coalesce((v_config->'weighting'->>'jury')::numeric, 50) / 50
            + s.televote_points * coalesce((v_config->'weighting'->>'televote')::numeric, 50) / 50
          )::integer
        else s.jury_points + s.televote_points
      end as total_points
    from scored s
  ),
  keyed as (
    select t.*,
      coalesce(v_config->'tieBreak', '["televote","twelves","jury"]'::jsonb) as tie_break
    from totals t
  ),
  ranked as (
    select k.*,
      row_number() over (
        order by
          k.total_points desc,
          case coalesce(k.tie_break->>0, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case when coalesce(k.tie_break->>0, '') = 'countback'
            then k.countback_counts else null::integer[] end desc nulls last,
          case coalesce(k.tie_break->>1, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case when coalesce(k.tie_break->>1, '') = 'countback'
            then k.countback_counts else null::integer[] end desc nulls last,
          case coalesce(k.tie_break->>2, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case when coalesce(k.tie_break->>2, '') = 'countback'
            then k.countback_counts else null::integer[] end desc nulls last,
          case coalesce(k.tie_break->>3, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case when coalesce(k.tie_break->>3, '') = 'countback'
            then k.countback_counts else null::integer[] end desc nulls last,
          case coalesce(k.tie_break->>4, '')
            when 'jury' then k.jury_points when 'televote' then k.televote_points
            when 'twelves' then k.top_scores
            when 'runningOrder' then k.running_order else 0 end desc,
          case when coalesce(k.tie_break->>4, '') = 'countback'
            then k.countback_counts else null::integer[] end desc nulls last,
          k.old_rank nulls last,
          k.identity_id
      )::integer as final_rank
    from keyed k
  )
  select ranked.id, ranked.jury_points, ranked.televote_points,
         ranked.total_points, ranked.final_rank from ranked;
end
$expected$;

revoke all on function private.studio2_expected_result_ranks(uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_expected_result_ranks(uuid) to service_role;

create or replace function public.sync_show_results_from_votes(_show_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_edition_id uuid;
  v_config jsonb;
  v_jury_scale integer[];
  v_countback_scale integer[];
  v_top_score integer;
begin
  if _show_id is null then return; end if;

  select s.edition_id, coalesce(s.voting_config, '{}'::jsonb)
    into v_edition_id, v_config
  from public.shows s
  where s.id = _show_id;

  if v_edition_id is null then return; end if;

  select coalesce(array_agg(value::integer order by ord), array[]::integer[])
    into v_jury_scale
  from jsonb_array_elements_text(coalesce(v_config->'juryPoints', '[]'::jsonb))
       with ordinality as scale(value, ord);

  -- Application countback semantics intentionally ignore configuration order:
  -- configured score values are de-duplicated and compared highest-first.
  select coalesce(array_agg(score order by score desc), array[]::integer[])
    into v_countback_scale
  from (
    select distinct value as score
    from unnest(v_jury_scale) as configured(value)
  ) scores;

  select coalesce(max(value), 12) into v_top_score
  from unnest(v_jury_scale) as value;

  insert into public.results (
    edition_id, show_id, country_id, contest_entity_id,
    jury_points, televote_points, total_points, final_rank, updated_at
  )
  select p.edition_id, p.show_id, p.country_id, p.contest_entity_id,
         0, 0, 0, null, now()
  from public.participants p
  where p.show_id = _show_id
    and p.country_id is not null
    and coalesce(p.participation_status, 'confirmed') = 'confirmed'
  on conflict (show_id, country_id) where show_id is not null
  do update set
    edition_id = excluded.edition_id,
    contest_entity_id = coalesce(public.results.contest_entity_id, excluded.contest_entity_id),
    updated_at = now();

  insert into public.results (
    edition_id, show_id, country_id, contest_entity_id,
    jury_points, televote_points, total_points, final_rank, updated_at
  )
  select p.edition_id, p.show_id, null, p.contest_entity_id,
         0, 0, 0, null, now()
  from public.participants p
  where p.show_id = _show_id
    and p.country_id is null
    and p.contest_entity_id is not null
    and coalesce(p.participation_status, 'confirmed') = 'confirmed'
  on conflict (show_id, contest_entity_id) where show_id is not null and contest_entity_id is not null
  do update set edition_id = excluded.edition_id, updated_at = now();

  update public.results r
  set final_rank = null,
      updated_at = now()
  where r.show_id = _show_id
    and not exists (
      select 1
      from public.participants p
      where p.show_id = _show_id
        and coalesce(p.participation_status, 'confirmed') = 'confirmed'
        and coalesce(p.country_id, p.contest_entity_id) = coalesce(r.country_id, r.contest_entity_id)
    );

  -- Mutation and verifier share one canonical scoring/tie-break projection.
  update public.results r
  set jury_points = ranked.jury_points,
      televote_points = ranked.televote_points,
      total_points = ranked.total_points,
      final_rank = ranked.final_rank,
      updated_at = now()
  from private.studio2_expected_result_ranks(_show_id) ranked
  where r.id = ranked.result_id;
end;
$$;

create or replace function private.studio2_result_reconciliation(p_show_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_config jsonb;
  v_jury_scale integer[] := array[]::integer[];
  v_participant_count integer := 0;
  v_active_result_rows integer := 0;
  v_all_result_rows integer := 0;
  v_historical_result_rows integer := 0;
  v_orphan_result_rows integer := 0;
  v_invalid_nonactive_result_rows integer := 0;
  v_missing_result_rows integer := 0;
  v_jury_mismatches integer := 0;
  v_televote_mismatches integer := 0;
  v_total_mismatches integer := 0;
  v_rank_value_issues integer := 0;
  v_distinct_rank_count integer := 0;
  v_rank_issues integer := 0;
  v_expected_rank_mismatches integer := 0;
  v_reconcile_issues integer := 0;
begin
  select coalesce(show_row.voting_config, '{}'::jsonb)
  into v_config
  from public.shows show_row
  where show_row.id = p_show_id;

  if not found then
    raise exception 'Show not found: %', p_show_id using errcode = 'P0002';
  end if;

  select coalesce(array_agg(scale.value::integer order by scale.ord), array[]::integer[])
  into v_jury_scale
  from jsonb_array_elements_text(coalesce(v_config -> 'juryPoints', '[]'::jsonb))
       with ordinality as scale(value, ord);

  with active_participants as (
    select participant.country_id, participant.contest_entity_id
    from public.participants participant
    where participant.show_id = p_show_id
      and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
  ), result_rows as (
    select result_row.*
    from public.results result_row
    where result_row.show_id = p_show_id
  )
  select
    (select count(*)::integer from active_participants),
    (select count(*)::integer
       from result_rows result_row
      where exists (
        select 1
        from active_participants participant
        where (
          (participant.country_id is not null and result_row.country_id = participant.country_id)
          or (
            participant.country_id is null
            and participant.contest_entity_id is not null
            and result_row.country_id is null
            and result_row.contest_entity_id = participant.contest_entity_id
          )
        )
      )),
    (select count(*)::integer from result_rows),
    (select count(*)::integer
       from result_rows result_row
      where not exists (
        select 1
        from active_participants participant
        where (
          (participant.country_id is not null and result_row.country_id = participant.country_id)
          or (
            participant.country_id is null
            and participant.contest_entity_id is not null
            and result_row.country_id is null
            and result_row.contest_entity_id = participant.contest_entity_id
          )
        )
      )
        and exists (
          select 1
          from public.participants participant
          where participant.show_id = p_show_id
            and coalesce(participant.participation_status, 'confirmed') in ('withdrawn', 'disqualified')
            and (
              (participant.country_id is not null and result_row.country_id = participant.country_id)
              or (
                participant.country_id is null
                and participant.contest_entity_id is not null
                and result_row.country_id is null
                and result_row.contest_entity_id = participant.contest_entity_id
              )
            )
        )),
    (select count(*)::integer
       from result_rows result_row
      where not exists (
        select 1
        from public.participants participant
        where participant.show_id = p_show_id
          and (
            (participant.country_id is not null and result_row.country_id = participant.country_id)
            or (
              participant.country_id is null
              and participant.contest_entity_id is not null
              and result_row.country_id is null
              and result_row.contest_entity_id = participant.contest_entity_id
            )
          )
      )),
    (select count(*)::integer
       from active_participants participant
      where not exists (
        select 1
        from result_rows result_row
        where (
          (participant.country_id is not null and result_row.country_id = participant.country_id)
          or (
            participant.country_id is null
            and participant.contest_entity_id is not null
            and result_row.country_id is null
            and result_row.contest_entity_id = participant.contest_entity_id
          )
        )
      ))
  into
    v_participant_count,
    v_active_result_rows,
    v_all_result_rows,
    v_historical_result_rows,
    v_orphan_result_rows,
    v_missing_result_rows;

  with expected_jury as (
    select
      coalesce(vote.receiving_country_id, vote.receiving_entity_id) as identity_id,
      coalesce(sum(vote.points), 0)::integer as points
    from public.jury_votes vote
    where vote.show_id = p_show_id
      and (
        vote.ballot_submission_id is null
        or exists (
          select 1
          from public.jury_ballot_submissions submission
          where submission.id = vote.ballot_submission_id
            and submission.status = 'valid'
        )
      )
      and (cardinality(v_jury_scale) = 0 or vote.points = any(v_jury_scale))
    group by coalesce(vote.receiving_country_id, vote.receiving_entity_id)
  ), expected_televote as (
    select
      coalesce(vote.country_id, vote.contest_entity_id) as identity_id,
      coalesce(sum(vote.points), 0)::integer as points
    from public.televote_votes vote
    where vote.show_id = p_show_id
    group by coalesce(vote.country_id, vote.contest_entity_id)
  ), active_results as (
    select
      result_row.id,
      result_row.jury_points,
      result_row.televote_points,
      result_row.total_points,
      result_row.final_rank,
      coalesce(expected_jury.points, 0)::integer as expected_jury_points,
      coalesce(expected_televote.points, 0)::integer as expected_televote_points
    from public.results result_row
    left join expected_jury
      on expected_jury.identity_id = coalesce(result_row.country_id, result_row.contest_entity_id)
    left join expected_televote
      on expected_televote.identity_id = coalesce(result_row.country_id, result_row.contest_entity_id)
    where result_row.show_id = p_show_id
      and exists (
        select 1
        from public.participants participant
        where participant.show_id = p_show_id
          and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
          and (
            (participant.country_id is not null and result_row.country_id = participant.country_id)
            or (
              participant.country_id is null
              and participant.contest_entity_id is not null
              and result_row.country_id is null
              and result_row.contest_entity_id = participant.contest_entity_id
            )
          )
      )
  )
  select
    count(*) filter (
      where active_result.jury_points is distinct from active_result.expected_jury_points
    )::integer,
    count(*) filter (
      where active_result.televote_points is distinct from active_result.expected_televote_points
    )::integer,
    count(*) filter (
      where active_result.total_points is distinct from (
        case
          when coalesce((v_config ->> 'weightedScoring')::boolean, false) then
            round(
              active_result.expected_jury_points
                * coalesce((v_config -> 'weighting' ->> 'jury')::numeric, 50) / 50
              + active_result.expected_televote_points
                * coalesce((v_config -> 'weighting' ->> 'televote')::numeric, 50) / 50
            )::integer
          else active_result.expected_jury_points + active_result.expected_televote_points
        end
      )
    )::integer,
    count(*) filter (
      where active_result.final_rank is null
         or active_result.final_rank < 1
         or active_result.final_rank > greatest(v_participant_count, 1)
    )::integer,
    count(distinct active_result.final_rank)::integer
  into
    v_jury_mismatches,
    v_televote_mismatches,
    v_total_mismatches,
    v_rank_value_issues,
    v_distinct_rank_count
  from active_results active_result;

  -- Explicitly reject pending, waitlisted and any other non-historical Results.
  select count(*)::integer into v_invalid_nonactive_result_rows
  from public.results r
  where r.show_id = p_show_id
    and not exists (
      select 1 from public.participants p
      where p.show_id = p_show_id
        and coalesce(p.participation_status, 'confirmed') = 'confirmed'
        and ((p.country_id is not null and p.country_id = r.country_id)
          or (p.country_id is null and p.contest_entity_id is not null
              and r.country_id is null and r.contest_entity_id = p.contest_entity_id))
    )
    and exists (
      select 1 from public.participants p
      where p.show_id = p_show_id
        and coalesce(p.participation_status, 'confirmed')
           not in ('confirmed', 'withdrawn', 'disqualified')
        and ((p.country_id is not null and p.country_id = r.country_id)
          or (p.country_id is null and p.contest_entity_id is not null
              and r.country_id is null and r.contest_entity_id = p.contest_entity_id))
    );

  -- Validate the stored exact canonical ranking, not just range/uniqueness.
  select count(*)::integer into v_expected_rank_mismatches
  from private.studio2_expected_result_ranks(p_show_id) expected
  join public.results r on r.id = expected.result_id
  where r.final_rank is distinct from expected.final_rank;

  v_rank_issues := v_expected_rank_mismatches + v_rank_value_issues
    + case
        when v_active_result_rows > 0
         and v_distinct_rank_count <> v_active_result_rows then 1
        else 0
      end;

  v_reconcile_issues :=
      v_missing_result_rows
    + v_orphan_result_rows
    + v_invalid_nonactive_result_rows
    + greatest(v_active_result_rows - v_participant_count, 0)
    + v_jury_mismatches
    + v_televote_mismatches
    + v_total_mismatches
    + v_rank_issues;

  return jsonb_build_object(
    'participantCount', v_participant_count,
    'resultRowCount', v_active_result_rows,
    'activeResultRowCount', v_active_result_rows,
    'allResultRowCount', v_all_result_rows,
    'historicalInactiveResultRowCount', v_historical_result_rows,
    'missingResultRowCount', v_missing_result_rows,
    'orphanResultRowCount', v_orphan_result_rows,
    'invalidNonactiveResultRowCount', v_invalid_nonactive_result_rows,
    'incorrectCanonicalRankCount', v_expected_rank_mismatches,
    'extraActiveResultRowCount', greatest(v_active_result_rows - v_participant_count, 0),
    'juryPointsMismatchCount', v_jury_mismatches,
    'televotePointsMismatchCount', v_televote_mismatches,
    'totalPointsMismatchCount', v_total_mismatches,
    'rankIssueCount', v_rank_issues,
    'reconcileIssueCount', v_reconcile_issues,
    'reconciliationConsistent', (
      v_participant_count > 0
      and v_active_result_rows = v_participant_count
      and v_reconcile_issues = 0
    )
  );
end
$reconcile$;

-- Counterfactual influence rows are rebuildable diagnostics, not official
-- score truth. The existing atomic calculation RPC is SECURITY INVOKER and
-- runs under the Organizer's authenticated token. It must retain SELECT/DML
-- privileges gated by the existing voting.manage RLS policy from
-- 20261103004500; revoking those privileges silently breaks *both* engines.
-- Keep the RLS policy and its capability check, deny public/anonymous writes,
-- and forbid any table-level TRUNCATE/REFERENCES/TRIGGER escalation.
alter table televoting.round_influence_results enable row level security;
revoke all on table televoting.round_influence_results from public, anon;
revoke truncate, references, trigger
  on table televoting.round_influence_results from authenticated;
grant select, insert, update, delete
  on table televoting.round_influence_results to authenticated;
drop policy if exists "televoting organizer full access"
  on televoting.round_influence_results;
create policy "televoting organizer full access"
  on televoting.round_influence_results for all to authenticated
  using (public.studio2_access_allowed('voting.manage', null, false))
  with check (public.studio2_access_allowed('voting.manage', null, false));

notify pgrst, 'reload schema';
commit;
