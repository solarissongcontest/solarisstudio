begin;

-- System V3 Results -> qualification projection convergence.
--
-- public.results.final_rank remains the canonical qualification source. The
-- historical row-level Results trigger keeps qualification fresh during direct
-- result writes, but the authoritative V3 calculate command must also leave the
-- edition projection converged before it reports a new immutable calculation
-- version. Bind that invariant to the successful calculation-version transition
-- instead of relying on trigger ordering or temporal coincidence.

select public.v3_register_migration_contract(
  'v3.results.qualification-convergence',
  1,
  'forward_fix_only',
  false,
  null,
  'Refresh edition qualification from canonical semi-final result ranks whenever a successful Results calculation advances its immutable calculation version.'
);

create or replace function private.v3_refresh_qualifications_after_result_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $refresh$
begin
  perform public.refresh_edition_qualifications(new.edition_id);
  return new;
end
$refresh$;

revoke all on function private.v3_refresh_qualifications_after_result_version()
  from public, anon, authenticated;

drop trigger if exists v3_result_version_refresh_qualifications
  on public.studio2_result_operations;
create trigger v3_result_version_refresh_qualifications
after update of calculation_version on public.studio2_result_operations
for each row
when (new.calculation_version > old.calculation_version)
execute function private.v3_refresh_qualifications_after_result_version();

-- Repair any already-stale edition projection from canonical ranked semi-final
-- truth. Direct finalists without a ranked semi-final result remain untouched by
-- refresh_edition_qualifications(), preserving the established compatibility
-- contract.
do $backfill$
declare
  v_edition_id uuid;
begin
  for v_edition_id in
    select distinct show_row.edition_id
    from public.shows show_row
    join public.results result_row on result_row.show_id = show_row.id
    where show_row.kind = 'semi-final'
      and result_row.final_rank is not null
  loop
    perform public.refresh_edition_qualifications(v_edition_id);
  end loop;
end
$backfill$;

notify pgrst, 'reload schema';

commit;
