-- V3 result recalculation authority hardening.
--
-- `public.sync_show_results_from_votes(show_id)` is the canonical projection
-- builder for Jury + Televote scoring. Keep the older internal recalculation
-- entry point only as a compatibility adapter so callers cannot drift onto a
-- second scoring/tie-break implementation.

-- S13 forward-only adoption contract: this migration preserves the existing
-- recalculation entry-point contract while moving its implementation onto the
-- canonical Results projection authority. There is no migration-time backfill.
select public.v3_register_migration_contract(
  '20261023091500_v3_canonical_result_recalculation',
  1,
  'forward_fix',
  'forward_fix_only_restore_previous_result_recalculation_function',
  array[]::text[],
  'V3 Results recalculation delegates to canonical Jury + Televote projection authority'
);

create or replace function public.recalculate_show_results_internal(
  _show_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  _updated integer := 0;
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

  perform public.sync_show_results_from_votes(_show_id);

  select count(*)::integer
  into _updated
  from public.results r
  join public.participants p
    on p.id = r.participant_id
  where r.show_id = _show_id
    and p.show_id = _show_id
    and p.status = 'confirmed';

  return _updated;
end;
$$;

comment on function public.recalculate_show_results_internal(uuid) is
  'Compatibility adapter for Results recalculation. Canonical scoring and tie-break materialization are owned by public.sync_show_results_from_votes(show_id).';

revoke all on function public.recalculate_show_results_internal(uuid) from public;
revoke all on function public.recalculate_show_results_internal(uuid) from anon;
revoke all on function public.recalculate_show_results_internal(uuid) from authenticated;
