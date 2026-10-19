begin;

-- System V3 / S14 follow-up: final-publication reconciliation may advance the
-- coarse edition runtime to results only when the actual Results layer is
-- public and bound to an exact current reviewed/locked/reveal-ready immutable
-- result version. A merely-public show, or publication of qualifiers alone, is
-- not enough evidence that the contest has reached final Results.

insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.final-results-readiness-hardening',
  1,
  'forward_fix_only',
  false,
  null,
  'Tighten S14 multi-show lifecycle reconciliation to require the public Results layer and exact release-ready immutable result provenance.'
)
on conflict (migration_key) do nothing;

create or replace function private.v3_edition_final_results_ready(
  p_edition_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $ready$
  with final_shows as (
    select show_row.id
    from public.shows show_row
    where show_row.edition_id = p_edition_id
      and lower(replace(replace(coalesce(show_row.kind, ''), '_', '-'), ' ', '-'))
          in ('grand-final', 'final')
  ),
  evidenced_final_shows as (
    select final_show.id
    from final_shows final_show
    join public.studio2_show_publication_controls control
      on control.show_id = final_show.id
     and control.edition_id = p_edition_id
     and control.state = 'public'
     and coalesce(
       (private.studio2_normalise_publication_config(control.frozen_config) ->> 'results')::boolean,
       false
     )
     and control.source_result_version is not null
    join private.v3_result_versions result_version
      on result_version.show_id = final_show.id
     and result_version.edition_id = p_edition_id
     and result_version.version = control.source_result_version
     and result_version.result_row_count > 0
    where private.v3_publication_result_version_release_ready(
      final_show.id,
      control.source_result_version
    )
  )
  select exists (select 1 from final_shows)
     and not exists (
       select 1
       from final_shows final_show
       where not exists (
         select 1
         from evidenced_final_shows evidenced
         where evidenced.id = final_show.id
       )
     );
$ready$;

revoke all on function private.v3_edition_final_results_ready(uuid)
  from public, anon, authenticated;

comment on function private.v3_edition_final_results_ready(uuid) is
  'S14 coarse-runtime reconciliation guard: every Grand Final/final show must have its Results layer public with an exact non-empty release-ready immutable result version.';

notify pgrst, 'reload schema';

commit;
