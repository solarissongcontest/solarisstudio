begin;

-- TG3: a public, read-only, cursor-paginated projection over the canonical
-- TG2 office terms and durable people. Never expose login ids or private
-- institutional grants, proxies or unpublished SSC edition numbers.
create index if not exists world_office_terms_completed_history_idx
  on public.world_office_terms(office_id, started_at desc, id desc)
  where status in ('ended', 'removed', 'resigned')
    and actual_end_at is not null;

create or replace function public.world_public_office_history_v1(
  p_slug text,
  p_cursor_started_at timestamptz default null,
  p_cursor_term_id uuid default null,
  p_office_slug text default null,
  p_limit integer default 12
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $history$
declare
  v_result jsonb;
begin
  if p_limit is null or p_limit < 1 or p_limit > 20
      or (p_cursor_started_at is null) <> (p_cursor_term_id is null)
      or (p_office_slug is not null and (
        length(btrim(p_office_slug)) > 80
        or btrim(p_office_slug) !~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$'
      )) then
    raise exception 'WORLD_HISTORY_PAGE_OUT_OF_RANGE' using errcode = '22023';
  end if;

  if p_slug is null
     or length(btrim(p_slug)) > 80
     or btrim(p_slug) !~ '^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$' then
    return null;
  end if;

  with organization as (
    select o.id, o.slug, o.short_name, o.official_name
    from public.world_organizations o
    where o.slug = lower(btrim(p_slug))
      and o.public_visibility = 'public'
  ),
  page as (
    select
      t.id,
      office.id as office_id,
      office.title as office_title,
      holder.display_name as holder_name,
      t.term_kind,
      t.status,
      t.started_at,
      t.scheduled_end_at,
      t.actual_end_at,
      case when start_edition.published is true then start_edition.edition_number else null end as start_edition,
      case when end_edition.published is true then end_edition.edition_number else null end as end_edition
    from public.world_office_terms t
    join public.world_organization_offices office on office.id = t.office_id
    join organization o on o.id = office.organization_id
    join public.delegation_people holder on holder.id = t.holder_person_id
    left join public.editions start_edition on start_edition.id = t.start_edition_id
    left join public.editions end_edition on end_edition.id = t.end_edition_id
    where t.status in ('ended', 'removed', 'resigned')
      and t.actual_end_at is not null
      and (p_office_slug is null or office.slug = lower(btrim(p_office_slug)))
      and (
        p_cursor_started_at is null
        or (t.started_at, t.id) < (p_cursor_started_at, p_cursor_term_id)
      )
    order by t.started_at desc, t.id desc
    limit p_limit + 1
  ),
  numbered as (
    select page.*,
      row_number() over (order by page.started_at desc, page.id desc) as page_number
    from page
  )
  select pg_catalog.jsonb_build_object(
    'organization', pg_catalog.jsonb_build_object(
      'slug', o.slug,
      'shortName', o.short_name,
      'officialName', o.official_name
    ),
    'offices', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'slug', office.slug,
          'title', office.title
        ) order by office.display_priority, office.title, office.slug
      )
      from public.world_organization_offices office
      where office.organization_id = o.id
    ), '[]'::jsonb),
    'terms', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', p.id,
          'officeId', p.office_id,
          'officeTitle', p.office_title,
          'holderDisplayName', p.holder_name,
          'termKind', p.term_kind,
          'status', p.status,
          'startedAt', p.started_at,
          'scheduledEndAt', p.scheduled_end_at,
          'actualEndAt', p.actual_end_at,
          'startEditionNumber', p.start_edition,
          'endEditionNumber', p.end_edition
        ) order by p.page_number
      )
      from numbered p
      where p.page_number <= p_limit
    ), '[]'::jsonb),
    'hasMore', exists(select 1 from numbered p where p.page_number > p_limit),
    'nextCursor', (
      select pg_catalog.jsonb_build_object(
        'startedAt', p.started_at,
        'termId', p.id
      )
      from numbered p
      where p.page_number = p_limit
        and exists(select 1 from numbered extra where extra.page_number > p_limit)
    )
  )
  into v_result
  from organization o;

  -- Missing and non-public institutions are indistinguishable.
  return v_result;
end
$history$;

revoke all on function public.world_public_office_history_v1(text,timestamptz,uuid,text,integer)
  from public, anon, authenticated;
grant execute on function public.world_public_office_history_v1(text,timestamptz,uuid,text,integer)
  to anon, authenticated, service_role;

comment on function public.world_public_office_history_v1(text,timestamptz,uuid,text,integer) is
  'Public concluded institutional office terms: stable keyset paging, validated office filter, publication-checked SSC labels and no account IDs.';

do $contract$
begin
  if to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is not null then
    perform public.v3_register_migration_contract(
      'v3.tg3.public-office-history',
      1,
      'forward_fix_only',
      false,
      null,
      'Bounded public office history over canonical concluded terms, with deterministic keyset paging, office filters and no account identifiers.'
    );
  end if;
end
$contract$;

notify pgrst, 'reload schema';
commit;
