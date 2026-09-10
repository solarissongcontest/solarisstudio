begin;

-- HOD workspace persistence for the data the legacy contest model does not
-- already own: delegation jury rosters and official Studio 2 notices.

create table public.studio2_delegation_settings (
  edition_id uuid not null references public.editions(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  jury_members_required smallint not null default 5,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (edition_id, country_id),
  constraint studio2_delegation_settings_jury_required_check
    check (jury_members_required between 1 and 10)
);

create table public.studio2_jury_members (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  display_name text not null,
  member_user_id uuid references auth.users(id) on delete set null,
  status text not null default 'assigned',
  assigned_by uuid references auth.users(id) on delete set null,
  removed_at timestamptz,
  removed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio2_jury_members_display_name_check check (length(btrim(display_name)) > 0),
  constraint studio2_jury_members_status_check check (status in ('assigned', 'removed')),
  constraint studio2_jury_members_removed_state_check check (
    (status = 'assigned' and removed_at is null and removed_by is null)
    or (status = 'removed' and removed_at is not null)
  )
);

create unique index studio2_jury_members_active_name_key
  on public.studio2_jury_members (edition_id, country_id, lower(btrim(display_name)))
  where status = 'assigned';

create index studio2_jury_members_delegation_idx
  on public.studio2_jury_members (edition_id, country_id, status, created_at);

create table public.studio2_official_notices (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete cascade,
  title text not null,
  body text not null,
  severity text not null default 'info',
  audience text not null,
  country_ids uuid[] not null default '{}'::uuid[],
  acknowledgement_required boolean not null default false,
  sent_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint studio2_official_notices_title_check check (length(btrim(title)) > 0),
  constraint studio2_official_notices_body_check check (length(btrim(body)) > 0),
  constraint studio2_official_notices_severity_check check (
    severity in ('info', 'action_required', 'urgent', 'critical')
  ),
  constraint studio2_official_notices_audience_check check (
    audience in ('all_delegations', 'specific_countries', 'jurors', 'hods', 'staff', 'press')
  ),
  constraint studio2_official_notices_country_scope_check check (
    (audience = 'specific_countries' and cardinality(country_ids) > 0)
    or (audience <> 'specific_countries' and cardinality(country_ids) = 0)
  )
);

create index studio2_official_notices_edition_sent_idx
  on public.studio2_official_notices (edition_id, sent_at desc)
  where sent_at is not null;

create table public.studio2_notice_receipts (
  notice_id uuid not null references public.studio2_official_notices(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz,
  opened_at timestamptz,
  acknowledged_at timestamptz,
  primary key (notice_id, recipient_user_id)
);

create index studio2_notice_receipts_recipient_idx
  on public.studio2_notice_receipts (recipient_user_id, acknowledged_at, notice_id);

create or replace function private.studio2_user_has_country_account(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select p_user_id is not null and exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = p_user_id
      and ca.status = 'active'
  )
$$;

create or replace function private.studio2_user_can_receive_notice(
  p_user_id uuid,
  p_audience text,
  p_country_ids uuid[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_country_id uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  if public.has_role(p_user_id, 'organizer'::public.app_role) then
    return true;
  end if;

  if p_audience in ('all_delegations', 'hods') then
    return private.studio2_user_has_country_account(p_user_id);
  end if;

  if p_audience = 'specific_countries' then
    foreach v_country_id in array coalesce(p_country_ids, '{}'::uuid[])
    loop
      if public.owns_country(p_user_id, v_country_id) then
        return true;
      end if;
    end loop;
  end if;

  return false;
end
$$;

create trigger studio2_delegation_settings_touch_updated_at
before update on public.studio2_delegation_settings
for each row execute function private.studio2_touch_updated_at();

create trigger studio2_jury_members_touch_updated_at
before update on public.studio2_jury_members
for each row execute function private.studio2_touch_updated_at();

alter table public.studio2_delegation_settings enable row level security;
alter table public.studio2_jury_members enable row level security;
alter table public.studio2_official_notices enable row level security;
alter table public.studio2_notice_receipts enable row level security;

revoke all on table public.studio2_delegation_settings from public, anon, authenticated;
revoke all on table public.studio2_jury_members from public, anon, authenticated;
revoke all on table public.studio2_official_notices from public, anon, authenticated;
revoke all on table public.studio2_notice_receipts from public, anon, authenticated;

grant select on table public.studio2_delegation_settings to authenticated;
grant select on table public.studio2_jury_members to authenticated;
grant select on table public.studio2_official_notices to authenticated;
grant select on table public.studio2_notice_receipts to authenticated;

grant all on table public.studio2_delegation_settings to service_role;
grant all on table public.studio2_jury_members to service_role;
grant all on table public.studio2_official_notices to service_role;
grant all on table public.studio2_notice_receipts to service_role;

create policy studio2_delegation_settings_read
on public.studio2_delegation_settings
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'organizer'::public.app_role)
  or public.owns_country((select auth.uid()), country_id)
  or public.studio2_has_capability('edition.manage', edition_id)
);

create policy studio2_jury_members_read
on public.studio2_jury_members
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'organizer'::public.app_role)
  or public.owns_country((select auth.uid()), country_id)
  or public.studio2_has_capability('jury.ballots.read', edition_id)
);

create policy studio2_official_notices_read
on public.studio2_official_notices
for select
to authenticated
using (
  sent_at is not null
  and private.studio2_user_can_receive_notice(
    (select auth.uid()),
    audience,
    country_ids
  )
);

create policy studio2_notice_receipts_read
on public.studio2_notice_receipts
for select
to authenticated
using (
  recipient_user_id = (select auth.uid())
  or public.has_role((select auth.uid()), 'organizer'::public.app_role)
);

create or replace function public.studio2_set_jury_requirement(
  p_edition_id uuid,
  p_country_id uuid,
  p_required smallint
)
returns public.studio2_delegation_settings
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_row public.studio2_delegation_settings%rowtype;
begin
  if p_required is null or p_required < 1 or p_required > 10 then
    raise exception 'Jury member requirement must be between 1 and 10' using errcode = '22023';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'edition.manage', p_edition_id) then
    raise exception 'Missing Solaris capability: edition.manage' using errcode = '42501';
  end if;

  insert into public.studio2_delegation_settings (
    edition_id,
    country_id,
    jury_members_required,
    updated_by
  ) values (
    p_edition_id,
    p_country_id,
    p_required,
    v_actor
  )
  on conflict (edition_id, country_id)
  do update set
    jury_members_required = excluded.jury_members_required,
    updated_by = excluded.updated_by
  returning * into v_row;

  return v_row;
end
$$;

create or replace function public.studio2_assign_jury_member(
  p_edition_id uuid,
  p_country_id uuid,
  p_display_name text,
  p_member_user_id uuid default null
)
returns public.studio2_jury_members
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_required integer;
  v_assigned integer;
  v_member public.studio2_jury_members%rowtype;
begin
  if nullif(btrim(p_display_name), '') is null then
    raise exception 'Jury member display name is required' using errcode = '22023';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not public.owns_country(v_actor, p_country_id) then
    raise exception 'Country ownership or organizer role required' using errcode = '42501';
  end if;

  perform 1
  from public.editions e
  where e.id = p_edition_id
  for share;
  if not found then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;

  select coalesce(s.jury_members_required, 5)
  into v_required
  from (select 1) seed
  left join public.studio2_delegation_settings s
    on s.edition_id = p_edition_id
   and s.country_id = p_country_id;

  select count(*)
  into v_assigned
  from public.studio2_jury_members jm
  where jm.edition_id = p_edition_id
    and jm.country_id = p_country_id
    and jm.status = 'assigned';

  if v_assigned >= v_required then
    raise exception 'Delegation jury roster is already full (%/% members)', v_assigned, v_required
      using errcode = '23514';
  end if;

  insert into public.studio2_jury_members (
    edition_id,
    country_id,
    display_name,
    member_user_id,
    assigned_by
  ) values (
    p_edition_id,
    p_country_id,
    btrim(p_display_name),
    p_member_user_id,
    v_actor
  )
  returning * into v_member;

  return v_member;
end
$$;

create or replace function public.studio2_remove_jury_member(p_member_id uuid)
returns public.studio2_jury_members
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_member public.studio2_jury_members%rowtype;
begin
  select * into v_member
  from public.studio2_jury_members
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Jury member not found: %', p_member_id using errcode = 'P0002';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not public.owns_country(v_actor, v_member.country_id) then
    raise exception 'Country ownership or organizer role required' using errcode = '42501';
  end if;

  if v_member.status = 'removed' then
    return v_member;
  end if;

  update public.studio2_jury_members
  set status = 'removed',
      removed_at = now(),
      removed_by = v_actor
  where id = p_member_id
  returning * into v_member;

  return v_member;
end
$$;

create or replace function public.studio2_send_notice(
  p_edition_id uuid,
  p_title text,
  p_body text,
  p_severity text,
  p_audience text,
  p_country_ids uuid[] default '{}'::uuid[],
  p_acknowledgement_required boolean default false
)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_country_ids uuid[] := coalesce(p_country_ids, '{}'::uuid[]);
  v_notice public.studio2_official_notices%rowtype;
begin
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null then
    raise exception 'Notice title and body are required' using errcode = '22023';
  end if;

  if p_severity is null or p_severity not in ('info', 'action_required', 'urgent', 'critical') then
    raise exception 'Unknown notice severity: %', p_severity using errcode = '22023';
  end if;

  if p_audience is null
     or p_audience not in ('all_delegations', 'specific_countries', 'jurors', 'hods', 'staff', 'press') then
    raise exception 'Unknown notice audience: %', p_audience using errcode = '22023';
  end if;

  if p_audience = 'specific_countries' and cardinality(v_country_ids) = 0 then
    raise exception 'Specific-country notices require at least one country' using errcode = '22023';
  end if;

  if p_audience <> 'specific_countries' and cardinality(v_country_ids) > 0 then
    raise exception 'Country ids are only valid for specific-country notices' using errcode = '22023';
  end if;

  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'communications.send', p_edition_id) then
    raise exception 'Missing Solaris capability: communications.send' using errcode = '42501';
  end if;

  insert into public.studio2_official_notices (
    edition_id,
    title,
    body,
    severity,
    audience,
    country_ids,
    acknowledgement_required,
    sent_at,
    created_by
  ) values (
    p_edition_id,
    btrim(p_title),
    btrim(p_body),
    p_severity,
    p_audience,
    v_country_ids,
    coalesce(p_acknowledgement_required, false),
    now(),
    v_actor
  )
  returning * into v_notice;

  if p_edition_id is not null then
    insert into public.studio2_contest_events (
      edition_id,
      type,
      actor_user_id,
      entity_type,
      entity_id,
      payload
    ) values (
      p_edition_id,
      'notice.sent',
      v_actor,
      'notice',
      v_notice.id::text,
      jsonb_build_object(
        'severity', v_notice.severity,
        'audience', v_notice.audience,
        'acknowledgementRequired', v_notice.acknowledgement_required
      )
    );
  end if;

  return v_notice;
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
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_notice
  from public.studio2_official_notices
  where id = p_notice_id
    and sent_at is not null;

  if not found then
    raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002';
  end if;

  if not private.studio2_user_can_receive_notice(v_actor, v_notice.audience, v_notice.country_ids) then
    raise exception 'Notice is not available to this user' using errcode = '42501';
  end if;

  insert into public.studio2_notice_receipts (
    notice_id,
    recipient_user_id,
    delivered_at,
    opened_at,
    acknowledged_at
  ) values (
    p_notice_id,
    v_actor,
    now(),
    now(),
    now()
  )
  on conflict (notice_id, recipient_user_id)
  do update set
    delivered_at = coalesce(public.studio2_notice_receipts.delivered_at, excluded.delivered_at),
    opened_at = coalesce(public.studio2_notice_receipts.opened_at, excluded.opened_at),
    acknowledged_at = excluded.acknowledged_at
  returning * into v_receipt;

  if v_notice.edition_id is not null then
    insert into public.studio2_contest_events (
      edition_id,
      type,
      actor_user_id,
      entity_type,
      entity_id,
      payload
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

revoke all on function private.studio2_user_has_country_account(uuid)
  from public, anon, authenticated;
revoke all on function private.studio2_user_can_receive_notice(uuid, text, uuid[])
  from public, anon, authenticated;

revoke all on function public.studio2_set_jury_requirement(uuid, uuid, smallint)
  from public, anon, authenticated;
grant execute on function public.studio2_set_jury_requirement(uuid, uuid, smallint)
  to authenticated, service_role;

revoke all on function public.studio2_assign_jury_member(uuid, uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_assign_jury_member(uuid, uuid, text, uuid)
  to authenticated, service_role;

revoke all on function public.studio2_remove_jury_member(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_remove_jury_member(uuid)
  to authenticated, service_role;

revoke all on function public.studio2_send_notice(uuid, text, text, text, text, uuid[], boolean)
  from public, anon, authenticated;
grant execute on function public.studio2_send_notice(uuid, text, text, text, text, uuid[], boolean)
  to authenticated, service_role;

revoke all on function public.studio2_acknowledge_notice(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_acknowledge_notice(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
