begin;

-- Explore is a separately reversible App V3 slice. The global V3 shell may stay
-- enabled while Explore falls back to the proven legacy route.
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
      'solaris_app_v3_account_settings', 'solaris_app_v3_explore'
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
  'solaris_app_v3_explore',
  false,
  false,
  '{}'::uuid[],
  '{}'::uuid[]
)
on conflict (key) do nothing;

-- Give V3 Explore small aggregate discovery counts without downloading the
-- public archive participant graph into the app. Entry visibility is delegated
-- to the existing public_safe_participants projection so this function cannot
-- accidentally invent a second publication policy.
create or replace function public.v3_public_explore_counts()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with safe_participants as (
    select value as row_data
    from jsonb_array_elements(
      public.public_safe_participants(null::uuid, null::uuid)
    )
  ), public_entries as (
    select distinct
      row_data ->> 'edition_id' as edition_id,
      coalesce(row_data ->> 'contest_entity_id', row_data ->> 'country_id') as entity_id,
      nullif(btrim(row_data ->> 'artist'), '') as artist,
      nullif(btrim(row_data ->> 'song'), '') as song
    from safe_participants
    where nullif(btrim(row_data ->> 'artist'), '') is not null
       or nullif(btrim(row_data ->> 'song'), '') is not null
  )
  select jsonb_build_object(
    'countries', (select count(*) from public.countries),
    'entries', (select count(*) from public_entries),
    'shows', (select count(*) from public.shows where published = true),
    'stories', (
      select count(*)
      from public.studio2_storylines s
      join public.editions e on e.id = s.edition_id
      where s.status = 'published'
        and e.published = true
    )
  );
$$;

revoke all on function public.v3_public_explore_counts() from public;
grant execute on function public.v3_public_explore_counts() to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
