begin;

-- Me root is a separately reversible V3 presentation slice.
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
      'solaris_app_v3_rules_guidance', 'solaris_app_v3_results', 'solaris_app_v3_me'
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
  'solaris_app_v3_me',
  false,
  false,
  '{}'::uuid[],
  '{}'::uuid[]
)
on conflict (key) do nothing;

create index if not exists v3_confirmation_operations_submission_scope_idx
  on private.v3_confirmation_operations (round_id, (result ->> 'submission_id'));

-- Caller identity and active delegation are derived inside the database.
-- No browser-local receipts, role labels, tokens or caller-supplied selectors.
create or replace function public.v3_me_confirmation_summary()
returns jsonb language plpgsql stable security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_access jsonb;
  v_count bigint;
  v_history jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  v_access := public.public_country_account_confirmation_access();
  if (v_access ->> 'authenticated') is distinct from 'true' then
    return jsonb_build_object('viewer_id', auth.uid(), 'country_id', null, 'available', false,
      'receipt_count', null, 'history', '[]'::jsonb);
  end if;
  select count(distinct operation.receipt_id) into v_count
  from private.v3_confirmation_operations operation
  join jsonb_array_elements(v_access -> 'responses') response
    on operation.result ->> 'submission_id' = response ->> 'submission_id'
    and operation.round_id::text = response ->> 'round_id';
  select coalesce(jsonb_agg(distinct jsonb_build_object(
    'edition_id', response ->> 'edition_id',
    'edition_name', response ->> 'edition_name',
    'edition_number', response -> 'edition_number'
  )), '[]'::jsonb) into v_history
  from jsonb_array_elements(v_access -> 'responses') response;
  return jsonb_build_object('viewer_id', auth.uid(), 'country_id', v_access #>> '{country,country_id}',
    'available', true, 'receipt_count', v_count, 'history', v_history);
end;
$$;
revoke all on function public.v3_me_confirmation_summary() from public, anon;
grant execute on function public.v3_me_confirmation_summary() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
