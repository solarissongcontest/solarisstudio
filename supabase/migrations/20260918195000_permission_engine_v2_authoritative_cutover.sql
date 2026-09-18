begin;

-- Permission Engine v2 final authoritative cutover.
-- All legacy RLS policy predicates have already been removed in the preceding
-- production-aligned batches. This migration removes the remaining legacy-role
-- authorization fallbacks, makes capability enforcement authoritative, and
-- freezes legacy user_roles as read-only rollback/history data.

-- Preserve every live Organizer before removing legacy fallback semantics.
insert into public.studio2_role_assignments (
  user_id, role_key, edition_id, expires_at, assigned_by
)
select ur.user_id, 'organizer', null, null, null
from public.user_roles ur
join auth.users au on au.id = ur.user_id
where ur.role::text = 'organizer'
  and not exists (
    select 1
    from public.studio2_role_assignments a
    where a.user_id = ur.user_id
      and a.role_key in ('organizer', 'superadmin')
      and (a.expires_at is null or a.expires_at > now())
  )
on conflict do nothing;

delete from public.user_roles ur
where not exists (select 1 from auth.users au where au.id = ur.user_id);

-- Legacy roles are no longer writable. They remain readable as rollback/history
-- data until a separately reviewed destructive cleanup removes the table.
drop policy if exists "bootstrap first organizer" on public.user_roles;
drop policy if exists "capability managers grant legacy roles" on public.user_roles;

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
        and (g.edition_id is null or (p_edition_id is not null and g.edition_id = p_edition_id))
    )
    or exists (
      select 1
      from public.studio2_role_assignments a
      join public.studio2_role_capabilities rc on rc.role_key = a.role_key
      where a.user_id = p_user_id
        and rc.capability = p_capability
        and (a.expires_at is null or a.expires_at > now())
        and (a.edition_id is null or (p_edition_id is not null and a.edition_id = p_edition_id))
    )
  )
$function$;

create or replace function private.studio2_user_is_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select private.studio2_user_has_capability(p_user_id, 'permissions.manage', null)
     and private.studio2_user_has_capability(p_user_id, 'edition.manage', null)
$function$;

revoke all on function private.studio2_user_is_platform_admin(uuid)
from public, anon, authenticated, service_role;

create or replace function private.studio2_country_claim_blocked(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select coalesce(
    private.studio2_user_has_capability(p_user_id, 'delegation.manage', null),
    false
  )
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
  select private.studio2_user_has_capability(p_user_id, p_capability, p_edition_id)
$function$;

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
  return private.studio2_user_has_capability(v_actor, p_capability, p_edition_id);
end
$function$;

-- Keep the historical RPC name so existing probes remain backwards-compatible.
-- It now records authoritative capability decisions rather than comparing two
-- authorization systems.
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
  if not exists (select 1 from public.studio2_capabilities where key = p_capability) then
    raise exception 'Unknown Solaris capability: %', p_capability using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_action, ''))) not between 1 and 160 then
    raise exception 'Permission action is required' using errcode = '22023';
  end if;
  if p_route is not null and length(p_route) > 500 then
    raise exception 'Permission route is too long' using errcode = '22023';
  end if;

  v_capability_allowed := private.studio2_user_has_capability(v_actor, p_capability, p_edition_id);

  insert into public.permission_evaluation_events (
    user_id, edition_id, capability, legacy_allowed, capability_allowed, action, route
  ) values (
    v_actor, p_edition_id, p_capability, v_capability_allowed, v_capability_allowed, btrim(p_action), p_route
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

-- Replace the three remaining organizer-audience compatibility checks with a
-- v2 platform-admin capability predicate without rewriting their stable
-- recipient logic.
do $notice_cutover$
declare
  v_signature text;
  v_oid oid;
  v_def text;
  v_new_def text;
begin
  foreach v_signature in array array[
    'private.studio2_user_can_receive_notice_as_recipient(uuid,uuid,text,uuid[],text)',
    'private.studio2_user_can_receive_notice_v2(uuid,uuid,text,uuid[],text)',
    'private.studio2_user_can_receive_notice_v2_legacy_roster(uuid,uuid,text,uuid[],text)'
  ]
  loop
    v_oid := to_regprocedure(v_signature);
    if v_oid is null then
      raise exception 'Missing notice authorization helper: %', v_signature;
    end if;
    v_def := pg_get_functiondef(v_oid);
    v_new_def := replace(
      v_def,
      'public.has_role(p_user_id, ''organizer''::public.app_role)',
      'private.studio2_user_is_platform_admin(p_user_id)'
    );
    if v_new_def = v_def then
      raise exception 'Expected legacy Organizer check missing from %', v_signature;
    end if;
    execute v_new_def;
  end loop;
end
$notice_cutover$;

-- Clean migration replay still carries three old publication/result RPCs that
-- long-lived production no longer exposes. Rewrite them when present so a fresh
-- Solaris database reaches the same capability-only authorization state.
do $legacy_publication_cutover$
declare
  v_oid oid;
  v_before text;
  v_after text;
begin
  v_oid := to_regprocedure('public.publish_show_results(uuid,jsonb)');
  if v_oid is not null then
    v_before := pg_get_functiondef(v_oid);
    v_after := regexp_replace(
      v_before,
      'IF\\s+NOT\\s+public\\.has_role\\(\\s*auth\\.uid\\(\\),\\s*''organizer''::public\\.app_role\\s*\\)\\s+THEN\\s+RAISE\\s+EXCEPTION\\s+''Only organizers can publish results\\.''\\s+USING\\s+ERRCODE\\s*=\\s*''42501'';\\s+END\\s+IF;',
      'IF NOT public.studio2_access_allowed(''results.publish'', (select s.edition_id from public.shows s where s.id = p_show_id), false) THEN RAISE EXCEPTION ''Missing Solaris capability: results.publish'' USING ERRCODE = ''42501''; END IF;',
      'i'
    );
    if v_after = v_before or v_after ilike '%public.has_role%' then
      raise exception 'Could not migrate publish_show_results legacy Organizer guard';
    end if;
    execute v_after;
  end if;

  v_oid := to_regprocedure('public.refresh_show_results(uuid)');
  if v_oid is not null then
    v_before := pg_get_functiondef(v_oid);
    v_after := regexp_replace(
      v_before,
      'if\\s+auth\\.uid\\(\\)\\s+is\\s+not\\s+null\\s+and\\s+not\\s+public\\.has_role\\(\\s*auth\\.uid\\(\\),\\s*''organizer''::public\\.app_role\\s*\\)\\s+then\\s+raise\\s+exception\\s+''Only organizers can refresh show results\\.''\\s+using\\s+errcode\\s*=\\s*''42501'';\\s+end\\s+if;',
      'if auth.uid() is not null and not public.studio2_access_allowed(''results.verify'', (select s.edition_id from public.shows s where s.id = p_show_id), false) then raise exception ''Missing Solaris capability: results.verify'' using errcode = ''42501''; end if;',
      'i'
    );
    if v_after = v_before or v_after ilike '%public.has_role%' then
      raise exception 'Could not migrate refresh_show_results legacy Organizer guard';
    end if;
    execute v_after;
  end if;

  v_oid := to_regprocedure('public.sync_one_edition_publication(uuid)');
  if v_oid is not null then
    v_before := pg_get_functiondef(v_oid);
    v_after := regexp_replace(
      v_before,
      'if\\s+auth\\.uid\\(\\)\\s+is\\s+not\\s+null\\s+and\\s+not\\s+public\\.has_role\\(\\s*auth\\.uid\\(\\),\\s*''organizer''::public\\.app_role\\s*\\)\\s+then\\s+raise\\s+exception\\s+''Only organizers can sync edition publication\\.''\\s+using\\s+errcode\\s*=\\s*''42501'';\\s+end\\s+if;',
      'if auth.uid() is not null and not public.studio2_access_allowed(''publishing.manage'', p_edition_id, false) then raise exception ''Missing Solaris capability: publishing.manage'' using errcode = ''42501''; end if;',
      'i'
    );
    if v_after = v_before or v_after ilike '%public.has_role%' then
      raise exception 'Could not migrate sync_one_edition_publication legacy Organizer guard';
    end if;
    execute v_after;
  end if;
end
$legacy_publication_cutover$;

-- Integrity has many stable governed RPCs that call the semantic helper.
-- Keep the helper name as a compatibility boundary, but make its decision
-- capability-only so none of those RPCs retain legacy Organizer semantics.
create or replace function public.integrity_is_organizer()
returns boolean
language sql
stable
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
  select public.studio2_access_allowed('integrity.manage', null, false)
$function$;

revoke all on function public.integrity_is_organizer()
from public, anon;
grant execute on function public.integrity_is_organizer()
to authenticated, service_role;

-- These helpers have no remaining authorization callers after cutover.
drop function if exists public.organizer_exists();
drop function if exists public.has_role(uuid, public.app_role);

-- Make Permission Engine v2 globally authoritative.
update public.studio2_feature_flags
set enabled = true,
    admins_only = false,
    user_ids = '{}'::uuid[],
    edition_ids = '{}'::uuid[],
    updated_by = null
where key = 'permission_engine_v2';

-- Final exact-head acceptance guard: this block must pass unchanged in clean
-- replay, upgraded main, and production before authoritative rollout is merged.
do $verify$
declare
  v_missing_live_organizers bigint;
  v_legacy_policy_debt bigint;
  v_direct_role_function_debt bigint;
  v_direct_role_function_names text;
  v_flag_enabled boolean;
begin
  select count(*) into v_missing_live_organizers
  from public.user_roles ur
  join auth.users au on au.id = ur.user_id
  where ur.role::text = 'organizer'
    and not exists (
      select 1
      from public.studio2_role_assignments a
      where a.user_id = ur.user_id
        and a.role_key in ('organizer', 'superadmin')
        and (a.expires_at is null or a.expires_at > now())
    );

  if v_missing_live_organizers <> 0 then
    raise exception 'Live legacy Organizers missing v2 assignment: %', v_missing_live_organizers;
  end if;

  select count(*) into v_legacy_policy_debt
  from pg_policies
  where schemaname in ('public', 'storage', 'televoting')
    and (
      coalesce(qual, '') ilike '%has_role%'
      or coalesce(with_check, '') ilike '%has_role%'
    );

  if v_legacy_policy_debt <> 0 then
    raise exception 'Legacy role RLS debt remains: %', v_legacy_policy_debt;
  end if;

  select
    count(*),
    string_agg(
      format('%I.%I(%s)', n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)),
      ', ' order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
    )
  into v_direct_role_function_debt, v_direct_role_function_names
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where p.prokind = 'f'
    and n.nspname in ('public', 'private', 'televoting')
    and pg_get_functiondef(p.oid) ilike '%public.has_role%';

  if v_direct_role_function_debt <> 0 then
    raise exception 'Direct legacy role function debt remains: % [%]',
      v_direct_role_function_debt,
      coalesce(v_direct_role_function_names, 'unknown');
  end if;

  select enabled and not admins_only
    and cardinality(coalesce(user_ids, '{}'::uuid[])) = 0
    and cardinality(coalesce(edition_ids, '{}'::uuid[])) = 0
  into v_flag_enabled
  from public.studio2_feature_flags
  where key = 'permission_engine_v2';

  if not coalesce(v_flag_enabled, false) then
    raise exception 'Permission Engine v2 is not globally authoritative';
  end if;
end
$verify$;

notify pgrst, 'reload schema';

commit;
