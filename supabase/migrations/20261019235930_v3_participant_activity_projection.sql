begin;

-- V3 System / Public P40: recipient-safe participant activity projection.
--
-- Activity is derived from canonical successful S2 operations + S4 completed
-- facts. It is NOT an independently writable activity table and it never exposes
-- raw receipt scope/result data, event payloads, ballot contents or another
-- actor's history.
--
-- One operation may emit several domain facts (for example confirmation.submit
-- can emit both confirmation.submitted and entry.submitted). The projection
-- deliberately selects one user-facing fact per operation so idempotent replay
-- and multi-fact consequences do not manufacture duplicate activity rows.

create or replace function public.v3_my_participant_activity(
  p_before timestamptz default null,
  p_limit integer default 30,
  p_before_operation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $activity$
declare
  v_actor uuid := auth.uid();
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_before timestamptz;
  v_next_operation_id uuid;
begin
  if v_actor is null then
    raise exception 'AUTHENTICATION' using errcode = '42501';
  end if;

  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  if p_before_operation_id is not null and p_before is null then
    raise exception 'VALIDATION' using errcode = '22023';
  end if;

  with safe_event_candidates as materialized (
    select
      event_row.id as event_id,
      event_row.operation_id,
      event_row.event_type,
      event_row.aggregate_type,
      event_row.aggregate_id,
      event_row.aggregate_version,
      event_row.edition_id,
      event_row.show_id,
      event_row.occurred_at,
      receipt.command,
      case event_row.event_type
        -- A participating Confirmation can emit both events from the same
        -- operation. Prefer the more specific Entry fact for the activity row.
        when 'entry.submitted' then 10
        when 'confirmation.submitted' then 20
        when 'televote.ballot_submitted' then 30
        else 1000
      end as display_priority
    from private.v3_domain_events event_row
    join public.studio2_operation_receipts receipt
      on receipt.operation_id = event_row.operation_id
     and receipt.actor_id = v_actor
     and receipt.status = 'succeeded'
    where event_row.actor_id = v_actor
      and (
        (
          event_row.event_type in ('entry.submitted', 'confirmation.submitted')
          and receipt.command = 'confirmation.submit'
        )
        or (
          event_row.event_type = 'televote.ballot_submitted'
          and receipt.command = 'televote.submit'
        )
      )
  ),
  one_fact_per_operation as materialized (
    select ranked.*
    from (
      select
        candidate.*,
        row_number() over (
          partition by candidate.operation_id
          order by
            candidate.display_priority,
            candidate.occurred_at desc,
            candidate.event_id desc
        ) as operation_rank
      from safe_event_candidates candidate
    ) ranked
    where ranked.operation_rank = 1
  ),
  shaped as materialized (
    select
      ('activity:' || fact.operation_id::text) as id,
      fact.operation_id,
      fact.occurred_at,
      case fact.event_type
        when 'televote.ballot_submitted' then 'televote_participation'
        else 'submission'
      end as kind,
      case fact.event_type
        when 'entry.submitted' then 'Entry submitted'
        when 'confirmation.submitted' then 'Participation confirmed'
        when 'televote.ballot_submitted' then 'Televote submitted'
      end as title,
      case fact.event_type
        when 'entry.submitted' then 'Your entry submission was recorded.'
        when 'confirmation.submitted' then 'Your participation confirmation was recorded.'
        when 'televote.ballot_submitted' then 'Your Televote was received.'
      end as description,
      fact.edition_id,
      case
        when edition.id is null then null
        when nullif(btrim(coalesce(edition.name, '')), '') is not null then edition.name
        when edition.edition_number is not null then 'SSC ' || edition.edition_number::text
        else null
      end as edition_label,
      case
        when fact.event_type in ('entry.submitted', 'confirmation.submitted')
          then private.studio2_confirmation_country_id(submission.country)
        else null::uuid
      end as country_id,
      case fact.event_type
        when 'entry.submitted' then '/participate'
        when 'confirmation.submitted' then '/participate'
        when 'televote.ballot_submitted' then '/televoting'
      end as route,
      fact.operation_id as receipt_id,
      fact.event_type as source_event_type,
      case
        when fact.event_type in ('entry.submitted', 'confirmation.submitted')
             and submission.id is null
          then 'unavailable'
        when fact.event_type = 'televote.ballot_submitted'
             and televote_submission.id is null
          then 'unavailable'
        when exists (
          select 1
          from private.v3_domain_events newer
          where newer.actor_id = v_actor
            and newer.event_type = fact.event_type
            and newer.aggregate_type = fact.aggregate_type
            and newer.aggregate_id = fact.aggregate_id
            and (
              newer.aggregate_version > fact.aggregate_version
              or (
                newer.aggregate_version = fact.aggregate_version
                and (newer.occurred_at, newer.id) > (fact.occurred_at, fact.event_id)
              )
            )
        ) then 'superseded'
        else 'current'
      end as reconciliation_state
    from one_fact_per_operation fact
    left join public.editions edition
      on edition.id = fact.edition_id
    left join public.submissions submission
      on fact.event_type in ('entry.submitted', 'confirmation.submitted')
     and submission.id::text = fact.aggregate_id
    left join televoting.vote_submissions televote_submission
      on fact.event_type = 'televote.ballot_submitted'
     and televote_submission.id::text = fact.aggregate_id
  ),
  filtered as materialized (
    select shaped.*
    from shaped
    where p_before is null
       or shaped.occurred_at < p_before
       or (
         shaped.occurred_at = p_before
         and p_before_operation_id is not null
         and shaped.operation_id < p_before_operation_id
       )
  ),
  page_plus_one as materialized (
    select
      filtered.*,
      row_number() over (
        order by filtered.occurred_at desc, filtered.operation_id desc
      ) as page_rank
    from filtered
    order by filtered.occurred_at desc, filtered.operation_id desc
    limit (p_limit + 1)
  )
  select
    coalesce(
      jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', page.id,
          'occurred_at', page.occurred_at,
          'kind', page.kind,
          'title', page.title,
          'description', page.description,
          'edition_id', page.edition_id,
          'edition_label', page.edition_label,
          'country_id', page.country_id,
          'route', page.route,
          'receipt_id', page.receipt_id,
          'source_event_type', page.source_event_type,
          'reconciliation_state', page.reconciliation_state
        ))
        order by page.occurred_at desc, page.operation_id desc
      ) filter (where page.page_rank <= p_limit),
      '[]'::jsonb
    ),
    count(*) > p_limit,
    max(page.occurred_at) filter (where page.page_rank = p_limit),
    max(page.operation_id::text) filter (where page.page_rank = p_limit)::uuid
  into
    v_items,
    v_has_more,
    v_next_before,
    v_next_operation_id
  from page_plus_one page;

  if not v_has_more then
    v_next_before := null;
    v_next_operation_id := null;
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'next_before', v_next_before,
    'next_before_operation_id', v_next_operation_id,
    'generated_at', now()
  ));
end
$activity$;

revoke all on function public.v3_my_participant_activity(timestamptz, integer, uuid)
  from public, anon;
grant execute on function public.v3_my_participant_activity(timestamptz, integer, uuid)
  to authenticated;

comment on function public.v3_my_participant_activity(timestamptz, integer, uuid) is
  'V3 Me activity projection. Caller-scoped to auth.uid(); derives one privacy-safe activity row per canonical participant operation from immutable S2 receipts/S4 facts. The optional operation-id cursor provides deterministic pagination when timestamps tie.';

notify pgrst, 'reload schema';

commit;
