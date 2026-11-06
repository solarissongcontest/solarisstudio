begin;

-- WORLD-01 TG2: platform operational mode is canonical for every capability,
-- including World office/representative/country-controller grants.
-- Previously these World-specific branches bypassed Read-only/Maintenance.
-- No new capability source, no signature change, no UI-only authorization.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg2.world-platform-mode-authorization', 1,
      'forward_fix_only', false, null,
      'Require canonical platform operational mode policy for all scoped institutional grants, office-derived and current country-controller capabilities.'
    );
  end if;
end $contract$;

create or replace function public.world_access_allowed(
  p_capability text,
  p_organization_id uuid,
  p_country_id uuid default null,
  p_organ_id uuid default null,
  p_object_type text default null,
  p_object_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $allowed$
  select coalesce(
    auth.uid() is not null
    and p_organization_id is not null
    -- World-scoped grants, offices and country controllers MUST obey the
    -- same platform Read-only/Maintenance policy as ordinary V3 commands.
    -- The singleton row and declared access level are canonical; missing
    -- operational state is not permission to mutate institutional truth.
    and exists (
      select 1
      from public.studio2_capabilities capability
      join public.studio2_platform_operational_state platform_state
        on platform_state.singleton = true
      where capability.key = p_capability
        and platform_state.mode is not null
        and private.studio2_capability_allowed_in_platform_mode(
          p_capability,
          capability.access_level,
          platform_state.mode
        )
    )
    and (
      public.studio2_access_allowed('system.manage', null, false)
      or exists (
        select 1
        from public.studio2_capability_grants grant_row
        join public.world_capability_grant_scopes scope_row
          on scope_row.grant_id = grant_row.id
        where grant_row.user_id = auth.uid()
          and grant_row.capability = p_capability
          and grant_row.edition_id is null
          and (grant_row.expires_at is null or grant_row.expires_at > now())
          and scope_row.organization_id = p_organization_id
          and (scope_row.country_id is null or scope_row.country_id is not distinct from p_country_id)
          and (scope_row.organ_id is null or scope_row.organ_id is not distinct from p_organ_id)
          and (
            scope_row.object_type is null
            or (
              scope_row.object_type is not distinct from p_object_type
              and scope_row.object_id is not distinct from p_object_id
            )
          )
      )
      or exists (
        select 1
        from public.world_office_terms term_row
        join public.world_organization_offices office_row
          on office_row.id = term_row.office_id
        join public.world_office_capabilities office_capability
          on office_capability.office_id = office_row.id
        where term_row.status = 'active'
          and term_row.actual_end_at is null
          and term_row.started_at <= now()
          and term_row.holder_user_id = auth.uid()
          and office_row.active
          and office_row.organization_id = p_organization_id
          and office_capability.capability = p_capability
          and (office_row.organ_id is null or office_row.organ_id is not distinct from p_organ_id)
      )
      or exists (
        select 1
        from public.world_country_controller_capabilities controller_capability
        join public.country_accounts account_row
          on account_row.user_id = auth.uid()
         and account_row.country_id = p_country_id
         and account_row.status = 'active'
        where controller_capability.capability = p_capability
      )
    ),
    false
  )
$allowed$;

revoke all on function public.world_access_allowed(text,uuid,uuid,uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function public.world_access_allowed(text,uuid,uuid,uuid,text,uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
