create index if not exists studio2_role_capabilities_capability_idx
  on public.studio2_role_capabilities (capability);
create index if not exists studio2_role_assignments_assigned_by_idx
  on public.studio2_role_assignments (assigned_by);
create index if not exists studio2_role_assignments_edition_id_idx
  on public.studio2_role_assignments (edition_id);
create index if not exists permission_evaluation_events_capability_idx
  on public.permission_evaluation_events (capability);
create index if not exists permission_evaluation_events_edition_id_idx
  on public.permission_evaluation_events (edition_id);
