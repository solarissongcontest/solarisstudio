begin;

-- Solaris Studio V3 S15 / Worker 9 Round 2: Community-profile moderation consequence.
--
-- The existing community.fan_identity.moderate R2 operation already owns the
-- privileged state transition, audit evidence and semantic replay. This
-- migration adds a monotonic moderation revision plus the missing canonical
-- DomainEvent fact. Public identity projections remain direct reads from
-- fan_profiles; there is deliberately no fake asynchronous consumer or second
-- projection store to reconcile.

insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s15.community-profile-moderation-consequence',
  1,
  'forward_fix_only',
  false,
  null,
  'Version canonical fan-profile moderation changes and emit privacy-bounded community_profile.moderated facts from successful R2 operation receipts.'
)
on conflict (migration_key) do nothing;

alter table public.fan_profiles
  add column if not exists moderation_revision bigint not null default 0;

alter table public.fan_profiles
  drop constraint if exists fan_profiles_moderation_revision_check;
alter table public.fan_profiles
  add constraint fan_profiles_moderation_revision_check
  check (moderation_revision >= 0) not valid;
alter table public.fan_profiles
  validate constraint fan_profiles_moderation_revision_check;

create or replace function private.v3_bump_fan_profile_moderation_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $bump$
begin
  if old.moderation_hidden_at is distinct from new.moderation_hidden_at
     or old.moderation_reason is distinct from new.moderation_reason
     or old.moderated_by is distinct from new.moderated_by then
    new.moderation_revision := old.moderation_revision + 1;
  else
    -- Revision is server-owned metadata. A direct attempt to change only the
    -- counter is ignored rather than becoming a second mutation authority.
    new.moderation_revision := old.moderation_revision;
  end if;
  return new;
end
$bump$;

revoke all on function private.v3_bump_fan_profile_moderation_revision()
  from public, anon, authenticated;

drop trigger if exists v3_bump_fan_profile_moderation_revision
  on public.fan_profiles;
create trigger v3_bump_fan_profile_moderation_revision
before update of
  moderation_hidden_at,
  moderation_reason,
  moderated_by,
  moderation_revision
on public.fan_profiles
for each row
execute function private.v3_bump_fan_profile_moderation_revision();

comment on column public.fan_profiles.moderation_revision is
  'Server-owned monotonic revision for public community-identity moderation. Successful community_profile.moderated DomainEvents use this as aggregate_version.';

create or replace function private.v3_emit_community_profile_moderation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_profile_id uuid;
  v_result_operation_id uuid;
  v_hidden boolean;
  v_hidden_at timestamptz;
  v_revision bigint;
begin
  if new.status <> 'succeeded'
     or old.status = 'succeeded'
     or new.command <> 'community.fan_identity.moderate' then
    return new;
  end if;

  begin
    v_profile_id := nullif(new.result ->> 'profileId', '')::uuid;
    v_result_operation_id := nullif(new.result ->> 'operationId', '')::uuid;
    v_hidden := nullif(new.result ->> 'hidden', '')::boolean;
  exception when invalid_text_representation then
    raise exception 'Successful community moderation operation has invalid event provenance'
      using errcode = '23514';
  end;

  if v_profile_id is null
     or v_result_operation_id is distinct from new.operation_id
     or v_hidden is null then
    raise exception 'Successful community moderation operation lacks event provenance'
      using errcode = '23514';
  end if;

  select
    profile.moderation_hidden_at,
    profile.moderation_revision
  into
    v_hidden_at,
    v_revision
  from public.fan_profiles profile
  where profile.id = v_profile_id
  for share;

  if not found
     or v_revision is null
     or v_revision < 1
     or (v_hidden_at is not null) is distinct from v_hidden then
    raise exception 'Successful community moderation receipt does not match canonical profile state'
      using errcode = '23514';
  end if;

  perform private.v3_emit_domain_event(
    'community_profile.moderated',
    'community_profile',
    v_profile_id::text,
    v_revision,
    new.operation_id,
    null,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'profileId', v_profile_id,
      'hidden', v_hidden,
      'hiddenAt', v_hidden_at,
      'revision', v_revision
    )),
    1,
    array[]::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_community_profile_moderation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_community_profile_moderation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_community_profile_moderation_event
after update of status, result
on public.studio2_operation_receipts
for each row
execute function private.v3_emit_community_profile_moderation_event();

notify pgrst, 'reload schema';

commit;
