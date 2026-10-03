begin;

-- Organisation OS V5 review hardening.
--
-- This migration intentionally repairs already-applied V5 validation databases
-- instead of rewriting migration history. Fresh replays also converge on the
-- same final contracts.

-- Operation receipts are audit/idempotency evidence. Deleting an auth account
-- must not delete the command receipts that account produced.
alter table public.studio2_operation_receipts
  alter column actor_id drop not null;

alter table public.studio2_operation_receipts
  drop constraint if exists studio2_operation_receipts_actor_id_fkey;

alter table public.studio2_operation_receipts
  add constraint studio2_operation_receipts_actor_id_fkey
  foreign key (actor_id)
  references auth.users(id)
  on delete set null;

-- A task recipient is authoritative only while the assignment/capability rules
-- still select that user. This predicate is deliberately reusable by both Inbox
-- reconciliation and delivery safety.
create or replace function private.studio2_task_recipient_eligible(
  p_task_id uuid,
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $eligible$
  select exists (
    select 1
    from public.studio2_organizer_tasks task
    where task.id = p_task_id
      and task.state <> 'resolved'
      and p_user_id is not null
      and private.studio2_user_has_capability(
        p_user_id,
        task.required_capability,
        task.edition_id
      )
      and (
        task.assigned_to = p_user_id
        or task.assigned_to is null
        or not coalesce(
          private.studio2_user_has_capability(
            task.assigned_to,
            task.required_capability,
            task.edition_id
          ),
          false
        )
      )
  );
$eligible$;

revoke all on function private.studio2_task_recipient_eligible(uuid, uuid)
  from public, anon, authenticated;


create or replace function public.solaris_organizer_task_recipient_eligible(
  p_task_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $service_eligible$
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  return private.studio2_task_recipient_eligible(p_task_id, p_user_id);
end
$service_eligible$;

revoke all on function public.solaris_organizer_task_recipient_eligible(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.solaris_organizer_task_recipient_eligible(uuid, uuid)
  to service_role;

create or replace function private.studio2_prune_stale_task_notifications(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $prune$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  update public.admin_notifications notification
  set
    resolved_at = coalesce(notification.resolved_at, now()),
    requires_action = false
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and task.state <> 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and not private.studio2_task_recipient_eligible(
      task.id,
      notification.recipient_id
    )
    and (
      notification.resolved_at is null
      or notification.requires_action
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  update public.notification_deliveries delivery
  set
    status = 'suppressed',
    processing_started_at = null,
    error = case
      when task.state = 'resolved'
        then 'Organizer Task resolved before delivery.'
      else 'Organizer Task recipient is no longer eligible.'
    end
  from public.studio2_organizer_tasks task
  where delivery.category = 'organizer_tasks'
    and delivery.subject_id = task.id::text
    and delivery.status in ('pending', 'processing', 'failed')
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and (
      task.state = 'resolved'
      or not private.studio2_task_recipient_eligible(
        task.id,
        delivery.user_id
      )
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  return v_changed;
end
$prune$;

revoke all on function private.studio2_prune_stale_task_notifications(uuid)
  from public, anon, authenticated;

-- Keep the existing canonical reconcilers, then remove projections whose
-- recipient is no longer authoritative before the push worker can claim them.
create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $alltasks$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

-- A permission assignment is "already applied" only if its expiry is exactly
-- the requested expiry. Existing access with a different expiry is a real
-- mutation and must remain executable through the governed R3 path.
create or replace function public.studio2_permission_change_preview(
  p_user_id uuid,
  p_change_kind text,
  p_key text,
  p_edition_id uuid default null,
  p_expires_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $preview$
declare
  v_actor uuid := auth.uid();
  v_version bigint := 0;
  v_display_name text;
  v_capabilities text[];
  v_already_applied boolean := false;
  v_grants_permission_admin boolean := false;
  v_global_scope boolean := p_edition_id is null;
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required' using errcode = '42501';
  end if;
  if p_user_id is null then
    raise exception 'Permission target user is required' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Permission target user was not found' using errcode = 'P0002';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Permission expiry must be in the future' using errcode = '22023';
  end if;

  v_capabilities := private.studio2_permission_change_capabilities(p_change_kind, p_key);

  select coalesce((
    select subject.version
    from public.studio2_permission_subject_versions subject
    where subject.user_id = p_user_id
  ), 0)
  into v_version;

  select coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'instagram_username'), ''),
    split_part(coalesce(u.email, ''), '@', 1),
    'User'
  )
  into v_display_name
  from auth.users u
  where u.id = p_user_id;

  if p_change_kind = 'assign_role' then
    v_already_applied := exists (
      select 1 from public.studio2_role_assignments a
      where a.user_id = p_user_id
        and a.role_key = p_key
        and a.edition_id is not distinct from p_edition_id
        and a.expires_at is not distinct from p_expires_at
    );
  elsif p_change_kind = 'revoke_role' then
    v_already_applied := not exists (
      select 1 from public.studio2_role_assignments a
      where a.user_id = p_user_id
        and a.role_key = p_key
        and a.edition_id is not distinct from p_edition_id
    );
  elsif p_change_kind = 'grant_capability' then
    v_already_applied := exists (
      select 1 from public.studio2_capability_grants g
      where g.user_id = p_user_id
        and g.capability = p_key
        and g.edition_id is not distinct from p_edition_id
        and g.expires_at is not distinct from p_expires_at
    );
  elsif p_change_kind = 'revoke_capability' then
    v_already_applied := not exists (
      select 1 from public.studio2_capability_grants g
      where g.user_id = p_user_id
        and g.capability = p_key
        and g.edition_id is not distinct from p_edition_id
    );
  end if;

  v_grants_permission_admin := 'permissions.manage' = any(v_capabilities);

  return jsonb_build_object(
    'riskClass', 'R3',
    'targetUserId', p_user_id,
    'targetDisplayName', v_display_name,
    'changeKind', p_change_kind,
    'key', p_key,
    'editionId', p_edition_id,
    'expiresAt', p_expires_at,
    'expectedVersion', v_version,
    'alreadyApplied', v_already_applied,
    'affectedCapabilities', to_jsonb(v_capabilities),
    'globalScope', v_global_scope,
    'grantsPermissionAdministration', v_grants_permission_admin,
    'warnings',
      jsonb_strip_nulls(jsonb_build_object(
        'globalScope',
          case when v_global_scope
            then 'This access change applies across every edition.'
            else null end,
        'permissionAdministration',
          case when v_grants_permission_admin
            then 'This change affects the ability to administer Solaris permissions.'
            else null end,
        'selfChange',
          case when p_user_id = v_actor
            then 'You are changing your own effective access.'
            else null end
      ))
  );
end
$preview$;

revoke all on function public.studio2_permission_change_preview(
  uuid, text, text, uuid, timestamptz
) from public, anon;
grant execute on function public.studio2_permission_change_preview(
  uuid, text, text, uuid, timestamptz
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
