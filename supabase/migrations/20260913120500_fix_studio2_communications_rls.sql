begin;

-- Official Communications reads were broken because the RLS policies called
-- private capability/recipient helpers directly. Those helpers are deliberately
-- not executable by authenticated clients, so PostgreSQL raised 42501 before
-- Organizer history or the HOD inbox could read notices.
--
-- Keep private authorization helpers private. Expose only narrow, current-user
-- predicates through SECURITY DEFINER functions and make RLS use those.

create or replace function public.studio2_can_manage_communications(p_edition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    auth.uid() is not null
    and (
      public.has_role(auth.uid(), 'organizer'::public.app_role)
      or private.studio2_user_has_capability(
        auth.uid(),
        'communications.send',
        p_edition_id
      )
    )
$$;

create or replace function public.studio2_can_read_notice(
  p_edition_id uuid,
  p_status text,
  p_sent_at timestamptz,
  p_audience text,
  p_country_ids uuid[] default '{}'::uuid[],
  p_audience_group text default null
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    case
      when auth.uid() is null then false
      when public.has_role(auth.uid(), 'organizer'::public.app_role) then true
      when private.studio2_user_has_capability(
        auth.uid(),
        'communications.send',
        p_edition_id
      ) then true
      when p_status = 'published' and p_sent_at is not null then
        private.studio2_user_can_receive_notice_v2(
          auth.uid(),
          p_edition_id,
          p_audience,
          coalesce(p_country_ids, '{}'::uuid[]),
          p_audience_group
        )
      else false
    end
$$;

revoke all on function public.studio2_can_manage_communications(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_can_manage_communications(uuid)
  to authenticated, service_role;

revoke all on function public.studio2_can_read_notice(uuid, text, timestamptz, text, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.studio2_can_read_notice(uuid, text, timestamptz, text, uuid[], text)
  to authenticated, service_role;

drop policy if exists studio2_official_notices_read
  on public.studio2_official_notices;
create policy studio2_official_notices_read
on public.studio2_official_notices
for select
to authenticated
using (
  public.studio2_can_read_notice(
    edition_id,
    status,
    sent_at,
    audience,
    country_ids,
    audience_group
  )
);

drop policy if exists studio2_notice_versions_organizer_read
  on public.studio2_notice_versions;
create policy studio2_notice_versions_organizer_read
on public.studio2_notice_versions
for select
to authenticated
using (
  public.studio2_can_manage_communications(edition_id)
);

notify pgrst, 'reload schema';

commit;
