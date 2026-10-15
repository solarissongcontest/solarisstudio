begin;

-- System V3 S3 Identity / Access invariants.
--
-- Organisation OS accumulated two per-user permission revision ledgers while
-- the governed R3 access command was evolving. The newer subject ledger is the
-- runtime authority used by current previews, commands and R3 approvals. Keep
-- one canonical source of truth, conservatively merge any legacy revisions,
-- and retire the duplicate storage without weakening stale-preview rejection.

-- Refuse to continue if the authoritative access relations themselves are
-- already contradictory. S3 repairs only data that can be derived safely.
do $audit$
begin
  if exists (
    select 1
    from public.studio2_role_assignments assignment
    left join auth.users user_row on user_row.id = assignment.user_id
    left join public.studio2_access_roles role_row on role_row.key = assignment.role_key
    where user_row.id is null or role_row.key is null
  ) then
    raise exception 'Permission role assignments contain orphan identity or role references';
  end if;

  if exists (
    select 1
    from public.studio2_capability_grants grant_row
    left join auth.users user_row on user_row.id = grant_row.user_id
    left join public.studio2_capabilities capability on capability.key = grant_row.capability
    where user_row.id is null or capability.key is null
  ) then
    raise exception 'Permission capability grants contain orphan identity or capability references';
  end if;
end
$audit$;

-- Merge any historical state-ledger revision into the canonical subject ledger.
-- GREATEST is deliberately conservative: if the ledgers ever diverged, taking
-- the higher revision invalidates stale optimistic-concurrency tokens instead
-- of incorrectly treating them as current.
insert into public.studio2_permission_subject_versions (user_id, version, updated_at)
select legacy.user_id, legacy.version, legacy.updated_at
from public.studio2_permission_state_versions legacy
on conflict (user_id) do update
set version = greatest(
      public.studio2_permission_subject_versions.version,
      excluded.version
    ),
    updated_at = greatest(
      public.studio2_permission_subject_versions.updated_at,
      excluded.updated_at
    );

-- Existing access predates both ledgers for some subjects. Revision zero is the
-- already-established semantic baseline used by all current permission RPCs;
-- materialise it explicitly so every authoritative subject has one row.
insert into public.studio2_permission_subject_versions (user_id, version, updated_at)
select subject.user_id, 0, now()
from (
  select user_id from public.studio2_role_assignments
  union
  select user_id from public.studio2_capability_grants
) subject
on conflict (user_id) do nothing;

-- Stop the duplicate trigger path before compatibility helpers are redirected.
drop trigger if exists studio2_role_assignment_version_bump
  on public.studio2_role_assignments;
drop trigger if exists studio2_capability_grant_version_bump
  on public.studio2_capability_grants;

-- Preserve the older private helper names for migration/rollback compatibility,
-- but make every one operate on the canonical subject ledger.
create or replace function private.studio2_ensure_permission_version(
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $permver$
declare
  v_version bigint;
begin
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Permission target user is required' using errcode = '22023';
  end if;

  insert into public.studio2_permission_subject_versions (user_id, version, updated_at)
  values (p_user_id, 0, now())
  on conflict (user_id) do nothing;

  select subject.version
  into v_version
  from public.studio2_permission_subject_versions subject
  where subject.user_id = p_user_id;

  return coalesce(v_version, 0);
end
$permver$;

create or replace function private.studio2_lock_permission_version(
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $permlock$
declare
  v_version bigint;
begin
  perform private.studio2_ensure_permission_version(p_user_id);

  select subject.version
  into v_version
  from public.studio2_permission_subject_versions subject
  where subject.user_id = p_user_id
  for update;

  return v_version;
end
$permlock$;

create or replace function private.studio2_bump_permission_version(
  p_user_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $permbump$
declare
  v_version bigint;
begin
  perform private.studio2_ensure_permission_version(p_user_id);

  update public.studio2_permission_subject_versions
  set version = version + 1,
      updated_at = now()
  where user_id = p_user_id
  returning version into v_version;

  return v_version;
end
$permbump$;

create or replace function private.studio2_permission_state_version_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $permtrigger$
begin
  if tg_op = 'DELETE' then
    perform private.studio2_bump_permission_version(old.user_id);
    return old;
  end if;

  if tg_op = 'UPDATE' and old.user_id is distinct from new.user_id then
    perform private.studio2_bump_permission_version(old.user_id);
  end if;

  perform private.studio2_bump_permission_version(new.user_id);
  return new;
end
$permtrigger$;

revoke all on function private.studio2_ensure_permission_version(uuid)
  from public, anon, authenticated;
revoke all on function private.studio2_lock_permission_version(uuid)
  from public, anon, authenticated;
revoke all on function private.studio2_bump_permission_version(uuid)
  from public, anon, authenticated;
revoke all on function private.studio2_permission_state_version_trigger()
  from public, anon, authenticated;

-- The canonical subject triggers from Organisation OS V5 remain the only
-- mutation-driven revision path. Fail closed if a replay somehow lost them.
do $trigger_audit$
begin
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.studio2_role_assignments'::regclass
      and tgname = 'studio2_role_assignments_touch_subject_version'
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'Canonical role-assignment permission revision trigger is missing';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.studio2_capability_grants'::regclass
      and tgname = 'studio2_capability_grants_touch_subject_version'
      and not tgisinternal
      and tgenabled <> 'D'
  ) then
    raise exception 'Canonical capability-grant permission revision trigger is missing';
  end if;
end
$trigger_audit$;

-- Duplicate storage is now retired. Current runtime code already reads the
-- subject ledger, and the compatibility helper surface above no longer depends
-- on this table.
drop table public.studio2_permission_state_versions;

comment on table public.studio2_permission_subject_versions is
  'Canonical per-user permission revision used for optimistic concurrency, R3 approval staleness and access-state invalidation.';

commit;
