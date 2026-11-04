begin;

-- TG3 needs a separately reversible public entrance. In particular the
-- browser must never infer that the unmerged/future institutional schema
-- is available merely because a World route exists.
-- Preserve all existing feature-flag keys, including Public Live and Organizer.
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
      'solaris_app_v3_rules_guidance', 'solaris_app_v3_results',
      'solaris_app_v3_me', 'solaris_app_v3_entry',
      'solaris_app_v3_jury', 'solaris_app_v3_live',
      'solaris_app_v3_organizer', 'terra_world_public'
    )
  );

-- Start dark. Organizers may enable the key only after the TG2 migrations,
-- TG3 public authorization checks and publication-safe deployment are verified.
-- Never overwrite an explicit prior rollout decision during an upgrade.
insert into public.studio2_feature_flags
  (key, enabled, admins_only, user_ids, edition_ids)
values
  ('terra_world_public', false, false, '{}'::uuid[], '{}'::uuid[])
on conflict (key) do nothing;

notify pgrst, 'reload schema';

commit;
