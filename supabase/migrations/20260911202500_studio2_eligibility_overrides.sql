begin;

create table if not exists public.studio2_eligibility_overrides (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  affected_rule text not null check (
    length(btrim(affected_rule)) between 1 and 100
    and affected_rule ~ '^[a-z0-9][a-z0-9._-]*$'
  ),
  reason text not null check (length(btrim(reason)) >= 8),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revocation_reason text,
  constraint studio2_eligibility_override_revocation_check check (
    (revoked_at is null and revoked_by is null and revocation_reason is null)
    or (revoked_at is not null and revocation_reason is not null and length(btrim(revocation_reason)) >= 5)
  )
);

create index if not exists studio2_eligibility_overrides_scope_idx
  on public.studio2_eligibility_overrides (edition_id, country_id, affected_rule, created_at desc);
create index if not exists studio2_eligibility_overrides_active_idx
  on public.studio2_eligibility_overrides (edition_id, country_id, expires_at)
  where revoked_at is null;

alter table public.studio2_eligibility_overrides enable row level security;
revoke all on table public.studio2_eligibility_overrides from public, anon, authenticated;

create or replace function private.studio2_can_manage_eligibility(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    coalesce(public.has_role(p_user_id, 'organizer'::public.app_role), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'entry.approve', p_edition_id), false);
$$;

revoke all on function private.studio2_can_manage_eligibility(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.studio2_can_manage_eligibility(uuid, uuid)
  to service_role;

create or replace function public.studio2_list_eligibility_overrides(
  p_edition_id uuid,
  p_country_id uuid default null,
  p_include_history boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_can_manage boolean := false;
  v_rows jsonb := '[]'::jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;

  v_can_manage := coalesce(private.studio2_can_manage_eligibility(v_actor, p_edition_id), false);

  if p_country_id is null then
    if not v_is_service and not v_can_manage then
      raise exception 'Organizer or entry.approve capability required' using errcode = '42501';
    end if;
  elsif not v_is_service
    and not v_can_manage
    and not coalesce(public.owns_country(v_actor, p_country_id), false) then
    raise exception 'Country ownership or eligibility-management capability required' using errcode = '42501';
  end if;

  if p_include_history and not v_is_service and not v_can_manage then
    raise exception 'Eligibility override history requires organizer access' using errcode = '42501';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', o.id,
        'editionId', o.edition_id,
        'countryId', o.country_id,
        'countryName', c.name,
        'affectedRule', o.affected_rule,
        'reason', o.reason,
        'createdBy', o.created_by,
        'createdAt', o.created_at,
        'expiresAt', o.expires_at,
        'revokedAt', o.revoked_at,
        'revokedBy', o.revoked_by,
        'revocationReason', o.revocation_reason
      ) order by o.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.studio2_eligibility_overrides o
  join public.countries c on c.id = o.country_id
  where o.edition_id = p_edition_id
    and (p_country_id is null or o.country_id = p_country_id)
    and (
      p_include_history
      or (
        o.revoked_at is null
        and (o.expires_at is null or o.expires_at > now())
      )
    );

  return v_rows;
end
$$;

create or replace function public.studio2_create_eligibility_override(
  p_edition_id uuid,
  p_country_id uuid,
  p_affected_rule text,
  p_reason text,
  p_expires_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_rule text := lower(btrim(coalesce(p_affected_rule, '')));
  v_reason text := btrim(coalesce(p_reason, ''));
  v_country_name text;
  v_override public.studio2_eligibility_overrides%rowtype;
begin
  if p_edition_id is null or p_country_id is null then
    raise exception 'Edition id and country id are required' using errcode = '22023';
  end if;
  if v_rule !~ '^[a-z0-9][a-z0-9._-]*$' or length(v_rule) > 100 then
    raise exception 'Affected rule must be a stable eligibility rule id' using errcode = '22023';
  end if;
  if length(v_reason) < 8 then
    raise exception 'Explain why this eligibility override is justified' using errcode = '22023';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Override expiry must be in the future' using errcode = '22023';
  end if;
  if not v_is_service
     and not private.studio2_can_manage_eligibility(v_actor, p_edition_id) then
    raise exception 'Organizer or entry.approve capability required' using errcode = '42501';
  end if;

  select c.name into v_country_name
  from public.countries c
  where c.id = p_country_id;
  if not found then
    raise exception 'Country not found: %', p_country_id using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.participants p
    where p.edition_id = p_edition_id and p.country_id = p_country_id
    union all
    select 1 from public.entries e
    where e.edition_id = p_edition_id and e.country_id = p_country_id
  ) then
    raise exception 'Country does not participate in this edition' using errcode = '22023';
  end if;

  -- Serialize one country/rule override decision so concurrent organizers cannot
  -- accidentally create two active exceptions for the same factual rule.
  perform pg_advisory_xact_lock(
    hashtextextended(p_edition_id::text || ':' || p_country_id::text || ':' || v_rule, 0)
  );

  if exists (
    select 1
    from public.studio2_eligibility_overrides o
    where o.edition_id = p_edition_id
      and o.country_id = p_country_id
      and o.affected_rule = v_rule
      and o.revoked_at is null
      and (o.expires_at is null or o.expires_at > now())
  ) then
    raise exception 'An active override already exists for this eligibility rule' using errcode = '23505';
  end if;

  insert into public.studio2_eligibility_overrides (
    edition_id, country_id, affected_rule, reason, created_by, expires_at
  ) values (
    p_edition_id, p_country_id, v_rule, v_reason, v_actor, p_expires_at
  )
  returning * into v_override;

  -- Eligibility exceptions are rule decisions, so use the already-canonical
  -- rule.changed event and keep the more specific action in payload metadata.
  -- This avoids widening or replacing the event-type CHECK constraint here.
  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id,
    'rule.changed',
    v_actor,
    'eligibility_override',
    v_override.id::text,
    jsonb_build_object(
      'changeKind', 'eligibility.override_created',
      'countryId', p_country_id,
      'countryName', v_country_name,
      'affectedRule', v_rule,
      'reason', v_reason,
      'expiresAt', p_expires_at
    )
  );

  return jsonb_build_object(
    'id', v_override.id,
    'editionId', v_override.edition_id,
    'countryId', v_override.country_id,
    'countryName', v_country_name,
    'affectedRule', v_override.affected_rule,
    'reason', v_override.reason,
    'createdBy', v_override.created_by,
    'createdAt', v_override.created_at,
    'expiresAt', v_override.expires_at,
    'revokedAt', v_override.revoked_at,
    'revokedBy', v_override.revoked_by,
    'revocationReason', v_override.revocation_reason
  );
end
$$;

create or replace function public.studio2_revoke_eligibility_override(
  p_override_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_reason text := btrim(coalesce(p_reason, ''));
  v_override public.studio2_eligibility_overrides%rowtype;
  v_country_name text;
begin
  if p_override_id is null then
    raise exception 'Override id is required' using errcode = '22023';
  end if;
  if length(v_reason) < 5 then
    raise exception 'Explain why the eligibility override is being revoked' using errcode = '22023';
  end if;

  select * into v_override
  from public.studio2_eligibility_overrides
  where id = p_override_id
  for update;
  if not found then
    raise exception 'Eligibility override not found' using errcode = 'P0002';
  end if;

  if not v_is_service
     and not private.studio2_can_manage_eligibility(v_actor, v_override.edition_id) then
    raise exception 'Organizer or entry.approve capability required' using errcode = '42501';
  end if;

  select c.name into v_country_name
  from public.countries c
  where c.id = v_override.country_id;

  if v_override.revoked_at is null then
    update public.studio2_eligibility_overrides
    set revoked_at = now(),
        revoked_by = v_actor,
        revocation_reason = v_reason
    where id = p_override_id
    returning * into v_override;

    insert into public.studio2_contest_events (
      edition_id, type, actor_user_id, entity_type, entity_id, payload
    ) values (
      v_override.edition_id,
      'rule.changed',
      v_actor,
      'eligibility_override',
      v_override.id::text,
      jsonb_build_object(
        'changeKind', 'eligibility.override_revoked',
        'countryId', v_override.country_id,
        'countryName', v_country_name,
        'affectedRule', v_override.affected_rule,
        'reason', v_reason
      )
    );
  end if;

  return jsonb_build_object(
    'id', v_override.id,
    'editionId', v_override.edition_id,
    'countryId', v_override.country_id,
    'countryName', v_country_name,
    'affectedRule', v_override.affected_rule,
    'reason', v_override.reason,
    'createdBy', v_override.created_by,
    'createdAt', v_override.created_at,
    'expiresAt', v_override.expires_at,
    'revokedAt', v_override.revoked_at,
    'revokedBy', v_override.revoked_by,
    'revocationReason', v_override.revocation_reason
  );
end
$$;

revoke all on function public.studio2_list_eligibility_overrides(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.studio2_list_eligibility_overrides(uuid, uuid, boolean)
  to authenticated, service_role;

revoke all on function public.studio2_create_eligibility_override(uuid, uuid, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.studio2_create_eligibility_override(uuid, uuid, text, text, timestamptz)
  to authenticated, service_role;

revoke all on function public.studio2_revoke_eligibility_override(uuid, text)
  from public, anon, authenticated;
grant execute on function public.studio2_revoke_eligibility_override(uuid, text)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;