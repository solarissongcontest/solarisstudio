begin;
-- TG10 extends the existing fan_follows owner and S5 preference event system.
-- This creates no world_follows, official publication or push delivery.
do $contract$
begin
 if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
  perform public.v3_register_migration_contract(
   'v3.tg10.world-organization-follows',1,'forward_fix_only',false,null,
   'Extend existing follow preferences to public organizations and owner-scoped institutional follow categories, retaining S5 event identity.'
  );
 end if;
end $contract$;

alter table public.fan_follows drop constraint if exists fan_follows_entity_type_check;
alter table public.fan_follows add constraint fan_follows_entity_type_check
 check(entity_type in ('country','edition','show','organization')) not valid;
alter table public.fan_follows validate constraint fan_follows_entity_type_check;

-- Existing S5 trigger uses this fingerprint helper. Extend both it and the
-- canonical follow RPC atomically to avoid broken new organization follows.
create or replace function private.v3_fan_follow_operation_id(
  p_follow_id uuid,
  p_profile_id uuid,
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_notification_level text,
  p_revision bigint
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $identity$
declare
  v_command text;
  v_fingerprint text;
begin
  if p_follow_id is null
     or p_profile_id is null
     or p_action not in ('save', 'remove')
     or p_entity_type not in ('country', 'edition', 'show', 'organization')
     or p_entity_id is null
     or p_revision is null
     or p_revision < 1 then
    raise exception 'Preference transition identity is incomplete'
      using errcode = '22023';
  end if;

  v_command := case p_action
    when 'save' then 'preference.save'
    else 'preference.remove'
  end;

  v_fingerprint := private.studio2_request_fingerprint(
    v_command,
    'R0',
    jsonb_build_object('profileId', p_profile_id),
    jsonb_strip_nulls(jsonb_build_object(
      'followId', p_follow_id,
      'entityType', p_entity_type,
      'entityId', p_entity_id,
      'notificationLevel', p_notification_level,
      'revision', p_revision
    ))
  );

  return (
    substr(v_fingerprint, 1, 8) || '-' ||
    substr(v_fingerprint, 9, 4) || '-' ||
    substr(v_fingerprint, 13, 4) || '-' ||
    substr(v_fingerprint, 17, 4) || '-' ||
    substr(v_fingerprint, 21, 12)
  )::uuid;
end
$identity$;
revoke all on function private.v3_fan_follow_operation_id(
 uuid,uuid,text,text,uuid,text,bigint
) from public,anon,authenticated;

create or replace function public.set_fan_follow(
  _entity_type text,
  _entity_id uuid,
  _following boolean,
  _notification_level text default 'important'
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  entity_is_available boolean := false;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  if _entity_type not in ('country', 'edition', 'show', 'organization') then raise exception 'Unsupported follow type'; end if;
  if _notification_level not in ('all', 'important', 'none') then raise exception 'Unsupported notification level'; end if;

  entity_is_available := case _entity_type
    when 'country' then exists (select 1 from public.countries country where country.id = _entity_id)
    when 'edition' then exists (select 1 from public.editions edition where edition.id = _entity_id and edition.published is true)
    when 'show' then public.show_publication_enabled(_entity_id, 'participants')
    when 'organization' then exists (
      select 1 from public.world_organizations organization_row
      where organization_row.id = _entity_id
        and organization_row.public_visibility = 'public'
        and organization_row.status in ('recognized', 'active')
    )
    else false
  end;
  -- A former follower can remove a private or dissolved institution without
  -- gaining permission to follow it again or read any hidden data.
  if not entity_is_available
     and not (_entity_type = 'organization' and _following is false) then
    raise exception 'This item is not available to follow';
  end if;

  insert into public.fan_profiles (id) values (current_user_id) on conflict (id) do nothing;
  if _following then
    insert into public.fan_follows (profile_id, entity_type, entity_id, notification_level, updated_at)
    values (current_user_id, _entity_type, _entity_id, _notification_level, now())
    on conflict (profile_id, entity_type, entity_id)
    do update set notification_level = excluded.notification_level, updated_at = now();
  else
    delete from public.fan_follows follow
    where follow.profile_id = current_user_id
      and follow.entity_type = _entity_type
      and follow.entity_id = _entity_id;
  end if;
  return _following;
end;
$$;
revoke all on function public.set_fan_follow(text,uuid,boolean,text)
 from public,anon;
grant execute on function public.set_fan_follow(text,uuid,boolean,text)
 to authenticated,service_role;

create table public.fan_follow_categories(
 follow_id uuid not null references public.fan_follows(id) on delete cascade,
 category text not null check(category in (
  'statements','resolutions','leadership','sessions',
  'documents','proposals','membership'
 )),
 enabled boolean not null default true,
 updated_at timestamptz not null default now(),
 primary key(follow_id,category)
);
alter table public.fan_follow_categories enable row level security;
revoke all on public.fan_follow_categories from public,anon,authenticated;
grant select on public.fan_follow_categories to authenticated;
grant all on public.fan_follow_categories to service_role;
create policy fan_follow_categories_own_read
 on public.fan_follow_categories for select to authenticated
 using (exists(
   select 1 from public.fan_follows follow_row
   where follow_row.id=fan_follow_categories.follow_id
     and follow_row.profile_id=(select auth.uid())
     and follow_row.entity_type='organization'
 ));

-- Personal R0 preference, never a constitutional command. Public/role-required
-- notifications are NOT emitted by this function; the canonical future
-- institutional publisher must independently verify publication and audience.
create or replace function public.world_set_follow_category_v1(
 p_follow_id uuid,p_category text,p_enabled boolean
) returns boolean language plpgsql security definer
set search_path=pg_catalog
as $set_category$
declare
 v_actor uuid := auth.uid();
 v_follow_id uuid;
begin
 if v_actor is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 if p_follow_id is null or p_enabled is null or p_category is null
    or p_category not in (
     'statements','resolutions','leadership','sessions',
     'documents','proposals','membership'
    ) then
  raise exception using errcode='22023',message='VALIDATION';
 end if;
 select follow_row.id into v_follow_id
 from public.fan_follows follow_row
 where follow_row.id=p_follow_id and follow_row.profile_id=v_actor
   and follow_row.entity_type='organization'
 for update;
 if v_follow_id is null then
  raise exception using errcode='42501',message='AUTHORIZATION';
 end if;
 insert into public.fan_follow_categories(follow_id,category,enabled)
 values(v_follow_id,p_category,p_enabled)
 on conflict(follow_id,category) do update
 set enabled=excluded.enabled,
     updated_at=case
      when fan_follow_categories.enabled is distinct from excluded.enabled
      then now() else fan_follow_categories.updated_at end;
 return p_enabled;
end
$set_category$;
revoke all on function public.world_set_follow_category_v1(uuid,text,boolean)
 from public,anon,authenticated,service_role;
grant execute on function public.world_set_follow_category_v1(uuid,text,boolean)
 to authenticated,service_role;
comment on table public.fan_follow_categories is
 'World organizational categories extend existing user follows. No second follow authority; never an institutional notification publisher.';
notify pgrst, 'reload schema';
commit;
