begin;

-- Public V3 P40 / System contract #605: recipient-scoped participant activity.
--
-- This is a projection only. It does not create an editable activity store and
-- it never exposes the private event/outbox tables or raw operation payloads to
-- browser roles. Current V3 participant facts come from the immutable S4 event
-- ledger plus their actor-linked S2 operation receipts. Jury submission history
-- predates the shared S2/S4 participant bridge, so its participation-only row is
-- derived from the canonical jury_ballot_submissions record. Ballot contents are
-- intentionally never selected.

create index if not exists v3_domain_events_actor_time_idx
  on private.v3_domain_events (actor_id, occurred_at desc, id desc)
  where actor_id is not null;

drop function if exists public.v3_my_participant_activity(timestamptz, integer);
drop function if exists public.v3_my_participant_activity(text, integer);

create or replace function public.v3_my_participant_activity(
  p_before text default null,
  p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $activity$
declare
  v_actor uuid := auth.uid();
  v_limit integer := coalesce(p_limit, 30);
  v_cursor jsonb;
  v_cursor_at timestamptz;
  v_cursor_id text;
  v_result jsonb;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  if v_limit < 1 or v_limit > 50 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  -- Opaque keyset cursor. A timestamp-only cursor cannot page deterministically
  -- when two immutable facts share the same timestamp, so the public contract
  -- carries both the canonical time and stable projection id in one string.
  if nullif(btrim(coalesce(p_before, '')), '') is not null then
    begin
      v_cursor := p_before::jsonb;
      if jsonb_typeof(v_cursor) <> 'object'
         or nullif(v_cursor ->> 'at', '') is null
         or nullif(v_cursor ->> 'id', '') is null then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
      v_cursor_at := (v_cursor ->> 'at')::timestamptz;
      v_cursor_id := v_cursor ->> 'id';
      if length(v_cursor_id) > 320 then
        raise exception using errcode = '22023', message = 'VALIDATION';
      end if;
    exception
      when invalid_text_representation or invalid_datetime_format then
        raise exception using errcode = '22023', message = 'VALIDATION';
    end;
  end if;

  with event_source as (
    select
      event_row.id as event_id,
      event_row.event_type,
      event_row.aggregate_type,
      event_row.aggregate_id,
      event_row.aggregate_version,
      event_row.edition_id,
      event_row.show_id,
      event_row.occurred_at,
      receipt.operation_id,
      receipt.command,
      receipt.scope,
      case
        when event_row.event_type = 'confirmation.submitted'
          then 'confirmation:' || event_row.aggregate_id
        when event_row.event_type = 'entry.submitted'
          then 'entry-submission:' || event_row.aggregate_id
        when event_row.event_type = 'televote.ballot_submitted'
          then 'televote:' || coalesce(nullif(receipt.scope ->> 'roundId', ''), event_row.aggregate_id)
        else event_row.event_type || ':' || event_row.aggregate_type || ':' || event_row.aggregate_id
      end as semantic_key
    from private.v3_domain_events event_row
    join public.studio2_operation_receipts receipt
      on receipt.operation_id = event_row.operation_id
     and receipt.actor_id = v_actor
     and receipt.status = 'succeeded'
    where event_row.actor_id = v_actor
      and (
        (event_row.event_type = 'confirmation.submitted' and receipt.command = 'confirmation.submit')
        or (event_row.event_type = 'entry.submitted' and receipt.command = 'confirmation.submit')
        or (event_row.event_type = 'televote.ballot_submitted' and receipt.command = 'televote.submit')
      )
  ),
  event_ranked as (
    select
      source_row.*,
      row_number() over (
        partition by source_row.semantic_key
        order by source_row.occurred_at desc, source_row.event_id desc
      ) as semantic_rank
    from event_source source_row
  ),
  event_items as (
    select
      'event:' || ranked.event_id::text as id,
      ranked.occurred_at,
      case ranked.event_type
        when 'televote.ballot_submitted' then 'televote_participation'
        else 'submission'
      end as kind,
      case ranked.event_type
        when 'confirmation.submitted' then 'Participation confirmation submitted'
        when 'entry.submitted' then 'Entry submitted'
        when 'televote.ballot_submitted' then 'Televote received'
        else 'Solaris activity'
      end as title,
      show_row.name::text as description,
      ranked.edition_id,
      edition_row.name::text as edition_label,
      null::uuid as country_id,
      null::text as route,
      ranked.operation_id::text as receipt_id,
      ranked.event_type as source_event_type,
      case
        when ranked.semantic_rank > 1 then 'superseded'
        when ranked.edition_id is not null and edition_row.id is null then 'unavailable'
        when ranked.show_id is not null and show_row.id is null then 'unavailable'
        else 'current'
      end as reconciliation_state
    from event_ranked ranked
    left join public.editions edition_row on edition_row.id = ranked.edition_id
    left join public.shows show_row on show_row.id = ranked.show_id
  ),
  -- A succeeded participant receipt remains canonical evidence even if it
  -- predates S5 event emission. This fallback exposes only allowlisted command
  -- identity/context and never request/result/error metadata.
  receipt_source as (
    select
      receipt.operation_id,
      receipt.command,
      receipt.created_at,
      coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) as occurred_at,
      receipt.scope,
      edition_row.id as edition_id,
      edition_row.name::text as edition_label,
      show_row.name::text as show_label,
      row_number() over (
        partition by receipt.command, coalesce(nullif(receipt.scope ->> 'roundId', ''), receipt.operation_id::text)
        order by coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) desc,
                 receipt.operation_id desc
      ) as semantic_rank
    from public.studio2_operation_receipts receipt
    left join public.editions edition_row
      on edition_row.id::text = nullif(receipt.scope ->> 'editionId', '')
    left join public.shows show_row
      on show_row.id::text = nullif(receipt.scope ->> 'showId', '')
    where receipt.actor_id = v_actor
      and receipt.status = 'succeeded'
      and receipt.command in ('confirmation.submit', 'televote.submit')
      and not exists (
        select 1
        from private.v3_domain_events event_row
        where event_row.operation_id = receipt.operation_id
          and event_row.actor_id = v_actor
          and event_row.event_type in (
            'confirmation.submitted',
            'entry.submitted',
            'televote.ballot_submitted'
          )
      )
  ),
  receipt_items as (
    select
      'receipt:' || source_row.operation_id::text as id,
      source_row.occurred_at,
      'receipt'::text as kind,
      case source_row.command
        when 'confirmation.submit' then 'Participation confirmation submitted'
        when 'televote.submit' then 'Televote received'
        else 'Solaris operation completed'
      end as title,
      source_row.show_label as description,
      source_row.edition_id,
      source_row.edition_label,
      null::uuid as country_id,
      null::text as route,
      source_row.operation_id::text as receipt_id,
      'operation.receipt'::text as source_event_type,
      case when source_row.semantic_rank > 1 then 'superseded' else 'current' end as reconciliation_state
    from receipt_source source_row
  ),
  jury_source as (
    select
      ballot.id,
      ballot.edition_id,
      ballot.show_id,
      ballot.voter_country_id,
      ballot.status,
      ballot.submitted_at,
      edition_row.name::text as edition_label,
      show_row.name::text as show_label,
      row_number() over (
        partition by ballot.show_id, ballot.user_id
        order by ballot.submitted_at desc, ballot.id desc
      ) as semantic_rank
    from public.jury_ballot_submissions ballot
    left join public.editions edition_row on edition_row.id = ballot.edition_id
    left join public.shows show_row on show_row.id = ballot.show_id
    where ballot.user_id = v_actor
  ),
  jury_items as (
    select
      'jury:' || source_row.id::text as id,
      source_row.submitted_at as occurred_at,
      'jury_participation'::text as kind,
      'Jury ballot submitted'::text as title,
      source_row.show_label as description,
      source_row.edition_id,
      source_row.edition_label,
      source_row.voter_country_id as country_id,
      null::text as route,
      null::text as receipt_id,
      'jury.ballot_submission'::text as source_event_type,
      case
        when source_row.semantic_rank > 1 or source_row.status = 'superseded' then 'superseded'
        when source_row.status = 'excluded' then 'unavailable'
        else 'current'
      end as reconciliation_state
    from jury_source source_row
  ),
  all_items as (
    select * from event_items
    union all
    select * from receipt_items
    union all
    select * from jury_items
  ),
  cursor_filtered as (
    select item.*
    from all_items item
    where v_cursor_at is null
       or item.occurred_at < v_cursor_at
       or (item.occurred_at = v_cursor_at and item.id < v_cursor_id)
  ),
  ordered as (
    select item.*
    from cursor_filtered item
    order by item.occurred_at desc, item.id desc
    limit v_limit + 1
  ),
  page as (
    select item.*
    from ordered item
    order by item.occurred_at desc, item.id desc
    limit v_limit
  ),
  page_json as (
    select coalesce(
      jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', item.id,
          'occurred_at', item.occurred_at,
          'kind', item.kind,
          'title', item.title,
          'description', item.description,
          'edition_id', item.edition_id,
          'edition_label', item.edition_label,
          'country_id', item.country_id,
          'route', item.route,
          'receipt_id', item.receipt_id,
          'source_event_type', item.source_event_type,
          'reconciliation_state', item.reconciliation_state
        ))
        order by item.occurred_at desc, item.id desc
      ),
      '[]'::jsonb
    ) as items
    from page item
  ),
  last_page_item as (
    select item.id, item.occurred_at
    from page item
    order by item.occurred_at asc, item.id asc
    limit 1
  )
  select jsonb_build_object(
    'schema_ready', true,
    'items', page_json.items,
    'next_before', case
      when (select count(*) from ordered) > v_limit then (
        select jsonb_build_object(
          'at', last_page_item.occurred_at,
          'id', last_page_item.id
        )::text
        from last_page_item
      )
      else null
    end,
    'generated_at', now()
  )
  into v_result
  from page_json;

  return coalesce(
    v_result,
    jsonb_build_object(
      'schema_ready', true,
      'items', '[]'::jsonb,
      'next_before', null,
      'generated_at', now()
    )
  );
end
$activity$;

comment on function public.v3_my_participant_activity(text, integer) is
  'Authenticated recipient-scoped Public V3 P40 activity projection over canonical participant facts; exposes no ballot contents, raw event payloads, operation payloads, or other actors.';

revoke all on function public.v3_my_participant_activity(text, integer)
  from public, anon;
grant execute on function public.v3_my_participant_activity(text, integer)
  to authenticated;

commit;
