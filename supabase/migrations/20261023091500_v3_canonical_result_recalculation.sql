begin;

-- V3 Results compatibility cutover.
--
-- `public.sync_show_results_from_votes` is the canonical Jury + Televote ->
-- Results projection authority. Older callers still enter through
-- `public.recalculate_show_results_internal`, so keep that public/internal
-- contract but remove its second, independently-maintained scoring engine.
--
-- This matters for S14 and production alike: a calculate operation must not
-- reinterpret an already-canonical result projection with legacy scoring or
-- tie-break rules merely because result rows already exist.

create or replace function public.recalculate_show_results_internal(_show_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active_result_rows integer := 0;
begin
  if _show_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.shows s
    where s.id = _show_id
  ) then
    return 0;
  end if;

  -- One scoring authority. Do not duplicate Jury, Televote, weighting or
  -- tie-break calculations in this compatibility entrypoint.
  perform public.sync_show_results_from_votes(_show_id);

  -- Preserve the legacy function's useful return contract as the number of
  -- active participant result rows now represented by the canonical projection.
  select count(*)::integer
    into v_active_result_rows
  from public.results r
  where r.show_id = _show_id
    and exists (
      select 1
      from public.participants p
      where p.show_id = _show_id
        and coalesce(p.participation_status, 'confirmed') = 'confirmed'
        and (
          (p.country_id is not null and r.country_id = p.country_id)
          or (
            p.country_id is null
            and p.contest_entity_id is not null
            and r.country_id is null
            and r.contest_entity_id = p.contest_entity_id
          )
        )
    );

  return v_active_result_rows;
end;
$$;

comment on function public.recalculate_show_results_internal(uuid) is
  'Compatibility entrypoint for result recalculation. Canonical scoring authority is public.sync_show_results_from_votes(uuid); do not duplicate scoring logic here.';

revoke all on function public.recalculate_show_results_internal(uuid) from public, anon, authenticated;

commit;
