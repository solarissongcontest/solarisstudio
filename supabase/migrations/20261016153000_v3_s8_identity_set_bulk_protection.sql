begin;

-- System V3 S8: bound user-supplied identity arrays by the authoritative data
-- universe they can legitimately address. These are data-derived limits, not
-- invented product thresholds.

create or replace function private.studio2_validate_notice_surfaces(
  p_display_surfaces text[]
)
returns text[]
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $surfaces$
declare
  v_surfaces text[];
begin
  -- There are exactly three canonical communication destinations. Reject a raw
  -- array larger than the complete valid universe before UNNEST/DISTINCT work.
  if cardinality(coalesce(p_display_surfaces, '{}'::text[])) > 3 then
    raise exception 'Too many communication destinations' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct surface order by surface), '{}'::text[])
    into v_surfaces
  from unnest(coalesce(p_display_surfaces, '{}'::text[])) surface;

  if cardinality(v_surfaces) = 0 then
    raise exception 'Choose at least one communication destination' using errcode = '22023';
  end if;

  if not v_surfaces <@ array['delegation_inbox', 'mysolaris_home', 'public_home']::text[] then
    raise exception 'Unknown communication destination' using errcode = '22023';
  end if;

  return v_surfaces;
end
$surfaces$;

create or replace function private.studio2_validate_notice_target(
  p_edition_id uuid,
  p_audience text,
  p_audience_group text,
  p_country_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $target$
declare
  v_country_count integer;
  v_requested_count integer := cardinality(coalesce(p_country_ids, '{}'::uuid[]));
begin
  if p_audience not in (
    'all_delegations', 'participating_countries', 'specific_countries',
    'jurors', 'hods', 'organizers', 'edition_group', 'staff', 'press'
  ) then
    raise exception 'Unknown notice audience: %', p_audience using errcode = '22023';
  end if;

  if p_audience = 'specific_countries' and v_requested_count = 0 then
    raise exception 'Specific-country notices require at least one country' using errcode = '22023';
  end if;
  if p_audience <> 'specific_countries' and v_requested_count > 0 then
    raise exception 'Country ids are only valid for specific-country notices' using errcode = '22023';
  end if;

  if p_audience = 'specific_countries' then
    select count(*)::integer into v_country_count from public.countries;
    if v_requested_count > v_country_count then
      raise exception 'Specific-country audience exceeds the canonical country universe'
        using errcode = '22023';
    end if;
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
$target$;

create or replace function public.admin_confirmation_ensure_requirements(
  p_edition_id uuid,
  p_country_ids uuid[] default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $ensure$
declare
  v_inserted integer := 0;
  v_country_count integer;
  v_requested_count integer := cardinality(coalesce(p_country_ids, '{}'::uuid[]));
begin
  if not private.solaris_confirmation_admin_allowed() then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  if p_edition_id is null
     or not exists (select 1 from public.editions edition where edition.id = p_edition_id) then
    raise exception 'Valid edition id is required' using errcode = '22023';
  end if;

  if p_country_ids is not null then
    select count(*)::integer into v_country_count from public.countries;
    if v_requested_count > v_country_count then
      raise exception 'Confirmation requirement batch exceeds the canonical country universe'
        using errcode = '22023';
    end if;
  end if;

  -- Serialize one edition's requirement materialization/reconciliation wave so
  -- concurrent operators cannot duplicate expensive work or race not-exists
  -- checks. The existing requirement invariants remain the canonical backstop.
  perform pg_advisory_xact_lock(
    hashtextextended('studio2-confirmation-requirements:' || p_edition_id::text, 0)
  );

  with target_countries as (
    select distinct account.country_id
    from public.country_accounts account
    where account.status = 'active'
      and (p_country_ids is null or account.country_id = any(p_country_ids))
    union
    select unnest(coalesce(p_country_ids, '{}'::uuid[]))
  ),
  inserted as (
    insert into public.studio2_confirmation_requirements (
      edition_id,
      country_id,
      generation,
      status,
      reason,
      valid_from,
      created_by
    )
    select
      p_edition_id,
      target.country_id,
      1,
      'required',
      'Edition confirmation required by TSBC',
      now(),
      auth.uid()
    from target_countries target
    where target.country_id is not null
      and exists (
        select 1 from public.countries country where country.id = target.country_id
      )
      and not exists (
        select 1
        from public.studio2_confirmation_requirements requirement
        where requirement.edition_id = p_edition_id
          and requirement.country_id = target.country_id
          and requirement.superseded_at is null
      )
    returning id
  )
  select count(*)::integer into v_inserted from inserted;

  perform private.studio2_reconcile_confirmation_requirement(
    p_edition_id,
    target.country_id
  )
  from (
    select distinct account.country_id
    from public.country_accounts account
    where account.status = 'active'
      and (p_country_ids is null or account.country_id = any(p_country_ids))
    union
    select unnest(coalesce(p_country_ids, '{}'::uuid[]))
  ) target
  where target.country_id is not null
    and exists (select 1 from public.countries country where country.id = target.country_id);

  return jsonb_build_object(
    'ok', true,
    'editionId', p_edition_id,
    'created', v_inserted
  );
end
$ensure$;

revoke all on function public.admin_confirmation_ensure_requirements(uuid, uuid[])
  from public, anon;
grant execute on function public.admin_confirmation_ensure_requirements(uuid, uuid[])
  to authenticated, service_role;

commit;
