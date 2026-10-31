begin;

-- Jury Share Cards rollout remains independently reversible. The public RPC
-- exists as a server-owned boundary, but user/browser callers must not reach
-- the projection until the canonical rollout flag enables their scope.
-- Service-side render/reconciliation callers remain able to use the boundary.
select public.v3_register_migration_contract(
  'v3.results.jury-share-rollout-gate-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Register the disabled Jury Share rollout flag and fail closed at the public projection boundary until canonical rollout enables the caller scope.'
);

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
      'solaris_app_v3_organizer', 'jury_share_cards_v1'
    )
  );

insert into public.studio2_feature_flags (
  key, enabled, admins_only, user_ids, edition_ids
)
values (
  'jury_share_cards_v1', false, false, '{}'::uuid[], '{}'::uuid[]
)
on conflict (key) do nothing;

-- Move the unrestricted implementation behind a private server-only core.
-- The public name remains stable for downstream Public work, while the wrapper
-- owns rollout eligibility and the core continues to own publication/object
-- authorization. Direct execution of the core is intentionally unavailable.
alter function public.v3_jury_share_projection(uuid, uuid)
  set schema private;
alter function private.v3_jury_share_projection(uuid, uuid)
  rename to v3_jury_share_projection_core;

revoke all on function private.v3_jury_share_projection_core(uuid, uuid)
  from public, anon, authenticated, service_role;

create or replace function public.v3_jury_share_projection(
  p_show_id uuid,
  p_voter_country_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $projection_gate$
declare
  v_edition_id uuid;
  v_service boolean := private.studio2_request_is_service_role();
begin
  if p_show_id is null or p_voter_country_id is null then
    raise exception 'Jury share projection requires show and voter country identity'
      using errcode = '22023';
  end if;

  select show_row.edition_id
  into v_edition_id
  from public.shows show_row
  where show_row.id = p_show_id;

  if v_edition_id is null then
    raise exception 'Show not found' using errcode = 'P0002';
  end if;

  if not v_service
     and not private.studio2_feature_enabled_for(
       auth.uid(),
       'jury_share_cards_v1',
       v_edition_id
     ) then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_FEATURE_DISABLED',
      'serverTime', now()
    );
  end if;

  return private.v3_jury_share_projection_core(
    p_show_id,
    p_voter_country_id
  );
end
$projection_gate$;

revoke all on function public.v3_jury_share_projection(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.v3_jury_share_projection(uuid, uuid)
  to anon, authenticated, service_role;

comment on function public.v3_jury_share_projection(uuid, uuid) is
  'Rollout-gated Jury Share projection. jury_share_cards_v1 controls user/browser availability; the private core still enforces canonical publication, ballot ownership and exact Result Version evidence.';

notify pgrst, 'reload schema';

commit;
