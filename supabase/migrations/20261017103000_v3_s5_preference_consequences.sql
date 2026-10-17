begin;

-- System V3 S5 engagement: make authenticated follow preferences durable
-- DomainEvents without changing the existing set_fan_follow authority. Follows
-- are private user-owned state; there are no Organizer task/notification
-- consequences to invent. The migration adds a server-owned row revision so
-- meaningful updates have monotonic aggregate versions, then emits one
-- preference.changed fact for insert/update/delete transitions.

alter table public.fan_follows
  add column if not exists revision bigint;

update public.fan_follows
set revision = 1
where revision is null;

alter table public.fan_follows
  alter column revision set default 1,
  alter column revision set not null;

alter table public.fan_follows
  drop constraint if exists fan_follows_revision_check;
alter table public.fan_follows
  add constraint fan_follows_revision_check
  check (revision >= 1) not valid;
alter table public.fan_follows
  validate constraint fan_follows_revision_check;

create or replace function private.v3_bump_fan_follow_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $bump$
begin
  if old.profile_id is distinct from new.profile_id
     or old.entity_type is distinct from new.entity_type
     or old.entity_id is distinct from new.entity_id
     or old.notification_level is distinct from new.notification_level then
    new.revision := old.revision + 1;
  else
    new.revision := old.revision;
  end if;
  return new;
end
$bump$;

revoke all on function private.v3_bump_fan_follow_revision()
  from public, anon, authenticated;

drop trigger if exists v3_bump_fan_follow_revision
  on public.fan_follows;
create trigger v3_bump_fan_follow_revision
before update on public.fan_follows
for each row
execute function private.v3_bump_fan_follow_revision();

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
     or p_entity_type not in ('country', 'edition', 'show')
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
  uuid, uuid, text, text, uuid, text, bigint
) from public, anon, authenticated;

create or replace function private.v3_emit_fan_follow_preference_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $emit$
declare
  v_follow_id uuid;
  v_profile_id uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_notification_level text;
  v_revision bigint;
  v_following boolean;
  v_action text;
  v_command text;
  v_operation_id uuid;
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_actor_id uuid;
  v_edition_id uuid;
  v_show_id uuid;
  v_receipt public.studio2_operation_receipts%rowtype;
begin
  if tg_op = 'UPDATE'
     and old.profile_id is not distinct from new.profile_id
     and old.entity_type is not distinct from new.entity_type
     and old.entity_id is not distinct from new.entity_id
     and old.notification_level is not distinct from new.notification_level then
    return new;
  end if;

  if tg_op = 'DELETE' then
    v_follow_id := old.id;
    v_profile_id := old.profile_id;
    v_entity_type := old.entity_type;
    v_entity_id := old.entity_id;
    v_notification_level := old.notification_level;
    v_revision := old.revision + 1;
    v_following := false;
    v_action := 'remove';
  else
    v_follow_id := new.id;
    v_profile_id := new.profile_id;
    v_entity_type := new.entity_type;
    v_entity_id := new.entity_id;
    v_notification_level := new.notification_level;
    v_revision := new.revision;
    v_following := true;
    v_action := 'save';
  end if;

  v_actor_id := auth.uid();
  if v_actor_id is not null and v_actor_id is distinct from v_profile_id then
    raise exception 'Preference actor does not own follow state'
      using errcode = '42501';
  end if;

  v_command := case v_action
    when 'save' then 'preference.save'
    else 'preference.remove'
  end;
  v_scope := jsonb_build_object('profileId', v_profile_id);
  v_request := jsonb_strip_nulls(jsonb_build_object(
    'followId', v_follow_id,
    'entityType', v_entity_type,
    'entityId', v_entity_id,
    'notificationLevel', v_notification_level,
    'following', v_following,
    'revision', v_revision
  ));
  v_operation_id := private.v3_fan_follow_operation_id(
    v_follow_id,
    v_profile_id,
    v_action,
    v_entity_type,
    v_entity_id,
    v_notification_level,
    v_revision
  );
  v_fingerprint := private.studio2_request_fingerprint(
    v_command,
    'R0',
    v_scope,
    v_request - 'following'
  );

  if v_entity_type = 'edition' then
    v_edition_id := v_entity_id;
  elsif v_entity_type = 'show' then
    v_show_id := v_entity_id;
    select show_row.edition_id
    into v_edition_id
    from public.shows show_row
    where show_row.id = v_entity_id;
  end if;

  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope,
    status,
    result,
    completed_at
  ) values (
    v_operation_id,
    v_actor_id,
    v_operation_id::text,
    v_operation_id,
    v_fingerprint,
    v_command,
    'R0',
    v_scope,
    'succeeded',
    jsonb_build_object(
      'ok', true,
      'followId', v_follow_id,
      'entityType', v_entity_type,
      'entityId', v_entity_id,
      'following', v_following,
      'revision', v_revision
    ),
    now()
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from v_actor_id
     or v_receipt.command is distinct from v_command
     or v_receipt.idempotency_key is distinct from v_operation_id::text
     or v_receipt.correlation_id is distinct from v_operation_id
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope
     or v_receipt.status <> 'succeeded' then
    raise exception 'IDEMPOTENCY_CONFLICT: Preference transition identity has different semantics'
      using errcode = '23505';
  end if;

  perform private.v3_emit_domain_event(
    'preference.changed',
    'preference',
    v_follow_id::text,
    v_revision,
    v_operation_id,
    v_edition_id,
    v_show_id,
    jsonb_strip_nulls(jsonb_build_object(
      'followId', v_follow_id,
      'entityType', v_entity_type,
      'entityId', v_entity_id,
      'notificationLevel', case when v_following then v_notification_level end,
      'following', v_following,
      'revision', v_revision
    )),
    1,
    array[]::text[]
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$emit$;

revoke all on function private.v3_emit_fan_follow_preference_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_fan_follow_preference_event
  on public.fan_follows;
create trigger v3_emit_fan_follow_preference_event
after insert or update or delete
on public.fan_follows
for each row
execute function private.v3_emit_fan_follow_preference_event();

comment on column public.fan_follows.revision is
  'Server-owned monotonic semantic revision for the durable follow preference row. S5 DomainEvents use this as aggregate_version.';

notify pgrst, 'reload schema';

commit;
