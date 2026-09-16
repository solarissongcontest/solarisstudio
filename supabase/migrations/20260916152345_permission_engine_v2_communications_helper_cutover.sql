begin;

-- Permission Engine v2 cutover batch 13.
--
-- These compatibility helpers already treat legacy Organizers and
-- communications.send specialists as equivalent staff paths. Preserve the
-- explicit authenticated-user boundary and recipient fallback while replacing
-- the direct legacy Organizer checks with the shared non-strict predicate.

create or replace function public.studio2_can_manage_communications(p_edition_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    auth.uid() is not null
    and public.studio2_access_allowed(
      'communications.send',
      p_edition_id,
      false
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
      when public.studio2_access_allowed(
        'communications.send',
        p_edition_id,
        false
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

revoke all on function public.studio2_can_manage_communications(uuid) from public, anon;
grant execute on function public.studio2_can_manage_communications(uuid) to authenticated, service_role;

revoke all on function public.studio2_can_read_notice(uuid, text, timestamptz, text, uuid[], text) from public, anon;
grant execute on function public.studio2_can_read_notice(uuid, text, timestamptz, text, uuid[], text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
