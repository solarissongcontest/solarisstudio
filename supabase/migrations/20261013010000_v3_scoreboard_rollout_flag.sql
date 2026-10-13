begin;

-- Scoreboard is a separately reversible App V3 surface. The global V3 shell can
-- remain enabled while the installed-app scoreboard presentation is staged or
-- rolled back independently. Public web continues to use the existing result UI.
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
      'solaris_app_v3_confirmation', 'solaris_app_v3_scoreboard'
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
  'solaris_app_v3_scoreboard',
  false,
  false,
  '{}'::uuid[],
  '{}'::uuid[]
)
on conflict (key) do nothing;

notify pgrst, 'reload schema';

commit;
