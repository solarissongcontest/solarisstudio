begin;

-- Permission Engine v2 authoritative cutover.
-- This migration is intentionally the final authorization switch:
-- all protected RLS is capability-aware, Rules/Integrity helpers are migrated,
-- and every live legacy Organizer has a global v2 Organizer assignment.

do $preflight$
declare
  v_live_organizers bigint;
  v_covered_organizers bigint;
  v_evaluations bigint;
  v_mismatches bigint;
  v_legacy_policies bigint;
  v_rulebook_refs bigint;
  v_integrity_refs bigint;
begin
  select count(*)
  into v_live_organizers
  from public.user_roles ur
  join auth.users au on au.id = ur.user_id
  where ur.role::text = 'organizer';

  select count(*)
  into v_covered_organizers
  from public.user_roles ur
  join auth.users au on au.id = ur.user_id
  where ur.role::text = 'organizer'
    and exists (
      select 1
      from public.studio2_role_assignments a
      where a.user_id = ur.user_id
        and a.role_key in ('organizer', 'superadmin')
        and a.edition_id is null
        and (a.expires_at is null or a.expires_at > now())
    );

  if v_live_organizers <> v_covered_organizers then
    raise exception
      'Permission Engine cutover blocked: % live legacy Organizers, % covered by active global v2 Organizer/Superadmin assignments',
      v_live_organizers,
      v_covered_organizers;
  end if;

  select
    count(*),
    count(*) filter (where legacy_allowed is distinct from capability_allowed)
  into v_evaluations, v_mismatches
  from public.permission_evaluation_events
  where created_at >= now() - interval '30 days';

  if v_evaluations = 0 then
    raise exception 'Permission Engine cutover blocked: no real permission observations in the last 30 days';
  end if;

  if v_mismatches <> 0 then
    raise exception 'Permission Engine cutover blocked: % unresolved permission mismatches in the last 30 days', v_mismatches;
  end if;

  select count(*)
  into v_legacy_policies
  from pg_policies
  where schemaname in ('public', 'storage', 'televoting')
    and (
      coalesce(qual, '') ilike '%has_role%'
      or coalesce(with_check, '') ilike '%has_role%'
    );

  if v_legacy_policies <> 0 then
    raise exception 'Permission Engine cutover blocked: % legacy has_role RLS policies remain', v_legacy_policies;
  end if;

  select count(*)
  into v_rulebook_refs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f'
    and n.nspname in ('public', 'private', 'televoting')
    and pg_get_functiondef(p.oid) ilike '%rulebook_is_organizer%';

  if v_rulebook_refs <> 0 then
    raise exception 'Permission Engine cutover blocked: % Rulebook Organizer-helper references remain', v_rulebook_refs;
  end if;

  select count(*)
  into v_integrity_refs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f'
    and n.nspname in ('public', 'private', 'televoting')
    and pg_get_functiondef(p.oid) ilike '%integrity_is_organizer%';

  if v_integrity_refs <> 0 then
    raise exception 'Permission Engine cutover blocked: % Integrity Organizer-helper references remain', v_integrity_refs;
  end if;
end
$preflight$;

-- From this point on, capability evaluation has no legacy user_roles fallback.
create or replace function private.studio2_user_has_capability(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select p_user_id is not null and (
    exists (
      select 1
      from public.studio2_capability_grants g
      where g.user_id = p_user_id
        and g.capability = p_capability
        and (g.expires_at is null or g.expires_at > now())
        and (
          g.edition_id is null
          or (p_edition_id is not null and g.edition_id = p_edition_id)
        )
    )
    or exists (
      select 1
      from public.studio2_role_assignments a
      join public.studio2_role_capabilities rc on rc.role_key = a.role_key
      where a.user_id = p_user_id
        and rc.capability = p_capability
        and (a.expires_at is null or a.expires_at > now())
        and (
          a.edition_id is null
          or (p_edition_id is not null and a.edition_id = p_edition_id)
        )
    )
  );
$function$;

create or replace function private.studio2_user_is_global_organizer(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select p_user_id is not null
    and exists (
      select 1
      from public.studio2_role_assignments a
      where a.user_id = p_user_id
        and a.role_key in ('organizer', 'superadmin')
        and a.edition_id is null
        and (a.expires_at is null or a.expires_at > now())
    );
$function$;

revoke all on function private.studio2_user_is_global_organizer(uuid)
from public, anon, authenticated, service_role;

create or replace function public.studio2_is_global_organizer()
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select private.studio2_user_is_global_organizer(auth.uid());
$function$;

revoke all on function public.studio2_is_global_organizer()
from public, anon;
grant execute on function public.studio2_is_global_organizer()
to authenticated, service_role;

create or replace function public.studio2_current_capabilities(
  p_edition_id uuid default null
)
returns text[]
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select case
    when auth.uid() is null then array[]::text[]
    else coalesce(
      (
        select array_agg(c.key order by c.key)
        from public.studio2_capabilities c
        where private.studio2_user_has_capability(
          auth.uid(),
          c.key,
          p_edition_id
        )
      ),
      array[]::text[]
    )
  end;
$function$;

revoke all on function public.studio2_current_capabilities(uuid)
from public, anon;
grant execute on function public.studio2_current_capabilities(uuid)
to authenticated, service_role;

-- Keep the public helper signature stable for RLS/RPC callers, but make the
-- decision capability-only. The strict-before-cutover argument is retained
-- solely for call-site compatibility and no longer changes authorization.
create or replace function public.studio2_access_allowed(
  p_capability text,
  p_edition_id uuid default null,
  p_strict_before_cutover boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if private.studio2_request_is_service_role() then
    return true;
  end if;

  if v_actor is null then
    return false;
  end if;

  return private.studio2_user_has_capability(
    v_actor,
    p_capability,
    p_edition_id
  );
end
$function$;

create or replace function private.studio2_user_access_allowed(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null,
  p_strict_before_cutover boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select private.studio2_user_has_capability(
    p_user_id,
    p_capability,
    p_edition_id
  );
$function$;

create or replace function private.studio2_country_claim_blocked(
  p_user_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select private.studio2_user_has_capability(
    p_user_id,
    'delegation.manage',
    null
  );
$function$;

-- Organizer-targeted notices now resolve the v2 global Organizer assignment
-- rather than the legacy user_roles table.
do $notice_cutover$
declare
  v_signature text;
  v_oid oid;
  v_def text;
  v_new_def text;
  v_occurrences integer;
begin
  foreach v_signature in array array[
    'private.studio2_user_can_receive_notice_as_recipient(uuid,uuid,text,uuid[],text)',
    'private.studio2_user_can_receive_notice_v2(uuid,uuid,text,uuid[],text)',
    'private.studio2_user_can_receive_notice_v2_legacy_roster(uuid,uuid,text,uuid[],text)'
  ]
  loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Notice authorization cutover target missing: %', v_signature;
    end if;

    v_def := pg_get_functiondef(v_oid);
    v_occurrences := (
      length(v_def)
      - length(replace(
          v_def,
          'public.has_role(p_user_id, ''organizer''::public.app_role)',
          ''
        ))
    ) / length('public.has_role(p_user_id, ''organizer''::public.app_role)');

    if v_occurrences <> 1 then
      raise exception 'Expected one legacy Organizer check in %, found %',
        v_signature,
        v_occurrences;
    end if;

    v_new_def := replace(
      v_def,
      'public.has_role(p_user_id, ''organizer''::public.app_role)',
      'private.studio2_user_is_global_organizer(p_user_id)'
    );

    execute v_new_def;
  end loop;
end
$notice_cutover$;

-- Preserve comparison telemetry as an audit stream after cutover. The route
-- probe now records the authoritative capability decision rather than a legacy
-- comparison that no longer has enforcement meaning.
create or replace function public.studio2_check_capability_shadow(
  p_capability text,
  p_edition_id uuid default null,
  p_action text default 'route.access',
  p_route text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_actor uuid := auth.uid();
  v_capability_allowed boolean;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.studio2_capabilities
    where key = p_capability
  ) then
    raise exception 'Unknown Solaris capability: %', p_capability
      using errcode = '22023';
  end if;

  if length(btrim(coalesce(p_action, ''))) not between 1 and 160 then
    raise exception 'Permission action is required' using errcode = '22023';
  end if;

  if p_route is not null and length(p_route) > 500 then
    raise exception 'Permission route is too long' using errcode = '22023';
  end if;

  v_capability_allowed := private.studio2_user_has_capability(
    v_actor,
    p_capability,
    p_edition_id
  );

  insert into public.permission_evaluation_events (
    user_id,
    edition_id,
    capability,
    legacy_allowed,
    capability_allowed,
    action,
    route
  ) values (
    v_actor,
    p_edition_id,
    p_capability,
    v_capability_allowed,
    v_capability_allowed,
    btrim(p_action),
    p_route
  );

  return jsonb_build_object(
    'allowed', v_capability_allowed,
    'legacyAllowed', v_capability_allowed,
    'capabilityAllowed', v_capability_allowed,
    'matched', true,
    'mode', 'authoritative'
  );
end
$function$;

-- Access simulation now exposes v2 roles only. The legacy table remains
-- readable for historical audit, but it no longer contributes authority.
create or replace function public.studio2_view_access_as(
  p_user_id uuid,
  p_edition_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null or not private.studio2_can_manage_permissions(v_actor) then
    raise exception 'Permission management capability required'
      using errcode = '42501';
  end if;

  if p_user_id is null
     or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Access simulation user is required'
      using errcode = '22023';
  end if;

  return jsonb_build_object(
    'userId', p_user_id,
    'editionId', p_edition_id,
    'roles', coalesce((
      select jsonb_agg(a.role_key order by a.role_key)
      from public.studio2_role_assignments a
      where a.user_id = p_user_id
        and (a.expires_at is null or a.expires_at > now())
        and (
          a.edition_id is null
          or (p_edition_id is not null and a.edition_id = p_edition_id)
        )
    ), '[]'::jsonb),
    'capabilities', coalesce((
      select jsonb_agg(c.key order by c.key)
      from public.studio2_capabilities c
      where private.studio2_user_has_capability(
        p_user_id,
        c.key,
        p_edition_id
      )
    ), '[]'::jsonb),
    'readOnly', true
  );
end
$function$;

-- Legacy roles become audit-only. New authorization assignments must go
-- through Permission Engine v2.
drop policy if exists "bootstrap first organizer" on public.user_roles;
drop policy if exists "capability managers grant legacy roles" on public.user_roles;

delete from public.user_roles ur
where not exists (
  select 1
  from auth.users au
  where au.id = ur.user_id
);

-- No live function or policy may still depend on has_role before retiring it.
do $legacy_helper_verify$
declare
  v_function_refs bigint;
  v_policy_refs bigint;
begin
  select count(*)
  into v_function_refs
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f'
    and n.nspname in ('public', 'private', 'televoting')
    and p.oid <> to_regprocedure('public.has_role(uuid,public.app_role)')
    and pg_get_functiondef(p.oid) ilike '%public.has_role(%';

  if v_function_refs <> 0 then
    raise exception 'Cannot retire has_role: % live function references remain',
      v_function_refs;
  end if;

  select count(*)
  into v_policy_refs
  from pg_policies
  where coalesce(qual, '') ilike '%has_role%'
     or coalesce(with_check, '') ilike '%has_role%';

  if v_policy_refs <> 0 then
    raise exception 'Cannot retire has_role: % live policy references remain',
      v_policy_refs;
  end if;
end
$legacy_helper_verify$;

drop function public.has_role(uuid, public.app_role);
drop function public.organizer_exists();

-- The capability engine is now globally authoritative.
update public.studio2_feature_flags
set enabled = true,
    admins_only = false,
    user_ids = '{}'::uuid[],
    edition_ids = '{}'::uuid[],
    updated_by = null
where key = 'permission_engine_v2';

do $final_verify$
declare
  v_flag boolean;
  v_live_missing bigint;
begin
  select private.studio2_permission_engine_authoritative()
  into v_flag;

  if not coalesce(v_flag, false) then
    raise exception 'Permission Engine v2 did not become globally authoritative';
  end if;

  select count(*)
  into v_live_missing
  from public.user_roles ur
  join auth.users au on au.id = ur.user_id
  where ur.role::text = 'organizer'
    and not private.studio2_user_is_global_organizer(ur.user_id);

  if v_live_missing <> 0 then
    raise exception 'Authoritative cutover left % live legacy Organizers without v2 access',
      v_live_missing;
  end if;

  if pg_get_functiondef(
       to_regprocedure('private.studio2_user_has_capability(uuid,text,uuid)')
     ) ilike '%user_roles%' then
    raise exception 'Capability evaluator still contains a legacy user_roles fallback';
  end if;

  if pg_get_functiondef(
       to_regprocedure('public.studio2_access_allowed(text,uuid,boolean)')
     ) ilike '%has_role%' then
    raise exception 'Public capability gate still contains a legacy has_role fallback';
  end if;

  if to_regprocedure('public.has_role(uuid,public.app_role)') is not null then
    raise exception 'Legacy has_role helper still exists';
  end if;

  if to_regprocedure('public.organizer_exists()') is not null then
    raise exception 'Legacy organizer_exists helper still exists';
  end if;
end
$final_verify$;

notify pgrst, 'reload schema';

commit;
