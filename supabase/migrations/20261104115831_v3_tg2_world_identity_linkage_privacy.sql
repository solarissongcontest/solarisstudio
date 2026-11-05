begin;

-- TG2 identity linkage is private even when an institution's political record
-- is public. Public readers keep using world_organization_projection_v1;
-- raw auth-linked rows require self access or the existing world-scoped grant.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg2.world-identity-linkage-privacy',
      1,
      'forward_fix_only',
      false,
      null,
      'Restrict raw representation and office-term auth linkage to self or scoped private-view authority while preserving the canonical public institution projection.'
    );
  end if;
end
$contract$;

-- Resolve the office scope without relying on the caller's public-only office
-- and organization table policies. This preserves authorized private-institution
-- manager reads. It returns only an authorization decision, never identity data.
create or replace function private.world_office_term_identity_read_allowed_v1(
  p_office_id uuid,
  p_represented_country_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $allowed$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1
      from public.world_organization_offices office_row
      where office_row.id = p_office_id
        and public.world_access_allowed(
          'world.organization.view_private',
          office_row.organization_id,
          p_represented_country_id,
          office_row.organ_id,
          'office',
          office_row.id
        )
    ),
    false
  )
$allowed$;

revoke all on function private.world_office_term_identity_read_allowed_v1(uuid,uuid)
  from public, anon, authenticated;
grant execute on function private.world_office_term_identity_read_allowed_v1(uuid,uuid)
  to authenticated, service_role;

drop policy world_representations_scoped_read
  on public.world_organization_representations;
create policy world_representations_scoped_read
on public.world_organization_representations
for select to authenticated
using (
  user_id = (select auth.uid())
  or public.world_access_allowed(
    'world.organization.view_private',
    organization_id,
    country_id,
    null,
    'representation',
    id
  )
);

drop policy world_office_terms_scoped_read on public.world_office_terms;
create policy world_office_terms_scoped_read
on public.world_office_terms
for select to authenticated
using (
  holder_user_id = (select auth.uid())
  or private.world_office_term_identity_read_allowed_v1(
    office_id,
    represented_country_id
  )
);

comment on function private.world_office_term_identity_read_allowed_v1(uuid,uuid) is
  'Internal TG2 office-term read authorization using the canonical world scope resolver; exposes no political or auth identity.';

notify pgrst, 'reload schema';
commit;
