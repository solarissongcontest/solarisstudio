begin;

-- System V3 / Public Results: expose one publication-safe read model backed by
-- the exact immutable result version selected by canonical Publication state.
--
-- Legacy public outcome rows without source_result_version deliberately return
-- NULL. S3 explicitly grandfathered those rows without inventing provenance;
-- this projection must not undo that safety decision by reading mutable results.
select public.v3_register_migration_contract(
  '20261020064712_v3_public_published_result_snapshot',
  1,
  'forward_fix_only',
  false,
  null,
  'Public exact-version result snapshot selected by canonical publication state'
);

create or replace function public.v3_public_published_result_snapshot(
  p_show_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $snapshot$
  with authoritative as (
    select
      control.show_id,
      control.edition_id,
      control.state as publication_state,
      control.version as publication_version,
      control.source_result_version,
      private.studio2_normalise_publication_config(control.frozen_config) as publication_config,
      control.updated_at as publication_updated_at,
      show.name as show_name,
      show.kind as show_kind,
      edition.edition_number,
      edition.name as edition_name,
      edition.slug as edition_slug,
      version.result_rows,
      version.result_row_count,
      version.created_at as result_version_created_at
    from public.studio2_show_publication_controls control
    join public.shows show
      on show.id = control.show_id
     and show.edition_id = control.edition_id
    join public.editions edition
      on edition.id = control.edition_id
    join private.v3_result_versions version
      on version.show_id = control.show_id
     and version.edition_id = control.edition_id
     and version.version = control.source_result_version
    where control.show_id = p_show_id
      and control.state = 'public'
      and control.source_result_version is not null
      and show.published = true
      and edition.published = true
      and coalesce(
        (private.studio2_normalise_publication_config(control.frozen_config) ->> 'results')::boolean,
        false
      )
      and private.v3_publication_result_version_release_ready(
        control.show_id,
        control.source_result_version
      )
    limit 1
  ),
  flags as (
    select
      authoritative.*,
      coalesce((publication_config ->> 'jury_results')::boolean, false) as jury_public,
      coalesce((publication_config ->> 'televote_results')::boolean, false) as televote_public,
      coalesce((publication_config ->> 'detailed_voting')::boolean, false) as detailed_voting_public
    from authoritative
  ),
  ranked as (
    select
      flags.show_id,
      (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'countryId', row_value -> 'countryId',
              'contestEntityId', row_value -> 'contestEntityId',
              'totalPoints', row_value -> 'totalPoints',
              'finalRank', row_value -> 'finalRank'
            )
            || case
              when flags.jury_public
                then jsonb_build_object('juryPoints', row_value -> 'juryPoints')
              else '{}'::jsonb
            end
            || case
              when flags.televote_public
                then jsonb_build_object('televotePoints', row_value -> 'televotePoints')
              else '{}'::jsonb
            end
            || case
              when flags.detailed_voting_public
                then jsonb_build_object('televoteComponents', row_value -> 'televoteComponents')
              else '{}'::jsonb
            end
            order by
              case
                when row_value ->> 'finalRank' ~ '^[0-9]+$'
                  then (row_value ->> 'finalRank')::integer
                else 2147483647
              end,
              case
                when row_value ->> 'totalPoints' ~ '^-?[0-9]+$'
                  then (row_value ->> 'totalPoints')::integer
                else 0
              end desc,
              coalesce(row_value ->> 'countryId', row_value ->> 'contestEntityId', '')
          ),
          '[]'::jsonb
        )
        from jsonb_array_elements(flags.result_rows) row_item(row_value)
      ) as rows
    from flags
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'publicationState', flags.publication_state,
    'publicationVersion', flags.publication_version,
    'resultVersion', flags.source_result_version,
    'publicationUpdatedAt', flags.publication_updated_at,
    'resultVersionCreatedAt', flags.result_version_created_at,
    'show', jsonb_build_object(
      'id', flags.show_id,
      'editionId', flags.edition_id,
      'name', flags.show_name,
      'kind', flags.show_kind
    ),
    'edition', jsonb_build_object(
      'id', flags.edition_id,
      'number', flags.edition_number,
      'name', flags.edition_name,
      'slug', flags.edition_slug
    ),
    'availability', jsonb_build_object(
      'results', true,
      'jury', flags.jury_public,
      'televote', flags.televote_public,
      'detailedVoting', flags.detailed_voting_public
    ),
    'rowCount', flags.result_row_count,
    'rows', coalesce(ranked.rows, '[]'::jsonb)
  )
  from flags
  left join ranked on ranked.show_id = flags.show_id
$snapshot$;

revoke all on function public.v3_public_published_result_snapshot(uuid)
  from public, anon, authenticated;
grant execute on function public.v3_public_published_result_snapshot(uuid)
  to anon, authenticated, service_role;

comment on function public.v3_public_published_result_snapshot(uuid) is
  'Public V3 result read model. Returns only the exact immutable result version selected by canonical public Publication state; NULL for hidden, unversioned, stale or otherwise non-authoritative state.';

notify pgrst, 'reload schema';

commit;
