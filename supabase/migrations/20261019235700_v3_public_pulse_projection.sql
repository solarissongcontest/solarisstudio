begin;

-- Public V3 P20 / System #991.
--
-- The public app must see the same published Pulse feed whether the caller is
-- anonymous, an ordinary authenticated fan, or an authenticated account that
-- also has Organizer publishing capabilities. The legacy content_events RLS
-- intentionally gives privileged publishing callers a wider operational view,
-- so public-side Pulse must not read that table directly.
select public.v3_register_migration_contract(
  '20261019235700_v3_public_pulse_projection',
  1,
  'forward_fix_only',
  false,
  null,
  'Add caller-invariant, server-time publication-safe Pulse event projection with bounded stable pagination'
);

create or replace function public.v3_public_pulse_events(
  p_limit integer default 30,
  p_before_published_at timestamptz default null,
  p_before_id uuid default null,
  p_category text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_limit integer := coalesce(p_limit, 30);
  v_category text := nullif(lower(trim(coalesce(p_category, ''))), '');
  v_items jsonb := '[]'::jsonb;
  v_next_cursor jsonb := null;
  v_has_more boolean := false;
begin
  if v_limit < 1 or v_limit > 50 then
    raise exception 'Pulse limit must be between 1 and 50' using errcode = '22023';
  end if;

  if (p_before_published_at is null) <> (p_before_id is null) then
    raise exception 'Pulse cursor timestamp and id must be supplied together' using errcode = '22023';
  end if;

  if v_category is not null
     and v_category not in ('entries', 'running_orders', 'predictions', 'results', 'records') then
    raise exception 'Unsupported Pulse category' using errcode = '22023';
  end if;

  with eligible as (
    select
      event.id,
      event.event_type,
      event.entity_type,
      event.entity_id,
      event.title,
      event.summary,
      case
        when left(event.route, 1) = '/'
         and left(event.route, 2) <> '//'
         and position(E'\\' in event.route) = 0
         and event.route !~ '[[:cntrl:]]'
        then event.route
        else null
      end as route,
      event.importance,
      jsonb_strip_nulls(jsonb_build_object(
        'countryId', event.payload -> 'countryId',
        'country_id', event.payload -> 'country_id',
        'countryIds', event.payload -> 'countryIds',
        'country_ids', event.payload -> 'country_ids',
        'contestEntityId', event.payload -> 'contestEntityId',
        'contest_entity_id', event.payload -> 'contest_entity_id',
        'contestEntityIds', event.payload -> 'contestEntityIds',
        'contest_entity_ids', event.payload -> 'contest_entity_ids',
        'editionId', event.payload -> 'editionId',
        'edition_id', event.payload -> 'edition_id',
        'editionNumber', event.payload -> 'editionNumber',
        'editionSlug', event.payload -> 'editionSlug',
        'showId', event.payload -> 'showId',
        'show_id', event.payload -> 'show_id',
        'roundId', event.payload -> 'roundId',
        'locksAt', event.payload -> 'locksAt',
        'nationalFinalId', event.payload -> 'nationalFinalId',
        'nationalFinalName', event.payload -> 'nationalFinalName',
        'acceptedEntryCount', event.payload -> 'acceptedEntryCount',
        'winningEntryId', event.payload -> 'winningEntryId'
      )) as payload,
      event.published_at
    from public.content_events event
    where event.published_at <= now()
      and (
        p_before_published_at is null
        or event.published_at < p_before_published_at
        or (event.published_at = p_before_published_at and event.id < p_before_id)
      )
      and (
        v_category is null
        or case
          when event.event_type = 'entry_published' then 'entries'
          when event.event_type = 'running_order_published' then 'running_orders'
          when event.event_type ~ '^prediction_' then 'predictions'
          when event.event_type = 'results_published' then 'results'
          when event.event_type in ('record_broken', 'record_threat') then 'records'
          else null
        end = v_category
      )
    order by event.published_at desc, event.id desc
    limit v_limit + 1
  ), numbered as (
    select eligible.*, row_number() over (order by published_at desc, id desc) as row_number
    from eligible
  ), page as (
    select * from numbered where row_number <= v_limit
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', page.id,
          'eventType', page.event_type,
          'entityType', page.entity_type,
          'entityId', page.entity_id,
          'title', page.title,
          'summary', page.summary,
          'route', page.route,
          'importance', page.importance,
          'payload', page.payload,
          'publishedAt', page.published_at
        )
        order by page.published_at desc, page.id desc
      ),
      '[]'::jsonb
    ),
    exists(select 1 from numbered where row_number > v_limit)
  into v_items, v_has_more
  from page;

  if v_has_more and jsonb_array_length(v_items) > 0 then
    select jsonb_build_object(
      'publishedAt', item ->> 'publishedAt',
      'id', item ->> 'id'
    )
    into v_next_cursor
    from jsonb_array_elements(v_items) with ordinality as rows(item, position)
    order by rows.position desc
    limit 1;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'nextCursor', v_next_cursor,
    'serverTime', now()
  );
end;
$function$;

revoke all on function public.v3_public_pulse_events(integer, timestamptz, uuid, text)
  from public;
grant execute on function public.v3_public_pulse_events(integer, timestamptz, uuid, text)
  to anon, authenticated;

notify pgrst, 'reload schema';

commit;
