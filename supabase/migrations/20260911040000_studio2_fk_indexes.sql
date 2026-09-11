begin;

-- Cover Studio 2 foreign keys that are not already the leading columns of a
-- primary key or operational index. This avoids expensive referenced-row
-- deletes/updates and clears the new-schema FK performance advisor findings.
create index if not exists studio2_capability_grants_edition_id_idx
  on public.studio2_capability_grants (edition_id);
create index if not exists studio2_capability_grants_granted_by_idx
  on public.studio2_capability_grants (granted_by);
create index if not exists studio2_contest_events_actor_user_id_idx
  on public.studio2_contest_events (actor_user_id);
create index if not exists studio2_delegation_settings_country_id_idx
  on public.studio2_delegation_settings (country_id);
create index if not exists studio2_delegation_settings_updated_by_idx
  on public.studio2_delegation_settings (updated_by);
create index if not exists studio2_edition_runtime_updated_by_idx
  on public.studio2_edition_runtime (updated_by);
create index if not exists studio2_feature_flags_updated_by_idx
  on public.studio2_feature_flags (updated_by);
create index if not exists studio2_incidents_created_by_idx
  on public.studio2_incidents (created_by);
create index if not exists studio2_incidents_updated_by_idx
  on public.studio2_incidents (updated_by);
create index if not exists studio2_jury_members_assigned_by_idx
  on public.studio2_jury_members (assigned_by);
create index if not exists studio2_jury_members_country_id_idx
  on public.studio2_jury_members (country_id);
create index if not exists studio2_jury_members_member_user_id_idx
  on public.studio2_jury_members (member_user_id);
create index if not exists studio2_jury_members_removed_by_idx
  on public.studio2_jury_members (removed_by);
create index if not exists studio2_official_notices_created_by_idx
  on public.studio2_official_notices (created_by);
create index if not exists studio2_transition_approval_approved_by_idx
  on public.studio2_transition_approval_requests (approved_by);
create index if not exists studio2_transition_approval_requested_by_idx
  on public.studio2_transition_approval_requests (requested_by);

commit;
