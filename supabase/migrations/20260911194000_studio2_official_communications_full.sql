begin;

-- Phase 5: evolve the existing official-notice persistence instead of creating a
-- second messaging system. Existing sent notices remain published and readable.

alter table public.studio2_official_notices
  add column if not exists notice_type text not null default 'official_notice',
  add column if not exists status text not null default 'draft',
  add column if not exists audience_group text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancellation_reason text,
  add column if not exists supersedes_id uuid references public.studio2_official_notices(id) on delete set null,
  add column if not exists superseded_by_id uuid references public.studio2_official_notices(id) on delete set null,
  add column if not exists revision integer not null default 1,
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

update public.studio2_official_notices
set status = 'published',
    notice_type = coalesce(notice_type, 'official_notice'),
    revision = greatest(coalesce(revision, 1), 1),
    updated_at = coalesce(updated_at, created_at, now())
where sent_at is not null;

alter table public.studio2_official_notices
  drop constraint if exists studio2_official_notices_audience_check,
  drop constraint if exists studio2_official_notices_country_scope_check,
  drop constraint if exists studio2_official_notices_notice_type_check,
  drop constraint if exists studio2_official_notices_status_check,
  drop constraint if exists studio2_official_notices_audience_group_check,
  drop constraint if exists studio2_official_notices_revision_check,
  add constraint studio2_official_notices_notice_type_check check (
    notice_type in (
      'official_notice', 'deadline_reminder', 'rule_clarification',
      'technical_advisory', 'voting_notice', 'emergency_communication',
      'broadcast_information'
    )
  ),
  add constraint studio2_official_notices_status_check check (
    status in ('draft', 'scheduled', 'published', 'cancelled', 'superseded')
  ),
  add constraint studio2_official_notices_audience_check check (
    audience in (
      'all_delegations', 'participating_countries', 'specific_countries',
      'jurors', 'hods', 'organizers', 'edition_group', 'staff', 'press'
    )
  ),
  add constraint studio2_official_notices_country_scope_check check (
    (audience = 'specific_countries' and cardinality(country_ids) > 0)
    or (audience <> 'specific_countries' and cardinality(country_ids) = 0)
  ),
  add constraint studio2_official_notices_audience_group_check check (
    (audience = 'edition_group' and audience_group in ('broadcast', 'voting', 'delegations', 'results', 'communications'))
    or (audience <> 'edition_group' and audience_group is null)
  ),
  add constraint studio2_official_notices_revision_check check (revision >= 1);

alter table public.studio2_notice_receipts
  add column if not exists archived_at timestamptz;

create table if not exists public.studio2_notice_versions (
  notice_id uuid not null references public.studio2_official_notices(id) on delete cascade,
  revision integer not null,
  edition_id uuid references public.editions(id) on delete set null,
  notice_type text not null,
  title text not null,
  body text not null,
  severity text not null,
  audience text not null,
  audience_group text,
  country_ids uuid[] not null default '{}'::uuid[],
  acknowledgement_required boolean not null default false,
  status text not null,
  scheduled_at timestamptz,
  sent_at timestamptz,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  primary key (notice_id, revision)
);

create index if not exists studio2_official_notices_status_schedule_idx
  on public.studio2_official_notices (status, scheduled_at)
  where status in ('draft', 'scheduled');

create index if not exists studio2_notice_versions_notice_idx
  on public.studio2_notice_versions (notice_id, revision desc);

create or replace function private.studio2_capture_notice_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.studio2_notice_versions (
    notice_id, revision, edition_id, notice_type, title, body, severity,
    audience, audience_group, country_ids, acknowledgement_required,
    status, scheduled_at, sent_at, changed_by, changed_at
  ) values (
    old.id, old.revision, old.edition_id, old.notice_type, old.title, old.body, old.severity,
    old.audience, old.audience_group, old.country_ids, old.acknowledgement_required,
    old.status, old.scheduled_at, old.sent_at, auth.uid(), now()
  )
  on conflict (notice_id, revision) do nothing;

  new.revision := old.revision + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;

drop trigger if exists studio2_official_notices_capture_revision on public.studio2_official_notices;
create trigger studio2_official_notices_capture_revision
before update on public.studio2_official_notices
for each row execute function private.studio2_capture_notice_revision();

create or replace function private.studio2_user_can_receive_notice_v2(
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
begin
  if p_user_id is null then
    return false;
  end if;

  -- Organizers can always inspect operational communication for editions they run.
  if public.has_role(p_user_id, 'organizer'::public.app_role) then
    return true;
  end if;

  if p_audience in ('all_delegations', 'hods') then
    return private.studio2_user_has_country_account(p_user_id);
  end if;

  if p_audience = 'participating_countries' then
    return exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = p_user_id
        and ca.status = 'active'
        and exists (
          select 1
          from public.participants p
          left join public.contest_entities ce on ce.id = p.contest_entity_id
          where p.edition_id = p_edition_id
            and coalesce(p.country_id, ce.country_id) = ca.country_id
        )
    );
  end if;

  if p_audience = 'specific_countries' then
    foreach v_country_id in array coalesce(p_country_ids, '{}'::uuid[])
    loop
      if public.owns_country(p_user_id, v_country_id) then
        return true;
      end if;
    end loop;
    return false;
  end if;

  if p_audience = 'jurors' then
    return exists (
      select 1
      from public.studio2_jury_members jm
      where jm.member_user_id = p_user_id
        and jm.status = 'assigned'
        and (p_edition_id is null or jm.edition_id = p_edition_id)
    );
  end if;

  if p_audience = 'organizers' then
    return false;
  end if;

  if p_audience = 'edition_group' then
    if p_edition_id is null then return false; end if;
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

  -- A dedicated press role/capability still does not exist.
  return false;
end
$$;

create or replace function private.studio2_user_can_receive_notice(
  p_user_id uuid,
  p_edition_id uuid,
  p_audience text,
  p_country_ids uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_user_can_receive_notice_v2(
    p_user_id, p_edition_id, p_audience, p_country_ids, null
  )
$$;

create or replace function public.studio2_can_receive_notice(
  p_edition_id uuid,
  p_audience text,
  p_country_ids uuid[] default '{}'::uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_user_can_receive_notice_v2(
    auth.uid(), p_edition_id, p_audience, coalesce(p_country_ids, '{}'::uuid[]), null
  )
$$;

drop policy if exists studio2_official_notices_read on public.studio2_official_notices;
create policy studio2_official_notices_read
on public.studio2_official_notices
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'organizer'::public.app_role)
  or private.studio2_user_has_capability((select auth.uid()), 'communications.send', edition_id)
  or (
    status = 'published'
    and sent_at is not null
    and private.studio2_user_can_receive_notice_v2(
      (select auth.uid()), edition_id, audience, country_ids, audience_group
    )
  )
);

alter table public.studio2_notice_versions enable row level security;
revoke all on table public.studio2_notice_versions from public, anon, authenticated;
grant select on table public.studio2_notice_versions to authenticated;
grant all on table public.studio2_notice_versions to service_role;

create policy studio2_notice_versions_organizer_read
on public.studio2_notice_versions
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'organizer'::public.app_role)
  or private.studio2_user_has_capability((select auth.uid()), 'communications.send', edition_id)
);

create or replace function private.studio2_validate_notice_target(
  p_edition_id uuid,
  p_audience text,
  p_audience_group text,
  p_country_ids uuid[]
)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_audience not in (
    'all_delegations', 'participating_countries', 'specific_countries',
    'jurors', 'hods', 'organizers', 'edition_group', 'staff', 'press'
  ) then
    raise exception 'Unknown notice audience: %', p_audience using errcode = '22023';
  end if;

  if p_audience = 'specific_countries' and cardinality(coalesce(p_country_ids, '{}'::uuid[])) = 0 then
    raise exception 'Specific-country notices require at least one country' using errcode = '22023';
  end if;
  if p_audience <> 'specific_countries' and cardinality(coalesce(p_country_ids, '{}'::uuid[])) > 0 then
    raise exception 'Country ids are only valid for specific-country notices' using errcode = '22023';
  end if;

  if p_audience = 'edition_group' then
    if p_edition_id is null then
      raise exception 'Edition-group notices require an edition' using errcode = '22023';
    end if;
    if p_audience_group not in ('broadcast', 'voting', 'delegations', 'results', 'communications') then
      raise exception 'Unknown edition communication group: %', p_audience_group using errcode = '22023';
    end if;
  elsif p_audience_group is not null then
    raise exception 'Audience group is only valid for edition-group notices' using errcode = '22023';
  end if;
end
$$;

create or replace function private.studio2_require_communications_access(p_edition_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role)
     and not private.studio2_user_has_capability(v_actor, 'communications.send', p_edition_id) then
    raise exception 'Missing Solaris capability: communications.send' using errcode = '42501';
  end if;
end
$$;

create or replace function public.studio2_create_notice_draft(
  p_edition_id uuid,
  p_notice_type text,
  p_title text,
  p_body text,
  p_severity text,
  p_audience text,
  p_audience_group text default null,
  p_country_ids uuid[] default '{}'::uuid[],
  p_acknowledgement_required boolean default false,
  p_supersedes_id uuid default null
)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_notice public.studio2_official_notices%rowtype;
begin
  perform private.studio2_require_communications_access(p_edition_id);
  perform private.studio2_validate_notice_target(
    p_edition_id, p_audience, p_audience_group, coalesce(p_country_ids, '{}'::uuid[])
  );

  if p_notice_type not in (
    'official_notice', 'deadline_reminder', 'rule_clarification',
    'technical_advisory', 'voting_notice', 'emergency_communication', 'broadcast_information'
  ) then
    raise exception 'Unknown notice type: %', p_notice_type using errcode = '22023';
  end if;
  if p_severity not in ('info', 'action_required', 'urgent', 'critical') then
    raise exception 'Unknown notice severity: %', p_severity using errcode = '22023';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null then
    raise exception 'Notice title and body are required' using errcode = '22023';
  end if;

  if p_supersedes_id is not null and not exists (
    select 1 from public.studio2_official_notices n
    where n.id = p_supersedes_id
      and n.status = 'published'
      and n.edition_id is not distinct from p_edition_id
  ) then
    raise exception 'Published notice to supersede was not found' using errcode = 'P0002';
  end if;

  insert into public.studio2_official_notices (
    edition_id, notice_type, title, body, severity, audience, audience_group,
    country_ids, acknowledgement_required, status, supersedes_id,
    created_by, updated_by
  ) values (
    p_edition_id, p_notice_type, btrim(p_title), btrim(p_body), p_severity,
    p_audience, p_audience_group, coalesce(p_country_ids, '{}'::uuid[]),
    coalesce(p_acknowledgement_required, false), 'draft', p_supersedes_id,
    v_actor, v_actor
  ) returning * into v_notice;

  return v_notice;
end
$$;

create or replace function public.studio2_update_notice_draft(
  p_notice_id uuid,
  p_notice_type text,
  p_title text,
  p_body text,
  p_severity text,
  p_audience text,
  p_audience_group text default null,
  p_country_ids uuid[] default '{}'::uuid[],
  p_acknowledgement_required boolean default false
)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
begin
  select * into v_notice
  from public.studio2_official_notices
  where id = p_notice_id
  for update;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;

  perform private.studio2_require_communications_access(v_notice.edition_id);
  if v_notice.status not in ('draft', 'scheduled') then
    raise exception 'Only draft or scheduled notices can be edited' using errcode = '23514';
  end if;
  perform private.studio2_validate_notice_target(
    v_notice.edition_id, p_audience, p_audience_group, coalesce(p_country_ids, '{}'::uuid[])
  );
  if p_notice_type not in (
    'official_notice', 'deadline_reminder', 'rule_clarification',
    'technical_advisory', 'voting_notice', 'emergency_communication', 'broadcast_information'
  ) then raise exception 'Unknown notice type: %', p_notice_type using errcode = '22023'; end if;
  if p_severity not in ('info', 'action_required', 'urgent', 'critical') then
    raise exception 'Unknown notice severity: %', p_severity using errcode = '22023';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null then
    raise exception 'Notice title and body are required' using errcode = '22023';
  end if;

  update public.studio2_official_notices
  set notice_type = p_notice_type,
      title = btrim(p_title),
      body = btrim(p_body),
      severity = p_severity,
      audience = p_audience,
      audience_group = p_audience_group,
      country_ids = coalesce(p_country_ids, '{}'::uuid[]),
      acknowledgement_required = coalesce(p_acknowledgement_required, false)
  where id = p_notice_id
  returning * into v_notice;
  return v_notice;
end
$$;

create or replace function public.studio2_schedule_notice(p_notice_id uuid, p_scheduled_at timestamptz)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
begin
  select * into v_notice from public.studio2_official_notices where id = p_notice_id for update;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  perform private.studio2_require_communications_access(v_notice.edition_id);
  if v_notice.status not in ('draft', 'scheduled') then
    raise exception 'Only draft or scheduled notices can be scheduled' using errcode = '23514';
  end if;
  if p_scheduled_at is null or p_scheduled_at <= now() then
    raise exception 'Scheduled publication time must be in the future' using errcode = '22023';
  end if;

  update public.studio2_official_notices
  set status = 'scheduled', scheduled_at = p_scheduled_at, sent_at = null
  where id = p_notice_id
  returning * into v_notice;
  return v_notice;
end
$$;

create or replace function private.studio2_emit_notice_sent(p_notice public.studio2_official_notices)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_notice.edition_id is not null then
    insert into public.studio2_contest_events (
      edition_id, type, actor_user_id, entity_type, entity_id, payload
    ) values (
      p_notice.edition_id, 'notice.sent', auth.uid(), 'notice', p_notice.id::text,
      jsonb_build_object(
        'noticeType', p_notice.notice_type,
        'severity', p_notice.severity,
        'audience', p_notice.audience,
        'acknowledgementRequired', p_notice.acknowledgement_required
      )
    );
  end if;
end
$$;

create or replace function public.studio2_publish_notice(p_notice_id uuid)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_supersedes uuid;
begin
  select * into v_notice from public.studio2_official_notices where id = p_notice_id for update;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  perform private.studio2_require_communications_access(v_notice.edition_id);
  if v_notice.status not in ('draft', 'scheduled') then
    raise exception 'Only draft or scheduled notices can be published' using errcode = '23514';
  end if;
  v_supersedes := v_notice.supersedes_id;

  update public.studio2_official_notices
  set status = 'published', sent_at = now(), scheduled_at = null,
      cancelled_at = null, cancelled_by = null, cancellation_reason = null
  where id = p_notice_id
  returning * into v_notice;

  if v_supersedes is not null then
    update public.studio2_official_notices
    set status = 'superseded', superseded_by_id = v_notice.id
    where id = v_supersedes and status = 'published';
  end if;

  perform private.studio2_emit_notice_sent(v_notice);
  return v_notice;
end
$$;

create or replace function public.studio2_cancel_notice(p_notice_id uuid, p_reason text default null)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_notice public.studio2_official_notices%rowtype;
begin
  select * into v_notice from public.studio2_official_notices where id = p_notice_id for update;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  perform private.studio2_require_communications_access(v_notice.edition_id);
  if v_notice.status not in ('draft', 'scheduled') then
    raise exception 'Only draft or scheduled notices can be cancelled' using errcode = '23514';
  end if;

  update public.studio2_official_notices
  set status = 'cancelled', scheduled_at = null, cancelled_at = now(),
      cancelled_by = v_actor, cancellation_reason = nullif(btrim(p_reason), '')
  where id = p_notice_id
  returning * into v_notice;

  if v_notice.edition_id is not null then
    insert into public.studio2_contest_events (
      edition_id, type, actor_user_id, entity_type, entity_id, payload
    ) values (
      v_notice.edition_id, 'notice.sent', v_actor, 'notice', v_notice.id::text,
      jsonb_build_object('action', 'cancelled', 'reason', v_notice.cancellation_reason)
    );
  end if;
  return v_notice;
end
$$;

create or replace function public.studio2_create_superseding_notice_draft(p_notice_id uuid)
returns public.studio2_official_notices
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_source public.studio2_official_notices%rowtype;
  v_notice public.studio2_official_notices%rowtype;
begin
  select * into v_source from public.studio2_official_notices where id = p_notice_id for update;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  perform private.studio2_require_communications_access(v_source.edition_id);
  if v_source.status <> 'published' then
    raise exception 'Only a published notice can be superseded' using errcode = '23514';
  end if;

  insert into public.studio2_official_notices (
    edition_id, notice_type, title, body, severity, audience, audience_group,
    country_ids, acknowledgement_required, status, supersedes_id, created_by, updated_by
  ) values (
    v_source.edition_id, v_source.notice_type, v_source.title, v_source.body,
    v_source.severity, v_source.audience, v_source.audience_group,
    v_source.country_ids, v_source.acknowledgement_required, 'draft', v_source.id,
    v_actor, v_actor
  ) returning * into v_notice;
  return v_notice;
end
$$;

create or replace function public.studio2_publish_due_notices()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_notice public.studio2_official_notices%rowtype;
  v_count integer := 0;
begin
  for v_notice in
    select * from public.studio2_official_notices
    where status = 'scheduled' and scheduled_at is not null and scheduled_at <= now()
    order by scheduled_at
    for update skip locked
  loop
    update public.studio2_official_notices
    set status = 'published', sent_at = now(), scheduled_at = null
    where id = v_notice.id
    returning * into v_notice;

    if v_notice.supersedes_id is not null then
      update public.studio2_official_notices
      set status = 'superseded', superseded_by_id = v_notice.id
      where id = v_notice.supersedes_id and status = 'published';
    end if;

    perform private.studio2_emit_notice_sent(v_notice);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

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
  select * into v_notice from public.studio2_official_notices
  where id = p_notice_id and status = 'published' and sent_at is not null;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  if not private.studio2_user_can_receive_notice_v2(
    v_actor, v_notice.edition_id, v_notice.audience, v_notice.country_ids, v_notice.audience_group
  ) then raise exception 'Notice is not available to this user' using errcode = '42501'; end if;

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
  select * into v_notice from public.studio2_official_notices
  where id = p_notice_id and status = 'published' and sent_at is not null;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  if not private.studio2_user_can_receive_notice_v2(
    v_actor, v_notice.edition_id, v_notice.audience, v_notice.country_ids, v_notice.audience_group
  ) then raise exception 'Notice is not available to this user' using errcode = '42501'; end if;

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

-- Preserve the original immediate-send RPC as a compatibility contract.
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
  v_notice public.studio2_official_notices%rowtype;
begin
  perform private.studio2_require_communications_access(p_edition_id);
  perform private.studio2_validate_notice_target(
    p_edition_id, p_audience, null, coalesce(p_country_ids, '{}'::uuid[])
  );
  if p_severity not in ('info', 'action_required', 'urgent', 'critical') then
    raise exception 'Unknown notice severity: %', p_severity using errcode = '22023';
  end if;
  if nullif(btrim(p_title), '') is null or nullif(btrim(p_body), '') is null then
    raise exception 'Notice title and body are required' using errcode = '22023';
  end if;

  insert into public.studio2_official_notices (
    edition_id, notice_type, title, body, severity, audience, country_ids,
    acknowledgement_required, status, sent_at, created_by, updated_by
  ) values (
    p_edition_id, 'official_notice', btrim(p_title), btrim(p_body), p_severity,
    p_audience, coalesce(p_country_ids, '{}'::uuid[]),
    coalesce(p_acknowledgement_required, false), 'published', now(), v_actor, v_actor
  ) returning * into v_notice;
  perform private.studio2_emit_notice_sent(v_notice);
  return v_notice;
end
$$;

-- Upgrade acknowledgement to the v2 targeting helper and preserve read state.
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
  select * into v_notice from public.studio2_official_notices
  where id = p_notice_id and status = 'published' and sent_at is not null;
  if not found then raise exception 'Notice not found: %', p_notice_id using errcode = 'P0002'; end if;
  if not private.studio2_user_can_receive_notice_v2(
    v_actor, v_notice.edition_id, v_notice.audience, v_notice.country_ids, v_notice.audience_group
  ) then raise exception 'Notice is not available to this user' using errcode = '42501'; end if;

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
      v_notice.edition_id, 'notice.acknowledged', v_actor, 'notice', v_notice.id::text,
      jsonb_build_object('noticeId', v_notice.id)
    );
  end if;
  return v_receipt;
end
$$;

revoke all on function private.studio2_user_can_receive_notice_v2(uuid, uuid, text, uuid[], text)
  from public, anon, authenticated;
revoke all on function private.studio2_validate_notice_target(uuid, text, text, uuid[])
  from public, anon, authenticated;
revoke all on function private.studio2_require_communications_access(uuid)
  from public, anon, authenticated;
revoke all on function private.studio2_emit_notice_sent(public.studio2_official_notices)
  from public, anon, authenticated;

revoke all on function public.studio2_create_notice_draft(uuid, text, text, text, text, text, text, uuid[], boolean, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_create_notice_draft(uuid, text, text, text, text, text, text, uuid[], boolean, uuid)
  to authenticated, service_role;

revoke all on function public.studio2_update_notice_draft(uuid, text, text, text, text, text, text, uuid[], boolean)
  from public, anon, authenticated;
grant execute on function public.studio2_update_notice_draft(uuid, text, text, text, text, text, text, uuid[], boolean)
  to authenticated, service_role;

revoke all on function public.studio2_schedule_notice(uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.studio2_schedule_notice(uuid, timestamptz)
  to authenticated, service_role;

revoke all on function public.studio2_publish_notice(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_publish_notice(uuid)
  to authenticated, service_role;

revoke all on function public.studio2_cancel_notice(uuid, text)
  from public, anon, authenticated;
grant execute on function public.studio2_cancel_notice(uuid, text)
  to authenticated, service_role;

revoke all on function public.studio2_create_superseding_notice_draft(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_create_superseding_notice_draft(uuid)
  to authenticated, service_role;

revoke all on function public.studio2_publish_due_notices()
  from public, anon, authenticated;
grant execute on function public.studio2_publish_due_notices() to service_role;

revoke all on function public.studio2_mark_notice_opened(uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_mark_notice_opened(uuid)
  to authenticated, service_role;

revoke all on function public.studio2_archive_notice(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.studio2_archive_notice(uuid, boolean)
  to authenticated, service_role;

-- Use the same pg_cron infrastructure already used by scheduled entry publication.
do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into v_job_id from cron.job where jobname = 'solaris-studio2-publish-due-notices' limit 1;
    if v_job_id is not null then perform cron.unschedule(v_job_id); end if;
    perform cron.schedule(
      'solaris-studio2-publish-due-notices',
      '* * * * *',
      'select public.studio2_publish_due_notices();'
    );
  end if;
end
$$;

notify pgrst, 'reload schema';
commit;
