begin;

-- Captured version membership is fixed at calculation time. Public reads keep
-- using that immutable payload; they never reinterpret old versions against a
-- mutable current participant status. Historical Results rows remain stored.
select public.v3_register_migration_contract(
  'v3.results.active-snapshot-and-qualification', 1, 'forward_fix_only',
  false, null,
  'Capture confirmed official identities and derive active semifinal qualification without rewriting historical Results or immutable versions.'
);

create or replace function private.v3_capture_result_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $capture$
declare
  v_rows jsonb;
  v_count integer;
begin
  if new.calculation_version < 1
     or (tg_op = 'UPDATE' and new.calculation_version = old.calculation_version) then
    return new;
  end if;

  if tg_op = 'UPDATE' and new.calculation_version <> old.calculation_version + 1 then
    raise exception 'Result calculation versions must advance exactly once'
      using errcode = '23514';
  end if;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', result.id,
          'countryId', result.country_id,
          'contestEntityId', result.contest_entity_id,
          'juryPoints', result.jury_points,
          'televotePoints', result.televote_points,
          'televoteComponents', result.televote_components,
          'totalPoints', result.total_points,
          'finalRank', result.final_rank
        ) order by result.id
      ),
      '[]'::jsonb
    ),
    count(*)::integer
  into v_rows, v_count
  from public.results result
  where result.show_id = new.show_id
    and result.edition_id = new.edition_id
    and exists (
      select 1
      from public.participants participant
      where participant.show_id = new.show_id
        and participant.edition_id = new.edition_id
        and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
        and (
          (participant.country_id is not null and result.country_id = participant.country_id)
          or (
            participant.country_id is null
            and participant.contest_entity_id is not null
            and result.country_id is null
            and result.contest_entity_id = participant.contest_entity_id
          )
        )
    );

  insert into private.v3_result_versions (
    show_id, edition_id, version, result_rows, result_row_count, created_by
  ) values (
    new.show_id, new.edition_id, new.calculation_version,
    v_rows, v_count, new.last_calculated_by
  );

  return new;
end
$capture$;

create or replace function public.refresh_edition_qualifications(
  _edition_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $refresh$
begin
  with semi_rows as (
    select
      participant.country_id,
      case
        when participant.country_id is null
          then participant.contest_entity_id
        else null
      end as custom_entity_id,
      coalesce(
        case
          when (show_row.voting_config ->> 'qualifiers') ~ '^[0-9]+$'
            then (show_row.voting_config ->> 'qualifiers')::integer
          else null
        end,
        show_row.qualifier_count,
        0
      ) as cutoff,
      result_row.final_rank,
      coalesce(participant.participation_status, 'confirmed') = 'confirmed' as eligible
    from public.participants participant
    join public.shows show_row
      on show_row.id = participant.show_id
     and show_row.edition_id = _edition_id
     and show_row.kind = 'semi-final'
    left join public.results result_row
      on result_row.show_id = participant.show_id
     and (
       (
         participant.country_id is not null
         and result_row.country_id = participant.country_id
       )
       or
       (
         participant.country_id is null
         and participant.contest_entity_id is not null
         and result_row.country_id is null
         and result_row.contest_entity_id = participant.contest_entity_id
       )
     )
    where participant.edition_id = _edition_id
  ),
  outcomes as (
    select
      country_id,
      custom_entity_id,
      coalesce(
        bool_or(
          eligible and cutoff > 0
          and final_rank between 1 and cutoff
        ),
        false
      ) as qualified,
      bool_or(final_rank is not null) as has_ranked_result
    from semi_rows
    group by country_id, custom_entity_id
  )
  update public.participants participant
  set qualified = outcome.qualified
  from outcomes outcome
  where participant.edition_id = _edition_id
    and (
      (
        outcome.country_id is not null
        and participant.country_id = outcome.country_id
      )
      or
      (
        outcome.country_id is null
        and outcome.custom_entity_id is not null
        and participant.country_id is null
        and participant.contest_entity_id = outcome.custom_entity_id
      )
    )
    and (outcome.has_ranked_result or participant.qualified is true)
    and participant.qualified is distinct from outcome.qualified;
end
$refresh$;

create or replace function public.sync_show_results_from_votes(_show_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
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

  -- Never mutate withdrawn/disqualified historical Results as a by-product
  -- of active recomputation. Their score/rank and timestamp remain archival
  -- evidence; only confirmed Results rows are materialized and ranked.

  -- Mutation and verifier share one canonical scoring/tie-break projection.
  update public.results r
  set jury_points = ranked.jury_points,
      televote_points = ranked.televote_points,
      total_points = ranked.total_points,
      final_rank = ranked.final_rank,
      updated_at = now()
  from private.studio2_expected_result_ranks(_show_id) ranked
  where r.id = ranked.result_id;
  -- A zero-active-row recalculation fires no Results row trigger. Refresh the
  -- total qualification projection anyway, including inactive stale TRUEs.
  perform public.refresh_show_qualifiers(_show_id);
end;
$$;

-- Legacy raw public Results reads must select the same frozen evidence as the
-- official snapshot RPC. Capability-scoped Organizer history reads remain
-- intact. Unversioned legacy publications retain their row/provenance contract,
-- subject to the same public-edition boundary as the official snapshot RPC.
-- No provenance or revised historical payload is invented for them.
create or replace function private.v3_public_result_row_visible(
  p_show_id uuid,
  p_edition_id uuid,
  p_frozen_row jsonb
)
returns boolean
language sql stable security definer
set search_path = ''
as $visible$
  select public.show_publication_enabled(p_show_id, 'results') and exists (
    select 1
    from public.studio2_show_publication_controls control
    join public.editions edition
      on edition.id = control.edition_id and edition.published
    where control.show_id = p_show_id
      and control.edition_id = p_edition_id
      and (
        control.source_result_version is null
        or (
          control.state = 'public'
          and private.v3_publication_result_version_release_ready(
            control.show_id, control.source_result_version
          )
          and exists (
            select 1
            from private.v3_result_versions version
            where version.show_id = control.show_id
              and version.edition_id = control.edition_id
              and version.version = control.source_result_version
              and version.result_rows @> jsonb_build_array(p_frozen_row)
          )
        )
      )
  );
$visible$;

revoke all on function private.v3_public_result_row_visible(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function private.v3_public_result_row_visible(uuid, uuid, jsonb)
  to anon, authenticated;

alter policy "solaris consolidated anon read" on public.results using (
  private.v3_public_result_row_visible(show_id, edition_id, jsonb_build_object(
    'id', id, 'countryId', country_id, 'contestEntityId', contest_entity_id,
    'juryPoints', jury_points, 'televotePoints', televote_points,
    'televoteComponents', televote_components, 'totalPoints', total_points,
    'finalRank', final_rank
  ))
  or public.studio2_access_allowed('results.preview', edition_id, false)
);

alter policy "solaris consolidated authenticated read" on public.results using (
  public.studio2_access_allowed('results.verify', edition_id, true)
  or private.v3_public_result_row_visible(show_id, edition_id, jsonb_build_object(
    'id', id, 'countryId', country_id, 'contestEntityId', contest_entity_id,
    'juryPoints', jury_points, 'televotePoints', televote_points,
    'televoteComponents', televote_components, 'totalPoints', total_points,
    'finalRank', final_rank
  ))
  or public.studio2_access_allowed('results.preview', edition_id, false)
);

-- Preserve the existing internal mutation boundaries; no writer is added.
revoke all on function private.v3_capture_result_version() from public, anon, authenticated;
revoke all on function public.refresh_edition_qualifications(uuid) from public, anon, authenticated;
-- CREATE OR REPLACE retains existing owners and exact positive role grants.

notify pgrst, 'reload schema';
commit;
