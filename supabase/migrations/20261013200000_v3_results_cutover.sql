begin;

-- Results root is a separately reversible V3 presentation slice.
-- Preserve every prior flag and publication/scoring contract. New rollout
-- remains disabled until its production surface has been certified.
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
      'solaris_app_v3_delegation', 'solaris_app_v3_search',
      'solaris_app_v3_rules_guidance', 'solaris_app_v3_results'
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

notify pgrst, 'reload schema';

commit;
