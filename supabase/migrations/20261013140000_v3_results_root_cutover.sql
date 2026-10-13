begin;

-- Results is a separately reversible App V3 primary surface. Keep every
-- previously persisted Studio 2 key valid and start the new slice disabled.
alter table public.studio2_feature_flags
  drop constraint if exists studio2_feature_flags_key_check;

alter table public.studio2_feature_flags
  add constraint studio2_feature_flags_key_check check (
    key in (
      'edition_state_engine', 'contest_event_engine', 'permission_engine_v2',
      'workflow_engine', 'official_communications', 'hod_workspace_v2',
      'live_control_room', 'incident_command', 'broadcast_rundown',
      'results_replay', 'voting_lab', 'edition_simulator', 'rules_engine',
      'public_encyclopedia', 'public_ia_v3', 'country_voting_dna',
      'prediction_league', 'fantasy_ssc', 'time_machine',
      'solaris_command_assistant', 'solaris_app_v3',
      'solaris_app_v3_confirmation', 'solaris_app_v3_scoreboard',
      'solaris_app_v3_account_settings', 'solaris_app_v3_explore',
      'solaris_app_v3_notifications', 'solaris_app_v3_edition_hub',
      'solaris_app_v3_delegation', 'solaris_app_v3_results'
    )
  );

insert into public.studio2_feature_flags (
  key,
  enabled,
  admins_only,
  user_ids,
  edition_ids
)
values (
  'solaris_app_v3_results',
  false,
  false,
  '{}'::uuid[],
  '{}'::uuid[]
)
on conflict (key) do nothing;

-- One bounded, publication-safe read model for the Results root. The browser
-- does not receive the archive-wide editions/shows/results/participants graph.
-- Legacy published shows without publication_config keys retain the same safe
-- Results preset semantics as resolveShowPublication in application code.
create or replace function public.v3_public_results_root()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with fallback_edition as (
    select e.id, e.edition_number, e.name
    from public.editions e
    where e.published = true
    order by e.edition_number desc nulls last, e.name desc
    limit 1
  ), candidate_shows as (
    select
      s.id,
      s.edition_id,
      s.name,
      s.kind,
      s.sort_order,
      e.edition_number,
      e.name as edition_name,
      case
        when not (
          coalesce(s.publication_config, '{}'::jsonb) ?| array[
            'participants', 'artists', 'songs', 'semi_split',
            'running_order', 'qualifiers', 'results', 'jury_results',
            'televote_results', 'detailed_voting'
          ]
        ) then true
        else coalesce((s.publication_config ->> 'results')::boolean, false)
      end as results_published,
      case
        when not (
          coalesce(s.publication_config, '{}'::jsonb) ?| array[
            'participants', 'artists', 'songs', 'semi_split',
            'running_order', 'qualifiers', 'results', 'jury_results',
            'televote_results', 'detailed_voting'
          ]
        ) then true
        else coalesce((s.publication_config ->> 'jury_results')::boolean, false)
      end as jury_published,
      case
        when not (
          coalesce(s.publication_config, '{}'::jsonb) ?| array[
            'participants', 'artists', 'songs', 'semi_split',
            'running_order', 'qualifiers', 'results', 'jury_results',
            'televote_results', 'detailed_voting'
          ]
        ) then true
        else coalesce((s.publication_config ->> 'televote_results')::boolean, false)
      end as televote_published
    from public.shows s
    join public.editions e
      on e.id = s.edition_id
     and e.published = true
    where s.published = true
  ), latest_show as (
    select cs.*
    from candidate_shows cs
    where cs.results_published = true
    order by
      cs.edition_number desc nulls last,
      case when cs.kind in ('grand-final', 'final') then 0 else 1 end,
      cs.sort_order desc,
      cs.id
    limit 1
  ), result_rows as (
    select
      coalesce(ce.country_id, r.country_id, ce.id) as identity_id,
      case
        when ce.entity_type = 'custom' then ce.display_name
        when ce.entity_type = 'global' and ce.historical_identity_override = true
          then ce.display_name
        else coalesce(c.name, ce.display_name, 'Unknown')
      end as display_name,
      case
        when ce.entity_type = 'custom' then ce.flag_image
        when ce.entity_type = 'global' and ce.historical_identity_override = true
          then coalesce(ce.flag_image, c.flag_image)
        else coalesce(c.flag_image, ce.flag_image)
      end as flag_image,
      r.final_rank,
      r.total_points,
      r.jury_points,
      r.televote_points
    from public.results r
    join latest_show ls
      on ls.id = r.show_id
    left join public.contest_entities ce
      on ce.id = r.contest_entity_id
    left join public.countries c
      on c.id = coalesce(ce.country_id, r.country_id)
    where r.final_rank is not null
      and coalesce(ce.country_id, r.country_id, ce.id) is not null
      and not exists (
        select 1
        from public.participants p
        where p.edition_id = r.edition_id
          and coalesce(p.participation_status, 'confirmed') in ('withdrawn', 'disqualified')
          and (
            (r.contest_entity_id is not null and p.contest_entity_id = r.contest_entity_id)
            or (r.country_id is not null and p.country_id = r.country_id)
          )
      )
  )
  select jsonb_build_object(
    'edition', coalesce(
      (
        select jsonb_build_object(
          'id', ls.edition_id,
          'edition_number', ls.edition_number,
          'name', ls.edition_name
        )
        from latest_show ls
      ),
      (
        select jsonb_build_object(
          'id', fe.id,
          'edition_number', fe.edition_number,
          'name', fe.name
        )
        from fallback_edition fe
      )
    ),
    'show', (
      select jsonb_build_object(
        'id', ls.id,
        'name', ls.name
      )
      from latest_show ls
    ),
    'jury_published', coalesce((select ls.jury_published from latest_show ls), false),
    'televote_published', coalesce((select ls.televote_published from latest_show ls), false),
    'rows', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'country_id', rr.identity_id,
          'country_name', rr.display_name,
          'flag_url', rr.flag_image,
          'rank', rr.final_rank,
          'points', rr.total_points,
          'jury_points', case
            when (select ls.jury_published from latest_show ls)
              then rr.jury_points
            else null
          end,
          'televote_points', case
            when (select ls.televote_published from latest_show ls)
              then rr.televote_points
            else null
          end
        )
        order by rr.final_rank, rr.display_name
      )
      from result_rows rr
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.v3_public_results_root() from public;
grant execute on function public.v3_public_results_root() to anon, authenticated;

notify pgrst, 'reload schema';

commit;
