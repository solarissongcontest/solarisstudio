begin;

-- Edition is a separately reversible installed-app hub owned by Explore. The
-- public web and deep-linked legacy Edition detail sections remain available
-- while the V3 hub is rolled out independently.
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
      'solaris_app_v3_notifications', 'solaris_app_v3_edition'
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
  'solaris_app_v3_edition',
  false,
  false,
  '{}'::uuid[],
  '{}'::uuid[]
)
on conflict (key) do nothing;

-- The V3 Edition hub needs only section-availability counts, not the full
-- participant/story graphs. Participant visibility is delegated to the
-- existing public_safe_participants projection and unpublished storylines stay
-- behind their existing RPC-only boundary.
create or replace function public.v3_public_edition_hub_counts(_edition_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with published_edition as (
    select e.id
    from public.editions e
    where e.id = _edition_id
      and e.published = true
  ), safe_participants as (
    select value as row_data
    from jsonb_array_elements(
      case
        when _edition_id is null then '[]'::jsonb
        else public.public_safe_participants(_edition_id, null::uuid)
      end
    )
    where exists (select 1 from published_edition)
  ), canonical_participants as (
    select distinct coalesce(
      nullif(row_data ->> 'contest_entity_id', ''),
      nullif(row_data ->> 'country_id', '')
    ) as entity_id
    from safe_participants
  ), public_songs as (
    select distinct coalesce(
      nullif(row_data ->> 'contest_entity_id', ''),
      nullif(row_data ->> 'country_id', '')
    ) as entity_id
    from safe_participants
    where nullif(btrim(row_data ->> 'song'), '') is not null
  )
  select jsonb_build_object(
    'participants', (
      select count(*) from canonical_participants where entity_id is not null
    ),
    'songs', (
      select count(*) from public_songs where entity_id is not null
    ),
    'stories', (
      select count(*)
      from public.studio2_storylines s
      where s.edition_id = _edition_id
        and s.status = 'published'
        and exists (select 1 from published_edition)
    )
  );
$$;

revoke all on function public.v3_public_edition_hub_counts(uuid) from public;
grant execute on function public.v3_public_edition_hub_counts(uuid) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
