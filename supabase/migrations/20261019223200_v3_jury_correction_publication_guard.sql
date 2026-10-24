begin;

select public.v3_register_migration_contract(
  '20261019223200_v3_jury_correction_publication_guard',
  1,
  'forward_fix_only',
  false,
  null,
  'Treat every published official outcome, including qualifiers, as protected from direct Jury score correction'
);

create or replace function private.studio2_jury_correction_results_protected(
  p_show_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $protected$
  select coalesce((
    select
      exists (
        select 1
        from public.studio2_result_operations operation
        where operation.show_id = show_row.id
          and (
            operation.locked_version is not null
            or operation.reveal_ready_version is not null
          )
      )
      or exists (
        select 1
        from public.studio2_show_publication_controls control
        where control.show_id = show_row.id
          and control.state in ('scheduled', 'public')
          and private.studio2_publication_has_outcomes(control.frozen_config)
      )
      or (
        coalesce(show_row.published, false)
        and (
          case
            -- Legacy shows with no explicit granular publication config use
            -- the historic all-public interpretation. Preserve that safety
            -- boundary during the V3 compatibility window.
            when show_row.publication_config is null
              or jsonb_typeof(show_row.publication_config) <> 'object'
              or not (
                show_row.publication_config ? 'participants'
                or show_row.publication_config ? 'artists'
                or show_row.publication_config ? 'songs'
                or show_row.publication_config ? 'semi_split'
                or show_row.publication_config ? 'running_order'
                or show_row.publication_config ? 'qualifiers'
                or show_row.publication_config ? 'results'
                or show_row.publication_config ? 'jury_results'
                or show_row.publication_config ? 'televote_results'
                or show_row.publication_config ? 'detailed_voting'
              )
            then true
            else (
              show_row.publication_config -> 'qualifiers' = 'true'::jsonb
              or show_row.publication_config -> 'results' = 'true'::jsonb
              or show_row.publication_config -> 'jury_results' = 'true'::jsonb
              or show_row.publication_config -> 'detailed_voting' = 'true'::jsonb
            )
          end
        )
      )
    from public.shows show_row
    where show_row.id = p_show_id
  ), false)
$protected$;

revoke all on function private.studio2_jury_correction_results_protected(uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
