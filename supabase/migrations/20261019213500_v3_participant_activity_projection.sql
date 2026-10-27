begin;

-- Public V3 P40 / Me Activity.
--
-- Activity is a privacy-shaped projection of canonical completed operations.
-- It is not a new writable activity store and it never returns request payloads,
-- vote rankings, ballot contents, audit metadata or private outbox data. Only
-- explicitly safe participant operation families are admitted.
--
-- S13 contract: additive forward fix only. No destructive DDL and no backfill.
select public.v3_register_migration_contract(
  'v3.participant-activity.recipient-projection',
  1,
  'forward_fix_only',
  false,
  null,
  'Recipient-scoped participant activity projection from canonical operations'
);

-- Keep recipient/keyset reads on narrow actor-first indexes instead of sorting
-- an unbounded global receipt or all-show Jury history for every page.
create index if not exists v3_activity_receipt_recipient_cursor_idx
  on public.studio2_operation_receipts (
    actor_id, (coalesce(completed_at, updated_at, created_at)) desc, operation_id desc
  ) where status = 'succeeded'
      and command in ('confirmation.submit','entry.submit','televote.submit');
create index if not exists v3_activity_jury_recipient_cursor_idx
  on private.v3_jury_operations(user_id, accepted_at desc, operation_id desc);

create or replace function public.v3_my_participant_activity(
  p_before timestamptz default null,
  p_limit integer default 30,
  p_before_operation_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $activity$
declare
  v_actor uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50);
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_before timestamptz;
  v_next_operation_id uuid;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_before_operation_id is not null and p_before is null then
    raise exception using errcode = '22023', message = 'INVALID_CURSOR';
  end if;

  with canonical_activity as (
    -- Shared S2 receipts already contain safe operation identity and scope. Do
    -- not project request_fingerprint, raw result payloads, error metadata or
    -- idempotency keys into participant history.
    select
      receipt.operation_id as sort_id,
      receipt.operation_id::text as id,
      coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) as occurred_at,
      receipt.command as source_command,
      nullif(receipt.scope ->> 'editionId', '')::uuid as edition_id,
      null::uuid as country_id,
      receipt.operation_id as receipt_id,
      receipt.result as canonical_result
    from public.studio2_operation_receipts receipt
    where receipt.actor_id = v_actor
      and receipt.status = 'succeeded'
      and receipt.command in (
        'confirmation.submit',
        'entry.submit',
        'televote.submit'
      )

    union all

    -- Jury reliability predates the shared S2 receipt bridge. Its private
    -- operation ledger is canonical and already stores a user-bound safe receipt
    -- identity, so project only that identity/context. Never read jury_votes.
    select
      jury_op.operation_id as sort_id,
      jury_op.operation_id::text as id,
      jury_op.accepted_at as occurred_at,
      'jury.submit'::text as source_command,
      show_row.edition_id,
      jury_op.voter_country_id as country_id,
      jury_op.receipt_id,
      jsonb_build_object('ballotSubmissionId', jury_op.ballot_submission_id) as canonical_result
    from private.v3_jury_operations jury_op
    join public.shows show_row on show_row.id = jury_op.show_id
    where jury_op.user_id = v_actor
  ),
  eligible as (
    select activity.*
    from canonical_activity activity
    where p_before is null
       or (
         p_before_operation_id is null
         and activity.occurred_at < p_before
       )
       or (
         p_before_operation_id is not null
         and (activity.occurred_at, activity.sort_id)
             < (p_before, p_before_operation_id)
       )
    order by activity.occurred_at desc, activity.sort_id desc
    limit v_limit + 1
  ),
  page as (
    select *
    from eligible
    order by occurred_at desc, sort_id desc
    limit v_limit
  ),
  shaped as (
    select
      page.sort_id,
      page.id,
      page.occurred_at,
      page.source_command,
      page.edition_id,
      page.country_id,
      page.receipt_id,
      case page.source_command
        when 'confirmation.submit' then 'submission'
        when 'entry.submit' then 'submission'
        when 'jury.submit' then 'jury_participation'
        when 'televote.submit' then 'televote_participation'
      end as kind,
      case page.source_command
        when 'confirmation.submit' then 'Participation confirmation submitted'
        when 'entry.submit' then 'Entry updated'
        when 'jury.submit' then 'Jury ballot submitted'
        when 'televote.submit' then 'Televote submitted'
      end as title,
      case page.source_command
        when 'confirmation.submit' then 'Your official participation confirmation was recorded.'
        when 'entry.submit' then 'A canonical entry version was recorded.'
        when 'jury.submit' then 'Your official jury participation was recorded.'
        when 'televote.submit' then 'Your televote participation was recorded.'
      end as description,
      case page.source_command
        when 'confirmation.submit' then '/participate'
        when 'entry.submit' then '/participate'
        when 'jury.submit' then '/jury-voting'
        when 'televote.submit' then '/televoting'
      end as route,
      case page.source_command
        when 'confirmation.submit' then 'confirmation.submitted'
        when 'entry.submit' then 'entry.version_changed'
        when 'jury.submit' then 'jury.ballot_submitted'
        when 'televote.submit' then 'televote.ballot_submitted'
      end as source_event_type,
      case
        when page.source_command = 'confirmation.submit' then
          case
            when not exists (
              select 1
              from public.submissions submission
              where submission.id = nullif(page.canonical_result ->> 'submissionId', '')::uuid
            ) then 'unavailable'
            when exists (
              select 1
              from public.submissions submission
              where submission.id = nullif(page.canonical_result ->> 'submissionId', '')::uuid
                and submission.edit_count > coalesce(
                  nullif(page.canonical_result ->> 'editCount', '')::bigint,
                  -1
                )
            ) then 'superseded'
            else 'current'
          end
        when page.source_command = 'entry.submit' then
          case
            when not exists (
              select 1
              from private.v3_entry_versions entry_version
              where entry_version.id = nullif(page.canonical_result ->> 'entryVersionId', '')::uuid
            ) then 'unavailable'
            when exists (
              select 1
              from public.internal_entries internal_entry
              where internal_entry.current_version_id = nullif(
                page.canonical_result ->> 'entryVersionId', ''
              )::uuid
            ) or exists (
              select 1
              from public.national_final_entries nf_entry
              where nf_entry.current_version_id = nullif(
                page.canonical_result ->> 'entryVersionId', ''
              )::uuid
            ) then 'current'
            else 'superseded'
          end
        when page.source_command = 'jury.submit' then
          case
            when not exists (
              select 1
              from public.jury_ballot_submissions ballot
              where ballot.id = nullif(
                page.canonical_result ->> 'ballotSubmissionId', ''
              )::uuid
                and ballot.user_id = v_actor
            ) then 'unavailable'
            when exists (
              select 1
              from public.jury_ballot_submissions ballot
              where ballot.id = nullif(
                page.canonical_result ->> 'ballotSubmissionId', ''
              )::uuid
                and ballot.user_id = v_actor
                and ballot.status in ('invalidated', 'superseded')
            ) then 'superseded'
            else 'current'
          end
        when page.source_command = 'televote.submit' then
          case
            when exists (
              select 1
              from televoting.vote_submissions submission
              where submission.id = nullif(page.canonical_result ->> 'submissionId', '')::uuid
                and not submission.is_historical
            ) then 'current'
            else 'unavailable'
          end
        else 'unavailable'
      end as reconciliation_state
    from page
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', shaped.id,
      'occurred_at', shaped.occurred_at,
      'kind', shaped.kind,
      'title', shaped.title,
      'description', shaped.description,
      'edition_id', shaped.edition_id,
      'edition_label', edition.name,
      'country_id', shaped.country_id,
      'route', shaped.route,
      'receipt_id', shaped.receipt_id,
      'source_event_type', shaped.source_event_type,
      'reconciliation_state', shaped.reconciliation_state
    )
    order by shaped.occurred_at desc, shaped.sort_id desc
  ), '[]'::jsonb)
  into v_items
  from shaped
  left join public.editions edition on edition.id = shaped.edition_id;

  with canonical_activity as (
    select
      receipt.operation_id as sort_id,
      coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) as occurred_at
    from public.studio2_operation_receipts receipt
    where receipt.actor_id = v_actor
      and receipt.status = 'succeeded'
      and receipt.command in ('confirmation.submit', 'entry.submit', 'televote.submit')

    union all

    select jury_op.operation_id as sort_id, jury_op.accepted_at as occurred_at
    from private.v3_jury_operations jury_op
    where jury_op.user_id = v_actor
  ),
  eligible as (
    select activity.*
    from canonical_activity activity
    where p_before is null
       or (
         p_before_operation_id is null
         and activity.occurred_at < p_before
       )
       or (
         p_before_operation_id is not null
         and (activity.occurred_at, activity.sort_id)
             < (p_before, p_before_operation_id)
       )
    order by activity.occurred_at desc, activity.sort_id desc
    limit v_limit + 1
  )
  select count(*) > v_limit
  into v_has_more
  from eligible;

  if jsonb_array_length(v_items) > 0 then
    with canonical_activity as (
      select
        receipt.operation_id as sort_id,
        coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) as occurred_at
      from public.studio2_operation_receipts receipt
      where receipt.actor_id = v_actor
        and receipt.status = 'succeeded'
        and receipt.command in ('confirmation.submit', 'entry.submit', 'televote.submit')

      union all

      select jury_op.operation_id as sort_id, jury_op.accepted_at as occurred_at
      from private.v3_jury_operations jury_op
      where jury_op.user_id = v_actor
    ),
    eligible as (
      select activity.*
      from canonical_activity activity
      where p_before is null
         or (
           p_before_operation_id is null
           and activity.occurred_at < p_before
         )
         or (
           p_before_operation_id is not null
           and (activity.occurred_at, activity.sort_id)
               < (p_before, p_before_operation_id)
         )
      order by activity.occurred_at desc, activity.sort_id desc
      limit v_limit
    )
    select eligible.occurred_at, eligible.sort_id
    into v_next_before, v_next_operation_id
    from eligible
    order by eligible.occurred_at asc, eligible.sort_id asc
    limit 1;
  end if;

  return jsonb_build_object(
    'items', v_items,
    'next_before', case when v_has_more then v_next_before else null end,
    'next_operation_id', case when v_has_more then v_next_operation_id else null end,
    'generated_at', now()
  );
exception
  when invalid_text_representation then
    -- Canonical receipts are expected to contain valid UUID/version provenance.
    -- A malformed internal row fails closed rather than being partially exposed.
    raise exception using errcode = 'P0001', message = 'DATABASE';
end
$activity$;

comment on function public.v3_my_participant_activity(timestamptz, integer, uuid)
is 'Recipient-only Public V3 activity projection from allowlisted canonical participant operations. Never exposes request payloads or vote/ballot contents.';

revoke all on function public.v3_my_participant_activity(timestamptz, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.v3_my_participant_activity(timestamptz, integer, uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
