begin;

-- TG11/TG12: private institutional rooms use TG2 membership/representation and
-- Permission Engine V2, never a second member authority. All private content is
-- RPC-only. No direct browser table DML, no public archive publication.
do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg11-tg12.private-institutional-workspaces',
      1, 'forward_fix_only', false, null,
      'Private spaces, live membership/history authorization, bounded message RPCs and auditable edit/redaction.'
    );
  end if;
end $contract$;


-- New backend capabilities stay inaccessible until explicitly rolled out.
-- Extend the EXISTING flag allowlist without overwriting another lane's keys.
do $world_chat_flags$
declare v_predicate text;
begin
  select pg_catalog.pg_get_expr(c.conbin,c.conrelid) into v_predicate
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid=c.conrelid
  join pg_catalog.pg_namespace n on n.oid=t.relnamespace
  where n.nspname='public' and t.relname='studio2_feature_flags'
    and c.conname='studio2_feature_flags_key_check' and c.contype='c';
  if v_predicate is null then
    raise exception 'WORLD_PRIVATE_FLAGS_ALLOWLIST_MISSING' using errcode='23514';
  end if;
  if pg_catalog.strpos(v_predicate,'terra_private_spaces')=0
     or pg_catalog.strpos(v_predicate,'terra_chat')=0 then
    alter table public.studio2_feature_flags drop constraint studio2_feature_flags_key_check;
    execute pg_catalog.format(
      'alter table public.studio2_feature_flags add constraint studio2_feature_flags_key_check check ((%s) or key in (%L,%L))',
      v_predicate, 'terra_private_spaces', 'terra_chat'
    );
  end if;
end $world_chat_flags$;
insert into public.studio2_feature_flags(key,enabled,admins_only,user_ids,edition_ids)
values
  ('terra_private_spaces',false,false,'{}'::uuid[],'{}'::uuid[]),
  ('terra_chat',false,false,'{}'::uuid[],'{}'::uuid[])
on conflict (key) do nothing;

insert into public.studio2_capabilities(key, domain, label, description, access_level)
values
  ('world.space.manage', 'world', 'Manage private spaces', 'Create, archive and control rooms in the institution.', 'administer'),
  ('world.chat.moderate', 'world', 'Moderate institutional chat', 'Pin and redact messages in authorized rooms.', 'approve')
on conflict (key) do nothing;

create table public.world_spaces (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.world_organizations(id) on delete restrict,
  organ_id uuid references public.world_organization_organs(id) on delete restrict,
  name text not null,
  description text not null default '',
  visibility_policy text not null default 'members'
    check (visibility_policy in ('members','leadership','organ','custom')),
  history_policy text not null default 'all_member_history'
    check (history_policy in ('from_join','all_member_history','custom')),
  status text not null default 'active'
    check (status in ('active','archived')),
  created_by uuid not null references auth.users(id) on delete restrict,
  create_request_id uuid not null,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint world_spaces_name_check check (length(btrim(name)) between 1 and 100),
  constraint world_spaces_organ_check check (visibility_policy <> 'organ' or organ_id is not null),
  unique (organization_id, name),
  unique (created_by, create_request_id)
);
create index world_spaces_organization_idx on public.world_spaces(organization_id, status, created_at);

-- Explicit room overrides never grant access without a CURRENT TG2 affiliation.
create table private.world_space_access_grants (
  space_id uuid not null references public.world_spaces(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null default 'member' check (role in ('member','moderator')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  history_from timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (space_id, user_id),
  check (ends_at is null or ends_at > starts_at)
);

create table private.world_space_messages (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.world_spaces(id) on delete restrict,
  sender_user_id uuid not null references auth.users(id) on delete restrict,
  request_id uuid not null,
  reply_to_id uuid,
  body text not null check (length(btrim(body)) between 1 and 4000),
  revision bigint not null default 1 check (revision >= 1),
  edited_at timestamptz,
  redacted_at timestamptz,
  pinned_at timestamptz,
  pinned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (sender_user_id, request_id),
  unique (id, space_id),
  foreign key (reply_to_id, space_id)
    references private.world_space_messages(id, space_id) on delete restrict
);
create index world_space_messages_page_idx
  on private.world_space_messages(space_id, created_at desc, id desc);

create table private.world_space_message_revisions (
  id bigint generated always as identity primary key,
  message_id uuid not null references private.world_space_messages(id) on delete restrict,
  revision bigint not null,
  previous_body text not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  kind text not null check (kind in ('edit','moderator_redaction')),
  changed_at timestamptz not null default now(),
  unique (message_id, revision)
);
create table private.world_space_reactions (
  message_id uuid not null references private.world_space_messages(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  emoji text not null check (length(emoji) between 1 and 12),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create table private.world_space_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references private.world_space_messages(id) on delete restrict,
  uploader_user_id uuid not null references auth.users(id) on delete restrict,
  storage_path text not null unique,
  filename text not null,
  mime_type text not null,
  bytes bigint not null check (bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
-- Attachment storage/upload is deliberately not exposed until its separate
-- private-bucket ACL and virus-scan contract are certified.

alter table public.world_spaces enable row level security;
alter table private.world_space_access_grants enable row level security;
alter table private.world_space_messages enable row level security;
alter table private.world_space_message_revisions enable row level security;
alter table private.world_space_reactions enable row level security;
alter table private.world_space_attachments enable row level security;

revoke all on table public.world_spaces, private.world_space_access_grants,
  private.world_space_messages, private.world_space_message_revisions,
  private.world_space_reactions, private.world_space_attachments
  from public, anon, authenticated;
grant all on table public.world_spaces, private.world_space_access_grants,
  private.world_space_messages, private.world_space_message_revisions,
  private.world_space_reactions, private.world_space_attachments to service_role;
grant usage, select on sequence private.world_space_message_revisions_id_seq to service_role;

-- Canonical live TG2 memberships are essential; former or suspended members
-- and future-dated representatives cannot use an old room URL or saved token.
create function private.world_space_member_since_v1(p_organization_id uuid)
returns timestamptz
language sql stable security definer set search_path = pg_catalog
as $$
  select min(q.since_at)
  from (
    select greatest(m.joined_at,coalesce(ct.started_at,a.created_at)) as since_at
      from public.world_organization_memberships m
      join public.country_accounts a on a.country_id = m.country_id
      left join public.world_country_control_terms ct
        on ct.country_id=a.country_id and ct.user_id=a.user_id and ct.ended_at is null
      where a.user_id = auth.uid() and a.status = 'active'
        and m.organization_id = p_organization_id
        and m.status in ('member','observer','associate')
        and m.ended_at is null and m.joined_at <= now()
    union all
    select greatest(m.joined_at, r.starts_at) as since_at
      from public.world_organization_representations r
      join public.world_organization_memberships m
        on m.organization_id = r.organization_id
       and m.country_id = r.country_id
      where r.user_id = auth.uid()
        and r.organization_id = p_organization_id
        and r.starts_at <= now()
        and (r.ends_at is null or r.ends_at > now())
        and m.joined_at <= now() and m.ended_at is null
        and m.status in ('member','observer','associate')
  ) q
$$;

-- NULL = denied; otherwise earliest readable chat instant. This function is
-- evaluated fresh on EVERY RPC invocation, not copied to a client JWT/claim.
create function private.world_space_read_from_v1(p_space_id uuid)
returns timestamptz
language plpgsql stable security definer set search_path = pg_catalog
as $$
declare
  v_space public.world_spaces%rowtype;
  v_member_since timestamptz;
  v_grant private.world_space_access_grants%rowtype;
  v_office boolean;
  v_manager boolean;
begin
  if auth.uid() is null or not public.studio2_feature_enabled('terra_private_spaces',null)
  then return null; end if;
  select * into v_space from public.world_spaces where id = p_space_id;
  if not found or v_space.status <> 'active' then return null; end if;
  v_manager := public.world_access_allowed('world.space.manage', v_space.organization_id)
    or public.world_access_allowed('world.organization.settings.manage', v_space.organization_id);
  v_member_since := private.world_space_member_since_v1(v_space.organization_id);
  if v_member_since is null and not public.studio2_access_allowed('system.manage',null,false)
  then return null; end if;
  select * into v_grant from private.world_space_access_grants
    where space_id = p_space_id and user_id = auth.uid()
      and starts_at <= now() and (ends_at is null or ends_at > now());
  select exists (
    select 1 from public.world_office_terms t
      join public.world_organization_offices o on o.id = t.office_id
    where o.organization_id = v_space.organization_id
      and (o.organ_id is null or o.organ_id = v_space.organ_id)
      and o.active and t.status = 'active'
      and t.holder_user_id = auth.uid()
      and t.started_at <= now() and t.actual_end_at is null
  ) into v_office;
  if not (
    v_manager
    or v_space.visibility_policy = 'members'
    or (v_space.visibility_policy = 'leadership' and (v_office or v_grant.space_id is not null))
    or (v_space.visibility_policy = 'organ' and (
      v_grant.space_id is not null or public.world_access_allowed(
        'world.organization.view_private', v_space.organization_id,
        null, v_space.organ_id)))
    or (v_space.visibility_policy = 'custom' and v_grant.space_id is not null)
  ) then return null; end if;
  if v_space.history_policy = 'all_member_history' then
    return '-infinity'::timestamptz;
  end if;
  if v_space.history_policy = 'custom' and v_grant.history_from is not null then
    return v_grant.history_from;
  end if;
  return coalesce(v_member_since, now());
end
$$;

create function public.world_spaces_list_v1(p_slug text)
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'name', s.name, 'description', s.description,
    'visibility', s.visibility_policy, 'history', s.history_policy,
    'status', s.status, 'revision', s.revision, 'organizationId', s.organization_id,
    'canManage', public.world_access_allowed('world.space.manage',s.organization_id)
      or public.world_access_allowed('world.organization.settings.manage',s.organization_id),
    'canModerate', public.world_access_allowed('world.chat.moderate',s.organization_id)
      or public.world_access_allowed('world.space.manage',s.organization_id)
      or public.world_access_allowed('world.organization.settings.manage',s.organization_id)
      or exists (select 1 from private.world_space_access_grants g
        where g.space_id=s.id and g.user_id=auth.uid() and g.role='moderator'
          and g.starts_at<=now() and (g.ends_at is null or g.ends_at>now()))
  ) order by s.created_at, s.id), '[]'::jsonb)
  from public.world_spaces s
  join public.world_organizations o on o.id = s.organization_id
  where o.slug = p_slug and s.status = 'active'
    and private.world_space_read_from_v1(s.id) is not null
$$;

-- Member-facing private organization picker. Reveals only accessible rooms.
create function public.world_my_workspaces_v1()
returns jsonb language sql stable security definer set search_path = pg_catalog
as $
  select coalesce(jsonb_agg(jsonb_build_object(
    'slug',q.slug,'name',q.name,'rooms',q.rooms
  ) order by q.name), '[]'::jsonb)
  from (
    select o.slug, o.short_name as name,
      (select count(*) from public.world_spaces s
        where s.organization_id=o.id and s.status='active'
          and private.world_space_read_from_v1(s.id) is not null) as rooms
    from public.world_organizations o
    where public.studio2_feature_enabled('terra_private_spaces',null)
      and (
        private.world_space_member_since_v1(o.id) is not null
        or public.world_access_allowed('world.space.manage',o.id)
        or public.world_access_allowed('world.organization.settings.manage',o.id)
      )
    limit 100
  ) q
$$;

-- Allows an authorized manager to create the FIRST room. This exposes no
-- institution metadata unless the caller is a current member/manager.
create function public.world_workspace_context_v1(p_slug text)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $
declare v_org public.world_organizations%rowtype; v_manage boolean;
begin
  if auth.uid() is null or not public.studio2_feature_enabled('terra_private_spaces',null)
  then return null; end if;
  select * into v_org from public.world_organizations where slug=p_slug;
  if not found then return null; end if;
  v_manage := public.world_access_allowed('world.space.manage',v_org.id)
    or public.world_access_allowed('world.organization.settings.manage',v_org.id);
  if private.world_space_member_since_v1(v_org.id) is null and not v_manage
  then return null; end if;
  return jsonb_build_object('organizationId',v_org.id,
    'name',v_org.short_name,'canManage',v_manage);
end
$$;

create function public.world_space_create_v1(
  p_organization_id uuid, p_name text, p_description text,
  p_visibility text, p_history text, p_organ_id uuid,
  p_request_id uuid
)
returns uuid language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare v_id uuid;
begin
  if not public.world_access_allowed('world.space.manage', p_organization_id)
     and not public.world_access_allowed('world.organization.settings.manage', p_organization_id)
  then raise exception using errcode='42501', message='AUTHORIZATION'; end if;
  if not public.studio2_feature_enabled('terra_private_spaces',null) then
    raise exception using errcode='42501',message='FEATURE_DISABLED'; end if;
  if p_request_id is null or length(btrim(coalesce(p_name,''))) not between 1 and 100
     or p_visibility not in ('members','leadership','organ','custom')
     or p_history not in ('from_join','all_member_history','custom')
  then raise exception using errcode='22023', message='VALIDATION'; end if;
  if p_organ_id is not null and not exists (
    select 1 from public.world_organization_organs
      where id = p_organ_id and organization_id = p_organization_id
  ) then raise exception using errcode='22023', message='ORGAN_SCOPE'; end if;
  insert into public.world_spaces (
    organization_id, organ_id, name, description, visibility_policy,
    history_policy, created_by, create_request_id
  ) values (
    p_organization_id, p_organ_id, btrim(p_name), left(btrim(coalesce(p_description,'')),500),
    p_visibility, p_history, auth.uid(), p_request_id
  ) on conflict (created_by, create_request_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.world_spaces
      where created_by = auth.uid() and create_request_id = p_request_id
        and organization_id = p_organization_id;
  end if;
  if v_id is null then raise exception using errcode='23514', message='STATE_CHANGED'; end if;
  return v_id;
end
$$;

create function public.world_space_set_grant_v1(
  p_space_id uuid, p_user_id uuid, p_role text,
  p_history_from timestamptz, p_active boolean
)
returns boolean language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare v_space public.world_spaces%rowtype;
begin
  select * into v_space from public.world_spaces where id=p_space_id for update;
  if not found or not public.world_access_allowed('world.space.manage',v_space.organization_id)
  then raise exception using errcode='42501', message='AUTHORIZATION'; end if;
  if not public.studio2_feature_enabled('terra_private_spaces',null) then
    raise exception using errcode='42501',message='FEATURE_DISABLED'; end if;
  if p_user_id is null or p_role not in ('member','moderator')
  then raise exception using errcode='22023', message='VALIDATION'; end if;
  if p_active then
    insert into private.world_space_access_grants(space_id,user_id,role,history_from,updated_by)
      values(p_space_id,p_user_id,p_role,p_history_from,auth.uid())
      on conflict (space_id,user_id) do update
      set role=excluded.role, history_from=excluded.history_from,
          starts_at=now(), ends_at=null, updated_by=auth.uid(), updated_at=now();
  else
    update private.world_space_access_grants set ends_at=now(), updated_at=now(),
      updated_by=auth.uid() where space_id=p_space_id and user_id=p_user_id;
  end if;
  return true;
end
$$;

create function public.world_space_messages_v1(
  p_space_id uuid, p_before uuid default null, p_limit integer default 35
)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog
as $$
declare v_from timestamptz; v_anchor record; v_result jsonb;
begin
  if not public.studio2_feature_enabled('terra_chat',null) then
    raise exception using errcode='42501',message='FEATURE_DISABLED'; end if;
  v_from := private.world_space_read_from_v1(p_space_id);
  if v_from is null then raise exception using errcode='42501', message='AUTHORIZATION'; end if;
  if p_limit is null or p_limit < 1 or p_limit > 50
  then raise exception using errcode='22023', message='INVALID_LIMIT'; end if;
  if p_before is not null then
    select created_at,id into v_anchor from private.world_space_messages
      where id=p_before and space_id=p_space_id and created_at >= v_from;
    if not found then raise exception using errcode='22023', message='INVALID_CURSOR'; end if;
  end if;
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id',m.id, 'spaceId',m.space_id,'senderId',m.sender_user_id,
      'senderName', coalesce((
        select p.display_name
        from public.world_organization_representations r
        join public.delegation_people p on p.id = r.person_id
        join public.world_spaces s on s.organization_id = r.organization_id
        where s.id = m.space_id and r.user_id = m.sender_user_id
        order by r.starts_at desc limit 1
      ),'Institution member'),
      'body',m.body,'revision',m.revision,'replyToId',m.reply_to_id,
      'createdAt',m.created_at,'editedAt',m.edited_at,
      'redacted',m.redacted_at is not null,'pinned',m.pinned_at is not null,
      'reactions',coalesce((
        select jsonb_agg(jsonb_build_object('emoji',rx.emoji,'userId',rx.user_id))
        from private.world_space_reactions rx where rx.message_id=m.id
      ),'[]'::jsonb)
    ) order by m.created_at asc,m.id asc
  ),'[]'::jsonb) into v_result
  from (
    select * from private.world_space_messages m
    where m.space_id=p_space_id and m.created_at >= v_from
      and (p_before is null or (m.created_at,m.id) < (v_anchor.created_at,v_anchor.id))
    order by m.created_at desc,m.id desc limit p_limit
  ) m;
  return v_result;
end
$$;

create function public.world_space_send_v1(
  p_space_id uuid, p_body text, p_reply_to_id uuid, p_request_id uuid
)
returns jsonb language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare v_from timestamptz; v_message private.world_space_messages%rowtype;
begin
  if not public.studio2_feature_enabled('terra_chat',null) then
    raise exception using errcode='42501',message='FEATURE_DISABLED'; end if;
  v_from:=private.world_space_read_from_v1(p_space_id);
  if v_from is null then raise exception using errcode='42501', message='AUTHORIZATION'; end if;
  if p_request_id is null or length(btrim(coalesce(p_body,''))) not between 1 and 4000
  then raise exception using errcode='22023', message='VALIDATION'; end if;
  if p_reply_to_id is not null and not exists (
    select 1 from private.world_space_messages
    where id=p_reply_to_id and space_id=p_space_id and created_at >= v_from
  ) then raise exception using errcode='22023', message='INVALID_REPLY'; end if;
  insert into private.world_space_messages(space_id,sender_user_id,request_id,reply_to_id,body)
  values(p_space_id,auth.uid(),p_request_id,p_reply_to_id,btrim(p_body))
  on conflict (sender_user_id,request_id) do nothing returning * into v_message;
  if v_message.id is null then
    select * into v_message from private.world_space_messages
    where sender_user_id=auth.uid() and request_id=p_request_id and space_id=p_space_id;
  end if;
  if v_message.id is null then raise exception using errcode='23514',message='IDEMPOTENCY_SCOPE'; end if;
  return jsonb_build_object('id',v_message.id,'revision',v_message.revision,'createdAt',v_message.created_at);
end
$$;

create function public.world_space_edit_v1(
  p_message_id uuid, p_expected_revision bigint, p_body text
)
returns bigint language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare v_message private.world_space_messages%rowtype;
begin
  if not public.studio2_feature_enabled('terra_chat',null) then
    raise exception using errcode='42501',message='FEATURE_DISABLED'; end if;
  select * into v_message from private.world_space_messages
    where id=p_message_id for update;
  if not found or private.world_space_read_from_v1(v_message.space_id) is null
     or v_message.sender_user_id <> auth.uid()
  then raise exception using errcode='42501', message='AUTHORIZATION'; end if;
  if v_message.redacted_at is not null
  then raise exception using errcode='23514',message='MESSAGE_REDACTED'; end if;
  if p_expected_revision is distinct from v_message.revision
  then raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
  if length(btrim(coalesce(p_body,''))) not between 1 and 4000
  then raise exception using errcode='22023',message='VALIDATION'; end if;
  insert into private.world_space_message_revisions(message_id,revision,previous_body,changed_by,kind)
    values(v_message.id,v_message.revision,v_message.body,auth.uid(),'edit');
  update private.world_space_messages set body=btrim(p_body),
    revision=revision+1, edited_at=now() where id=v_message.id;
  return v_message.revision+1;
end
$$;

create function public.world_space_set_reaction_v1(
  p_message_id uuid, p_emoji text, p_present boolean
)
returns boolean language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare v_message private.world_space_messages%rowtype; v_from timestamptz;
begin
  if not public.studio2_feature_enabled('terra_chat',null) then
    raise exception using errcode='42501',message='FEATURE_DISABLED'; end if;
  select * into v_message from private.world_space_messages where id=p_message_id;
  if not found then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  v_from:=private.world_space_read_from_v1(v_message.space_id);
  if v_from is null or v_message.created_at < v_from or v_message.redacted_at is not null
  then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  if p_emoji is null or length(p_emoji) not between 1 and 12 or p_present is null
  then raise exception using errcode='22023',message='VALIDATION'; end if;
  if p_present then
    insert into private.world_space_reactions(message_id,user_id,emoji)
    values(p_message_id,auth.uid(),p_emoji) on conflict do nothing;
  else
    delete from private.world_space_reactions
      where message_id=p_message_id and user_id=auth.uid() and emoji=p_emoji;
  end if;
  return true;
end
$$;

create function public.world_space_moderate_v1(
  p_message_id uuid, p_action text, p_expected_revision bigint
)
returns bigint language plpgsql volatile security definer set search_path = pg_catalog
as $$
declare v_message private.world_space_messages%rowtype; v_org uuid; v_grant boolean;
begin
  if not public.studio2_feature_enabled('terra_chat',null) then
    raise exception using errcode='42501',message='FEATURE_DISABLED'; end if;
  select * into v_message from private.world_space_messages where id=p_message_id for update;
  if not found or private.world_space_read_from_v1(v_message.space_id) is null
  then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  select organization_id into v_org from public.world_spaces where id=v_message.space_id;
  select exists (select 1 from private.world_space_access_grants
    where space_id=v_message.space_id and user_id=auth.uid() and role='moderator'
      and starts_at<=now() and (ends_at is null or ends_at>now())) into v_grant;
  if not v_grant and not public.world_access_allowed('world.chat.moderate',v_org)
     and not public.world_access_allowed('world.space.manage',v_org)
     and not public.world_access_allowed('world.organization.settings.manage',v_org)
  then raise exception using errcode='42501',message='AUTHORIZATION'; end if;
  if p_expected_revision is distinct from v_message.revision
  then raise exception using errcode='40001',message='VERSION_CONFLICT'; end if;
  if p_action='redact' and v_message.redacted_at is null then
    insert into private.world_space_message_revisions(message_id,revision,previous_body,changed_by,kind)
    values(v_message.id,v_message.revision,v_message.body,auth.uid(),'moderator_redaction');
    update private.world_space_messages
    set body='[Message removed by a moderator]',redacted_at=now(),revision=revision+1,
      edited_at=now() where id=p_message_id;
  elsif p_action='pin' then
    update private.world_space_messages set pinned_at=now(),pinned_by=auth.uid(),
      revision=revision+1 where id=p_message_id;
  elsif p_action='unpin' then
    update private.world_space_messages set pinned_at=null,pinned_by=null,
      revision=revision+1 where id=p_message_id;
  else raise exception using errcode='22023',message='INVALID_ACTION'; end if;
  return v_message.revision+1;
end
$$;

revoke all on function private.world_space_member_since_v1(uuid),
  private.world_space_read_from_v1(uuid) from public, anon, authenticated;
revoke all on function public.world_my_workspaces_v1(),
  public.world_workspace_context_v1(text),
  public.world_spaces_list_v1(text),
  public.world_space_create_v1(uuid,text,text,text,text,uuid,uuid),
  public.world_space_set_grant_v1(uuid,uuid,text,timestamptz,boolean),
  public.world_space_messages_v1(uuid,uuid,integer),
  public.world_space_send_v1(uuid,text,uuid,uuid),
  public.world_space_edit_v1(uuid,bigint,text),
  public.world_space_set_reaction_v1(uuid,text,boolean),
  public.world_space_moderate_v1(uuid,text,bigint)
  from public, anon, authenticated;
grant execute on function public.world_my_workspaces_v1(),
  public.world_workspace_context_v1(text),
  public.world_spaces_list_v1(text),
  public.world_space_create_v1(uuid,text,text,text,text,uuid,uuid),
  public.world_space_set_grant_v1(uuid,uuid,text,timestamptz,boolean),
  public.world_space_messages_v1(uuid,uuid,integer),
  public.world_space_send_v1(uuid,text,uuid,uuid),
  public.world_space_edit_v1(uuid,bigint,text),
  public.world_space_set_reaction_v1(uuid,text,boolean),
  public.world_space_moderate_v1(uuid,text,bigint)
  to authenticated, service_role;

comment on table public.world_spaces is
  'TG11 institutional workspace metadata; RLS denies direct client reads and all content access is governed by RPC.';
comment on table private.world_space_message_revisions is
  'TG12 non-public edit/redaction audit; original redacted content must never enter public archives.';
notify pgrst, 'reload schema';
commit;
