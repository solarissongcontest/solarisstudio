begin;

-- Restore the narrow execution privileges required by public RLS after the
-- Permission Engine v2 authoritative cutover. Public policies call these
-- security-definer predicates; anon must be able to execute the predicates
-- without receiving direct access to the private capability or account tables.

revoke all on function public.studio2_access_allowed(text, uuid, boolean) from public;
grant execute on function public.studio2_access_allowed(text, uuid, boolean)
  to anon, authenticated, service_role;

-- The one-argument helper only answers whether the current auth.uid() owns an
-- active country. For anon auth.uid() is null, so the result is always false.
-- Granting EXECUTE is safe and avoids granting SELECT on country_accounts.
revoke all on function public.owns_country(uuid) from public;
grant execute on function public.owns_country(uuid)
  to anon, authenticated, service_role;

-- final_rls_schema_hygiene consolidated the then-current participant SELECT
-- policies into role-specific policies. That preserved an older direct
-- country_accounts EXISTS predicate, so replacing only the pre-consolidation
-- policy name is insufficient. Rebuild the two final SELECT policies from the
-- same effective union, but route ownership through the security-definer helper.
drop policy if exists "solaris consolidated anon read" on public.participants;
drop policy if exists "solaris consolidated authenticated read" on public.participants;
drop policy if exists "participants public or capability read" on public.participants;
drop policy if exists "participants unreleased owner or capability read" on public.participants;
drop policy if exists "participants public read by publication" on public.participants;
drop policy if exists "participants public read published" on public.participants;
drop policy if exists "participants public read" on public.participants;
drop policy if exists "participants unreleased entry protection" on public.participants;

create policy "solaris consolidated anon read"
on public.participants
for select
to anon
using (
  (
    show_id is not null
    and public.show_publication_enabled(show_id, 'participants')
  )
  or (
    show_id is null
    and exists (
      select 1
      from public.editions e
      where e.id = participants.edition_id
        and e.published = true
    )
  )
  or public.studio2_access_allowed('entry.read_private', edition_id, false)
  or publication_status = 'published'
  or (
    publication_status = 'scheduled'
    and scheduled_publish_at is not null
    and scheduled_publish_at <= now()
  )
  or public.owns_country(country_id)
);

create policy "solaris consolidated authenticated read"
on public.participants
for select
to authenticated
using (
  -- Preserve the authenticated SELECT access inherited from the former
  -- participants capability-write FOR ALL policy before schema consolidation.
  public.studio2_access_allowed('entry.edit', edition_id, true)
  or (
    show_id is not null
    and public.show_publication_enabled(show_id, 'participants')
  )
  or (
    show_id is null
    and exists (
      select 1
      from public.editions e
      where e.id = participants.edition_id
        and e.published = true
    )
  )
  or public.studio2_access_allowed('entry.read_private', edition_id, false)
  or publication_status = 'published'
  or (
    publication_status = 'scheduled'
    and scheduled_publish_at is not null
    and scheduled_publish_at <= now()
  )
  or public.owns_country(country_id)
);

do $verify_public_rls_runtime$
declare
  v_policy record;
  v_anon_count integer;
  v_auth_count integer;
begin
  if not has_function_privilege(
    'anon',
    'public.studio2_access_allowed(text,uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'anon cannot execute public.studio2_access_allowed required by public RLS';
  end if;

  if not has_function_privilege(
    'anon',
    'public.owns_country(uuid)',
    'EXECUTE'
  ) then
    raise exception 'anon cannot execute public.owns_country required by participant RLS';
  end if;

  for v_policy in
    select policyname, qual
    from pg_policies
    where schemaname = 'public'
      and tablename = 'participants'
      and cmd in ('SELECT', 'ALL')
      and (
        'public' = any(roles)
        or 'anon' = any(roles)
        or 'authenticated' = any(roles)
      )
  loop
    if coalesce(v_policy.qual, '') ilike '%country_accounts%' then
      raise exception 'participants browser RLS still reads country_accounts directly: %',
        v_policy.policyname;
    end if;
  end loop;

  select count(*) into v_anon_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'participants'
    and cmd in ('SELECT', 'ALL')
    and ('public' = any(roles) or 'anon' = any(roles));

  select count(*) into v_auth_count
  from pg_policies
  where schemaname = 'public'
    and tablename = 'participants'
    and cmd in ('SELECT', 'ALL')
    and ('public' = any(roles) or 'authenticated' = any(roles));

  if v_anon_count <> 1 then
    raise exception 'participants must expose exactly one anon SELECT policy, found %',
      v_anon_count;
  end if;

  if v_auth_count <> 1 then
    raise exception 'participants must expose exactly one authenticated SELECT policy, found %',
      v_auth_count;
  end if;
end
$verify_public_rls_runtime$;

notify pgrst, 'reload schema';

commit;
