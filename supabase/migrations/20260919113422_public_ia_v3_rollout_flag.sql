begin;

alter table public.studio2_feature_flags
  drop constraint if exists studio2_feature_flags_key_check;

alter table public.studio2_feature_flags
  add constraint studio2_feature_flags_key_check check (
    key in (
      'edition_state_engine',
      'contest_event_engine',
      'permission_engine_v2',
      'workflow_engine',
      'official_communications',
      'hod_workspace_v2',
      'live_control_room',
      'incident_command',
      'broadcast_rundown',
      'results_replay',
      'voting_lab',
      'edition_simulator',
      'rules_engine',
      'public_encyclopedia',
      'public_ia_v3',
      'country_voting_dna',
      'prediction_league',
      'fantasy_ssc',
      'time_machine',
      'solaris_command_assistant'
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
  'public_ia_v3',
  true,
  true,
  '{}'::uuid[],
  '{}'::uuid[]
)
on conflict (key) do nothing;

comment on column public.studio2_feature_flags.admins_only is
  'When true, enabled features are visible only to Organizer-capable users. public_ia_v3 starts here for stage-1 rollout.';

commit;
