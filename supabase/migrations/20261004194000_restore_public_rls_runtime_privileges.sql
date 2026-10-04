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

drop policy if exists "participants unreleased owner or capability read"
  on public.participants;

create policy "participants unreleased owner or capability read"
on public.participants
for select
using (
  publication_status = 'published'
  or (
    publication_status = 'scheduled'
    and scheduled_publish_at is not null
    and scheduled_publish_at <= now()
  )
  or public.studio2_access_allowed('entry.read_private', edition_id, false)
  or public.owns_country(country_id)
);

do $verify_public_rls_runtime$
declare
  v_participant_policy text;
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

  select qual
    into v_participant_policy
  from pg_policies
  where schemaname = 'public'
    and tablename = 'participants'
    and policyname = 'participants unreleased owner or capability read';

  if v_participant_policy is null then
    raise exception 'participants public ownership policy is missing';
  end if;

  if v_participant_policy ilike '%country_accounts%' then
    raise exception 'participants public RLS must not read country_accounts directly';
  end if;
end
$verify_public_rls_runtime$;

notify pgrst, 'reload schema';

commit;
