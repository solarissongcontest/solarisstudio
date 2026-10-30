begin;

-- V3 Results compatibility cutover.
--
-- public.sync_show_results_from_votes(uuid) is the canonical Jury + Televote ->
-- Results projection authority. Older callers still enter through
-- public.recalculate_show_results_internal(uuid), so preserve that API while
-- removing the independently-maintained scoring/tie-break implementation.
-- One scoring authority. Do not duplicate weighting or ranking logic here.

select public.v3_register_migration_contract(
  'v3.results.canonical-recalculation',
  1,
  'forward_fix_only',
  false,
  null,
  'Route legacy Results recalculation through the canonical Jury and Televote projection authority without migration-time data backfill.'
);

create or replace function public.recalculate_show_results_internal(
  _show_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $recalculate$
declare
  v_active_result_rows integer := 0;
begin
  if _show_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.shows show_row
    where show_row.id = _show_id
  ) then
    return 0;
  end if;

  -- Serialize explicit recalculation attempts for one show. Vote-projection
  -- writers remain transactional; retries therefore converge on one canonical
  -- projection instead of interleaving two calculate operations.
  perform pg_advisory_xact_lock(
    hashtextextended('v3-results-recalculate:' || _show_id::text, 0)
  );

  perform public.sync_show_results_from_votes(_show_id);

  -- Preserve the legacy integer return contract, but count the canonical
  -- active identities rather than the removed legacy results.participant_id
  -- relationship. Historical withdrawn/disqualified rows are intentionally
  -- retained and must not inflate this count.
  select count(*)::integer
  into v_active_result_rows
  from public.results result_row
  where result_row.show_id = _show_id
    and exists (
      select 1
      from public.participants participant
      where participant.show_id = _show_id
        and coalesce(participant.participation_status, 'confirmed') = 'confirmed'
        and (
          (
            participant.country_id is not null
            and result_row.country_id = participant.country_id
          )
          or (
            participant.country_id is null
            and participant.contest_entity_id is not null
            and result_row.country_id is null
            and result_row.contest_entity_id = participant.contest_entity_id
          )
        )
    );

  return v_active_result_rows;
end
$recalculate$;

comment on function public.recalculate_show_results_internal(uuid) is
  'Compatibility entrypoint for result recalculation. Canonical scoring authority is public.sync_show_results_from_votes(uuid); do not duplicate scoring logic here.';

revoke all on function public.recalculate_show_results_internal(uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
