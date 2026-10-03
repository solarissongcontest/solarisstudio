begin;

-- Organisation OS V5: eligibility overrides are R2 exception decisions.
--
-- The factual eligibility signal remains authoritative evidence. This operation
-- only changes the effective decision for one edition/country/rule and therefore
-- requires a preview, optimistic version check and idempotent receipt.

create table if not exists public.studio2_eligibility_override_versions (
  edition_id uuid not null references public.editions(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  affected_rule text not null,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  primary key (edition_id, country_id, affected_rule)
);

alter table public.studio2_eligibility_override_versions enable row level security;
revoke all on table public.studio2_eligibility_override_versions from public, anon, authenticated;
grant all on table public.studio2_eligibility_override_versions to service_role;

create or replace function private.studio2_touch_eligibility_override_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_new_edition uuid;
  v_new_country uuid;
  v_new_rule text;
  v_old_edition uuid;
  v_old_country uuid;
  v_old_rule text;
begin
  if tg_op <> 'DELETE' then
    v_new_edition := new.edition_id;
    v_new_country := new.country_id;
    v_new_rule := new.affected_rule;
  end if;

  if tg_op <> 'INSERT' then
    v_old_edition := old.edition_id;
    v_old_country := old.country_id;
    v_old_rule := old.affected_rule;
  end if;

  if v_new_edition is not null and v_new_country is not null and v_new_rule is not null then
    insert into public.studio2_eligibility_override_versions (
      edition_id,
      country_id,
      affected_rule,
      version,
      updated_at
    )
    values (v_new_edition, v_new_country, v_new_rule, 1, now())
    on conflict (edition_id, country_id, affected_rule) do update
    set version = public.studio2_eligibility_override_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if v_old_edition is not null
     and v_old_country is not null
     and v_old_rule is not null
     and (
       v_new_edition is distinct from v_old_edition
       or v_new_country is distinct from v_old_country
       or v_new_rule is distinct from v_old_rule
     ) then
    insert into public.studio2_eligibility_override_versions (
      edition_id,
      country_id,
      affected_rule,
      version,
      updated_at
    )
    values (v_old_edition, v_old_country, v_old_rule, 1, now())
    on conflict (edition_id, country_id, affected_rule) do update
    set version = public.studio2_eligibility_override_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$touch$;

revoke all on function private.studio2_touch_eligibility_override_version()
  from public, anon, authenticated;

drop trigger if exists studio2_eligibility_override_touch_version
  on public.studio2_eligibility_overrides;
create trigger studio2_eligibility_override_touch_version
after insert or update or delete on public.studio2_eligibility_overrides
for each row execute function private.studio2_touch_eligibility_override_version();

create or replace function public.studio2_eligibility_override_change_preview(
  p_action text,
  p_edition_id uuid,
  p_country_id uuid,
  p_affected_rule text,
  p_override_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $preview$
declare
  v_rule text := lower(btrim(coalesce(p_affected_rule, '')));
  v_version bigint := 0;
  v_country_name text;
  v_active public.studio2_eligibility_overrides%rowtype;
  v_target public.studio2_eligibility_overrides%rowtype;
  v_history_count integer := 0;
begin
  if p_action not in ('create', 'revoke') then
    raise exception 'Invalid eligibility override action' using errcode = '22023';
  end if;
  if p_edition_id is null or p_country_id is null then
    raise exception 'Edition and country are required' using errcode = '22023';
  end if;
  if v_rule !~ '^[a-z0-9][a-z0-9._-]*$' or length(v_rule) > 100 then
    raise exception 'Affected rule must be a stable eligibility rule id' using errcode = '22023';
  end if;
  if not private.studio2_can_manage_eligibility(auth.uid(), p_edition_id) then
    raise exception 'Eligibility-management capability required' using errcode = '42501';
  end if;

  select country.name
  into v_country_name
  from public.countries country
  where country.id = p_country_id;
  if not found then
    raise exception 'Country not found' using errcode = 'P0002';
  end if;

  select coalesce((
    select version_row.version
    from public.studio2_eligibility_override_versions version_row
    where version_row.edition_id = p_edition_id
      and version_row.country_id = p_country_id
      and version_row.affected_rule = v_rule
  ), 0)
  into v_version;

  select *
  into v_active
  from public.studio2_eligibility_overrides override_row
  where override_row.edition_id = p_edition_id
    and override_row.country_id = p_country_id
    and override_row.affected_rule = v_rule
    and override_row.revoked_at is null
    and (override_row.expires_at is null or override_row.expires_at > now())
  order by override_row.created_at desc
  limit 1;

  select count(*)::integer
  into v_history_count
  from public.studio2_eligibility_overrides override_row
  where override_row.edition_id = p_edition_id
    and override_row.country_id = p_country_id
    and override_row.affected_rule = v_rule;

  if p_action = 'revoke' then
    if p_override_id is null then
      raise exception 'Override id is required for revocation' using errcode = '22023';
    end if;

    select *
    into v_target
    from public.studio2_eligibility_overrides override_row
    where override_row.id = p_override_id
      and override_row.edition_id = p_edition_id
      and override_row.country_id = p_country_id
      and override_row.affected_rule = v_rule;

    if not found then
      raise exception 'Eligibility override not found' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'riskClass', 'R2',
    'action', p_action,
    'editionId', p_edition_id,
    'countryId', p_country_id,
    'countryName', v_country_name,
    'affectedRule', v_rule,
    'overrideId', p_override_id,
    'expectedVersion', v_version,
    'activeOverrideId', v_active.id,
    'activeOverrideReason', v_active.reason,
    'activeOverrideExpiresAt', v_active.expires_at,
    'historyCount', v_history_count,
    'alreadyApplied',
      case
        when p_action = 'create' then v_active.id is not null
        else v_target.revoked_at is not null
      end
  );
end
$preview$;

revoke all on function public.studio2_eligibility_override_change_preview(
  text, uuid, uuid, text, uuid
) from public, anon;
grant execute on function public.studio2_eligibility_override_change_preview(
  text, uuid, uuid, text, uuid
) to authenticated, service_role;

create or replace function public.studio2_apply_eligibility_override_change(
  p_action text,
  p_edition_id uuid,
  p_country_id uuid,
  p_affected_rule text,
  p_override_id uuid,
  p_reason text,
  p_expires_at timestamptz,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_rule text := lower(btrim(coalesce(p_affected_rule, '')));
  v_claim jsonb;
  v_operation_id uuid;
  v_current_version bigint := 0;
  v_next_version bigint := 0;
  v_change jsonb;
  v_result jsonb;
begin
  if p_action not in ('create', 'revoke') then
    raise exception 'Invalid eligibility override action' using errcode = '22023';
  end if;
  if p_edition_id is null or p_country_id is null then
    raise exception 'Edition and country are required' using errcode = '22023';
  end if;
  if v_rule !~ '^[a-z0-9][a-z0-9._-]*$' or length(v_rule) > 100 then
    raise exception 'Affected rule must be a stable eligibility rule id' using errcode = '22023';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 0 then
    raise exception 'Operation id and expected eligibility-override version are required'
      using errcode = '22023';
  end if;
  if not private.studio2_can_manage_eligibility(auth.uid(), p_edition_id) then
    raise exception 'Eligibility-management capability required' using errcode = '42501';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'eligibility.override.' || p_action,
    'R2',
    jsonb_build_object(
      'editionId', p_edition_id,
      'countryId', p_country_id,
      'affectedRule', v_rule,
      'overrideId', p_override_id,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    return v_claim -> 'result';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'studio2-eligibility-override:' ||
      p_edition_id::text || ':' ||
      p_country_id::text || ':' ||
      v_rule,
      0
    )
  );

  select coalesce((
    select version_row.version
    from public.studio2_eligibility_override_versions version_row
    where version_row.edition_id = p_edition_id
      and version_row.country_id = p_country_id
      and version_row.affected_rule = v_rule
  ), 0)
  into v_current_version;

  if p_expected_version <> v_current_version then
    raise exception 'Eligibility override state changed since this preview was loaded. Refresh before continuing.'
      using errcode = '40001';
  end if;

  if p_action = 'create' then
    v_change := public.studio2_create_eligibility_override(
      p_edition_id,
      p_country_id,
      v_rule,
      p_reason,
      p_expires_at
    );
  else
    if p_override_id is null then
      raise exception 'Override id is required for revocation' using errcode = '22023';
    end if;
    v_change := public.studio2_revoke_eligibility_override(
      p_override_id,
      p_reason
    );
  end if;

  select coalesce((
    select version_row.version
    from public.studio2_eligibility_override_versions version_row
    where version_row.edition_id = p_edition_id
      and version_row.country_id = p_country_id
      and version_row.affected_rule = v_rule
  ), v_current_version)
  into v_next_version;

  v_result := coalesce(v_change, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'riskClass', 'R2',
    'action', p_action,
    'operationId', v_operation_id,
    'previousVersion', v_current_version,
    'version', v_next_version
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end
$apply$;

revoke all on function public.studio2_apply_eligibility_override_change(
  text, uuid, uuid, text, uuid, text, timestamptz, uuid, text, bigint
) from public, anon;
grant execute on function public.studio2_apply_eligibility_override_change(
  text, uuid, uuid, text, uuid, text, timestamptz, uuid, text, bigint
) to authenticated, service_role;

-- Browser organizers must use the R2 preview/apply flow. Service-role code may
-- retain the primitive functions for trusted maintenance/integration work.
revoke execute on function public.studio2_create_eligibility_override(
  uuid, uuid, text, text, timestamptz
) from authenticated;
revoke execute on function public.studio2_revoke_eligibility_override(
  uuid, text
) from authenticated;

notify pgrst, 'reload schema';

commit;
