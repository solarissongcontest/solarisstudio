begin;

-- TG4 durable-identity/member-read alignment. Membership remains country-based;
-- this only resolves which authenticated humans may act/read for that existing
-- membership without introducing a second membership or identity system.

create or replace function public.world_document_member_allowed_v1(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $member$
  select coalesce(
    auth.uid() is not null and exists (
      select 1
      from public.world_organization_memberships membership_row
      where membership_row.organization_id = p_organization_id
        and membership_row.ended_at is null
        and membership_row.status in ('member','observer','associate')
        and (
          exists (
            select 1
            from public.country_accounts account_row
            where account_row.country_id = membership_row.country_id
              and account_row.user_id = auth.uid()
              and account_row.status = 'active'
          )
          or exists (
            select 1
            from public.world_organization_representations representation_row
            where representation_row.organization_id = membership_row.organization_id
              and representation_row.country_id = membership_row.country_id
              and representation_row.user_id = auth.uid()
              and representation_row.ends_at is null
          )
        )
    ), false
  )
$member$;
revoke all on function public.world_document_member_allowed_v1(uuid) from public, anon, authenticated;
grant execute on function public.world_document_member_allowed_v1(uuid) to authenticated, service_role;

create or replace function private.world_document_actor_person_v1(p_organization_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog
as $actor$
declare
  v_person_id uuid;
begin
  if auth.uid() is null then
    return null;
  end if;

  -- Institutional office is the strongest organization-specific durable identity.
  select term_row.holder_person_id
  into v_person_id
  from public.world_office_terms term_row
  join public.world_organization_offices office_row on office_row.id = term_row.office_id
  where office_row.organization_id = p_organization_id
    and term_row.holder_user_id = auth.uid()
    and term_row.status = 'active'
    and term_row.ends_at is null
  order by term_row.starts_at desc, term_row.id
  limit 1;

  if v_person_id is not null then
    return v_person_id;
  end if;

  -- A scoped grant may belong to the country's active institutional
  -- representative rather than its current controller.
  select representation_row.person_id
  into v_person_id
  from public.world_organization_representations representation_row
  where representation_row.organization_id = p_organization_id
    and representation_row.user_id = auth.uid()
    and representation_row.ends_at is null
  order by representation_row.starts_at desc, representation_row.id
  limit 1;

  if v_person_id is not null then
    return v_person_id;
  end if;

  -- Finally reuse TG1's durable controller history. Current ownership itself
  -- remains public.country_accounts; this history is identity context only.
  select control_row.person_id
  into v_person_id
  from public.world_country_control_terms control_row
  where control_row.user_id = auth.uid()
    and control_row.ended_at is null
  order by control_row.started_at desc, control_row.id
  limit 1;

  return v_person_id;
end
$actor$;
revoke all on function private.world_document_actor_person_v1(uuid) from public, anon, authenticated;

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg4.world-document-identity-scope',
      1,
      'forward_fix_only',
      false,
      null,
      'Align member-visible document access and durable document authorship with existing country controller, institutional representative and office-term identities without creating a second membership or identity system.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
