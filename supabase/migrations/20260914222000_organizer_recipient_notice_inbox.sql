begin;

-- Organizer privileges allow inspection in the admin communications centre, but
-- they must not turn the MySolaris recipient inbox into an all-notices inbox.
-- This predicate answers a narrower question: is the current user an actual
-- recipient of this communication?
create or replace function private.studio2_user_can_receive_notice_as_recipient(
  p_user_id uuid,
  p_edition_id uuid,
  p_audience text,
  p_country_ids uuid[],
  p_audience_group text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_country_id uuid;
  v_selected_person_id uuid;
  v_account_person_id uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  select ca.country_id
  into v_country_id
  from public.country_accounts ca
  where ca.user_id = p_user_id
    and ca.status = 'active'
  limit 1;

  if p_audience in ('all_delegations', 'hods') then
    return v_country_id is not null;
  end if;

  if p_audience = 'participating_countries' then
    return v_country_id is not null
      and exists (
        select 1
        from public.participants p
        left join public.contest_entities ce on ce.id = p.contest_entity_id
        where p.edition_id = p_edition_id
          and coalesce(p.country_id, ce.country_id) = v_country_id
      );
  end if;

  if p_audience = 'specific_countries' then
    return v_country_id is not null
      and v_country_id = any(coalesce(p_country_ids, '{}'::uuid[]));
  end if;

  if p_audience = 'jurors' then
    if v_country_id is null then
      return false;
    end if;

    if coalesce(cardinality(p_country_ids), 0) > 0
       and not (v_country_id = any(p_country_ids)) then
      return false;
    end if;

    if p_edition_id is null then
      return true;
    end if;

    select a.person_id
    into v_selected_person_id
    from public.delegation_hod_assignments a
    where a.edition_id = p_edition_id
      and a.country_id = v_country_id
      and a.channel in ('jury', 'delegation')
    order by
      case when a.channel = 'jury' then 0 else 1 end,
      a.updated_at desc,
      a.id
    limit 1;

    if v_selected_person_id is null then
      return false;
    end if;

    select p.id
    into v_account_person_id
    from public.delegation_people p
    where p.identity_key = 'account:' || p_user_id::text
    limit 1;

    return v_account_person_id is not null
      and v_selected_person_id = v_account_person_id;
  end if;

  if p_audience = 'organizers' then
    return public.has_role(p_user_id, 'organizer'::public.app_role);
  end if;

  if p_audience = 'edition_group' then
    if p_edition_id is null then
      return false;
    end if;

    case p_audience_group
      when 'broadcast' then
        return private.studio2_user_has_capability(p_user_id, 'broadcast.control', p_edition_id);
      when 'voting' then
        return private.studio2_user_has_capability(p_user_id, 'jury.ballots.read', p_edition_id)
          or private.studio2_user_has_capability(p_user_id, 'televote.ballots.read', p_edition_id);
      when 'delegations' then
        return private.studio2_user_has_capability(p_user_id, 'confirmation.manage', p_edition_id);
      when 'results' then
        return private.studio2_user_has_capability(p_user_id, 'results.preview', p_edition_id)
          or private.studio2_user_has_capability(p_user_id, 'results.verify', p_edition_id)
          or private.studio2_user_has_capability(p_user_id, 'results.publish', p_edition_id);
      when 'communications' then
        return private.studio2_user_has_capability(p_user_id, 'communications.send', p_edition_id);
      else
        return false;
    end case;
  end if;

  if p_audience = 'staff' then
    return private.studio2_user_has_capability(p_user_id, 'edition.read', p_edition_id)
      or private.studio2_user_has_capability(p_user_id, 'edition.manage', p_edition_id);
  end if;

  return false;
end
$$;

revoke all on function private.studio2_user_can_receive_notice_as_recipient(uuid, uuid, text, uuid[], text)
  from public, anon, authenticated;

-- Narrow, current-user projection for MySolaris. It intentionally ignores the
-- organizer inspection bypass and returns only the current user's receipt.
create or replace function public.studio2_my_notice_inbox(p_edition_id uuid default null)
returns table (
  id uuid,
  edition_id uuid,
  notice_type text,
  title text,
  body text,
  severity text,
  audience text,
  audience_group text,
  country_ids uuid[],
  acknowledgement_required boolean,
  display_surfaces text[],
  status text,
  scheduled_at timestamptz,
  sent_at timestamptz,
  cancelled_at timestamptz,
  archived_at timestamptz,
  superseded_by_id uuid,
  revision integer,
  created_at timestamptz,
  recipient_user_id uuid,
  delivered_at timestamptz,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  receipt_archived_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    n.id,
    n.edition_id,
    n.notice_type,
    n.title,
    n.body,
    n.severity,
    n.audience,
    n.audience_group,
    n.country_ids,
    n.acknowledgement_required,
    n.display_surfaces,
    n.status,
    n.scheduled_at,
    n.sent_at,
    n.cancelled_at,
    n.archived_at,
    n.superseded_by_id,
    n.revision,
    n.created_at,
    r.recipient_user_id,
    r.delivered_at,
    r.opened_at,
    r.acknowledged_at,
    r.archived_at as receipt_archived_at
  from public.studio2_official_notices n
  left join public.studio2_notice_receipts r
    on r.notice_id = n.id
   and r.recipient_user_id = auth.uid()
  where auth.uid() is not null
    and n.status = 'published'
    and n.sent_at is not null
    and n.archived_at is null
    and 'delegation_inbox' = any(n.display_surfaces)
    and (p_edition_id is null or n.edition_id = p_edition_id)
    and private.studio2_user_can_receive_notice_as_recipient(
      auth.uid(),
      n.edition_id,
      n.audience,
      n.country_ids,
      n.audience_group
    )
  order by n.sent_at desc
$$;

revoke all on function public.studio2_my_notice_inbox(uuid) from public, anon, authenticated;
grant execute on function public.studio2_my_notice_inbox(uuid) to authenticated, service_role;

-- Receipt mutations use the same strict recipient boundary. Organizer admin
-- inspection remains available through the normal communications read policy,
-- but inspecting a notice cannot create a delegation receipt.
create or replace function public.studio2_mark_notice_opened(p_notice_id uuid)
returns public.studio2_notice_receipts
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_notice public.studio2_official_notices%rowtype;
  v_receipt public.studio2_notice_receipts%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_notice
  from public.studio2_official_notices
  where id = p_notice_id
    and status = 'published'
    and sent_at is not null
    and archived_at is null
    and 'delegation_inbox' = any(display_surfaces);

  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  if not private.studio2_user_can_receive_notice_as_recipient(
    v_actor, v_notice.edition_id, v_notice.audience, v_notice.country_ids, v_notice.audience_group
  ) then raise exception 'Notice is not available to this recipient' using errcode = '42501'; end if;

  insert into public.studio2_notice_receipts (
    notice_id, recipient_user_id, delivered_at, opened_at
  ) values (p_notice_id, v_actor, now(), now())
  on conflict (notice_id, recipient_user_id)
  do update set
    delivered_at = coalesce(public.studio2_notice_receipts.delivered_at, excluded.delivered_at),
    opened_at = coalesce(public.studio2_notice_receipts.opened_at, excluded.opened_at)
  returning * into v_receipt;

  return v_receipt;
end
$$;

create or replace function public.studio2_archive_notice(p_notice_id uuid, p_archived boolean default true)
returns public.studio2_notice_receipts
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_notice public.studio2_official_notices%rowtype;
  v_receipt public.studio2_notice_receipts%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_notice
  from public.studio2_official_notices
  where id = p_notice_id
    and status = 'published'
    and sent_at is not null
    and archived_at is null
    and 'delegation_inbox' = any(display_surfaces);

  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  if not private.studio2_user_can_receive_notice_as_recipient(
    v_actor, v_notice.edition_id, v_notice.audience, v_notice.country_ids, v_notice.audience_group
  ) then raise exception 'Notice is not available to this recipient' using errcode = '42501'; end if;

  insert into public.studio2_notice_receipts (
    notice_id, recipient_user_id, delivered_at, opened_at, archived_at
  ) values (p_notice_id, v_actor, now(), now(), case when p_archived then now() else null end)
  on conflict (notice_id, recipient_user_id)
  do update set
    delivered_at = coalesce(public.studio2_notice_receipts.delivered_at, excluded.delivered_at),
    opened_at = coalesce(public.studio2_notice_receipts.opened_at, excluded.opened_at),
    archived_at = excluded.archived_at
  returning * into v_receipt;

  return v_receipt;
end
$$;

create or replace function public.studio2_acknowledge_notice(p_notice_id uuid)
returns public.studio2_notice_receipts
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_notice public.studio2_official_notices%rowtype;
  v_receipt public.studio2_notice_receipts%rowtype;
begin
  if v_actor is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select * into v_notice
  from public.studio2_official_notices
  where id = p_notice_id
    and status = 'published'
    and sent_at is not null
    and archived_at is null
    and 'delegation_inbox' = any(display_surfaces);

  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  if not private.studio2_user_can_receive_notice_as_recipient(
    v_actor, v_notice.edition_id, v_notice.audience, v_notice.country_ids, v_notice.audience_group
  ) then raise exception 'Notice is not available to this recipient' using errcode = '42501'; end if;
  if not v_notice.acknowledgement_required then
    raise exception 'This notice does not require acknowledgement' using errcode = '23514';
  end if;

  insert into public.studio2_notice_receipts (
    notice_id, recipient_user_id, delivered_at, opened_at, acknowledged_at
  ) values (p_notice_id, v_actor, now(), now(), now())
  on conflict (notice_id, recipient_user_id)
  do update set
    delivered_at = coalesce(public.studio2_notice_receipts.delivered_at, excluded.delivered_at),
    opened_at = coalesce(public.studio2_notice_receipts.opened_at, excluded.opened_at),
    acknowledged_at = excluded.acknowledged_at
  returning * into v_receipt;

  if v_notice.edition_id is not null then
    insert into public.studio2_contest_events (
      edition_id, type, actor_user_id, entity_type, entity_id, payload
    ) values (
      v_notice.edition_id,
      'notice.acknowledged',
      v_actor,
      'notice',
      v_notice.id::text,
      jsonb_build_object('noticeId', v_notice.id)
    );
  end if;

  return v_receipt;
end
$$;

revoke all on function public.studio2_mark_notice_opened(uuid) from public, anon, authenticated;
revoke all on function public.studio2_archive_notice(uuid, boolean) from public, anon, authenticated;
revoke all on function public.studio2_acknowledge_notice(uuid) from public, anon, authenticated;
grant execute on function public.studio2_mark_notice_opened(uuid) to authenticated, service_role;
grant execute on function public.studio2_archive_notice(uuid, boolean) to authenticated, service_role;
grant execute on function public.studio2_acknowledge_notice(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
