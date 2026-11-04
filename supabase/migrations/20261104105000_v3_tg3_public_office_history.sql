begin;

-- TG3: a public, read-only, cursor-paginated projection over the canonical
-- TG2 office terms and durable people. Never expose login ids or private
-- institutional grants, proxies or unpublished SSC edition numbers.
-- Immutable presentation labels for concluded terms. Historical names must
-- survive user removal, display-name changes and subsequent office renaming.
-- These columns are written by the database, never trusted from an RPC caller.
alter table public.world_office_terms
  add column holder_display_name_snapshot text,
  add column office_title_snapshot text,
  add column represented_country_name_snapshot text;

-- The foundation may have concluded rehearsal records when this is applied
-- to an upgrade stack. Backfill with the best presently available canonical
-- labels rather than inventing earlier names.
update public.world_office_terms term_row
set holder_display_name_snapshot = holder.display_name,
    office_title_snapshot = office.title,
    represented_country_name_snapshot = null
from public.delegation_people holder,
     public.world_organization_offices office
where term_row.status in ('ended', 'removed', 'resigned')
  and holder.id = term_row.holder_person_id
  and office.id = term_row.office_id;

-- Backfill represented countries separately. This avoids linking an unrelated
-- country through a cross join and preserves legitimate null representation.
update public.world_office_terms term_row
set represented_country_name_snapshot = country.name
from public.countries country
where term_row.status in ('ended', 'removed', 'resigned')
  and term_row.represented_country_id = country.id;

create or replace function private.world_capture_closed_office_term_labels()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $snapshot$
declare
  v_capture boolean := false;
begin
  if new.status not in ('ended', 'removed', 'resigned') then
    new.holder_display_name_snapshot := null;
    new.office_title_snapshot := null;
    new.represented_country_name_snapshot := null;
    return new;
  end if;

  if tg_op = 'UPDATE' and old.status in ('ended', 'removed', 'resigned') then
    -- Closed constitutional history is immutable. Account unlinking (for
    -- example, deletion of a login) may still null holder_user_id, but the
    -- canonical person and all political term facts cannot be rewritten.
    -- Formal historical corrections must use an audited correction record,
    -- not silently mutate a concluded term.
    if new.status is distinct from old.status
      or new.office_id is distinct from old.office_id
      or new.holder_person_id is distinct from old.holder_person_id
      or new.represented_country_id is distinct from old.represented_country_id
      or new.start_edition_id is distinct from old.start_edition_id
      or new.end_edition_id is distinct from old.end_edition_id
      or new.started_at is distinct from old.started_at
      or new.scheduled_end_at is distinct from old.scheduled_end_at
      or new.actual_end_at is distinct from old.actual_end_at
      or new.term_kind is distinct from old.term_kind
      or new.predecessor_term_id is distinct from old.predecessor_term_id
      or new.succession_reason is distinct from old.succession_reason then
      raise exception 'WORLD_CLOSED_OFFICE_TERM_IMMUTABLE'
        using errcode = '23514';
    end if;
    -- Do not accept even a privileged direct rewrite of presentation labels.
    new.holder_display_name_snapshot := old.holder_display_name_snapshot;
    new.office_title_snapshot := old.office_title_snapshot;
    new.represented_country_name_snapshot := old.represented_country_name_snapshot;
    return new;
  end if;

  -- INSERT of an already-completed imported term and active-to-closed
  -- transitions both snapshot the current canonical holder/office labels.
  v_capture := true;

  if v_capture then
    select holder.display_name, office.title, country.name
    into new.holder_display_name_snapshot,
         new.office_title_snapshot,
         new.represented_country_name_snapshot
    from public.delegation_people holder
    join public.world_organization_offices office on office.id = new.office_id
    left join public.countries country on country.id = new.represented_country_id
    where holder.id = new.holder_person_id;
  end if;

  if nullif(btrim(new.holder_display_name_snapshot), '') is null
     or nullif(btrim(new.office_title_snapshot), '') is null then
    raise exception 'WORLD_CLOSED_OFFICE_TERM_LABEL_MISSING'
      using errcode = '23514';
  end if;
  return new;
end
$snapshot$;

revoke all on function private.world_capture_closed_office_term_labels()
  from public, anon, authenticated;

create trigger world_office_terms_capture_closed_labels
before insert or update on public.world_office_terms
for each row execute function private.world_capture_closed_office_term_labels();

alter table public.world_office_terms
  add constraint world_closed_office_term_labels_check
  check (
    (status in ('ended','removed','resigned')
      and nullif(btrim(holder_display_name_snapshot), '') is not null
      and nullif(btrim(office_title_snapshot), '') is not null)
    or
    (status not in ('ended','removed','resigned')
      and holder_display_name_snapshot is null
      and office_title_snapshot is null
      and represented_country_name_snapshot is null)
  );

comment on column public.world_office_terms.holder_display_name_snapshot is
  'Frozen public label captured on terminal office-term transition, independent of subsequent profile/name edits.';
comment on column public.world_office_terms.office_title_snapshot is
  'Frozen constitutional office title on terminal transition.';
comment on column public.world_office_terms.represented_country_name_snapshot is
  'Frozen country name on terminal transition, if this officeholder represented a country.';

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
      t.office_title_snapshot as office_title,
      t.holder_display_name_snapshot as holder_name,
      t.represented_country_name_snapshot as represented_country_name,
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
      from (
        select office_row.slug, office_row.title, office_row.display_priority
        from public.world_organization_offices office_row
        where office_row.organization_id = o.id
        order by office_row.display_priority, office_row.title, office_row.slug
        limit 100
      ) office
    ), '[]'::jsonb),
    'officesTruncated', (
      select count(*) > 100
      from public.world_organization_offices office_count
      where office_count.organization_id = o.id
    ),
    'terms', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', p.id,
          'officeId', p.office_id,
          'officeTitle', p.office_title,
          'holderDisplayName', p.holder_name,
          'representedCountryName', p.represented_country_name,
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
