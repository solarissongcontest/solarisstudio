begin;

-- Public V3 P40 / Me Activity.
--
-- Activity is a privacy-shaped projection of canonical completed operations.
-- It is not a new writable activity store and it never returns request payloads,
-- ballot contents, audit metadata or private outbox data. Only explicitly safe
-- participant command families are admitted.
--
-- S13 contract: additive forward fix only. No destructive DDL and no backfill.
select public.v3_register_migration_contract(
  '20261019213500_v3_participant_activity_projection',
  1,
  'forward_fix_only',
  false,
  null,
  'Recipient-scoped participant activity projection from canonical receipts'
);

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

  with safe_receipts as (
    select
      receipt.operation_id,
      receipt.command,
      receipt.scope,
      receipt.result,
      coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) as occurred_at
    from public.studio2_operation_receipts receipt
    where receipt.actor_id = v_actor
      and receipt.status = 'succeeded'
      and receipt.command in (
        'confirmation.submit',
        'entry.submit',
        'televote.submit'
      )
      and (
        p_before is null
        or (
          p_before_operation_id is null
          and coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) < p_before
        )
        or (
          p_before_operation_id is not null
          and (
            coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at),
            receipt.operation_id
          ) < (p_before, p_before_operation_id)
        )
      )
    order by
      coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) desc,
      receipt.operation_id desc
    limit v_limit + 1
  ),
  page as (
    select *
    from safe_receipts
    order by occurred_at desc, operation_id desc
    limit v_limit
  ),
  shaped as (
    select
      page.operation_id,
      page.occurred_at,
      page.command,
      nullif(page.scope ->> 'editionId', '')::uuid as edition_id,
      case page.command
        when 'confirmation.submit' then 'submission'
        when 'entry.submit' then 'submission'
        when 'televote.submit' then 'televote_participation'
      end as kind,
      case page.command
        when 'confirmation.submit' then 'Participation confirmation submitted'
        when 'entry.submit' then 'Entry updated'
        when 'televote.submit' then 'Televote submitted'
      end as title,
      case page.command
        when 'confirmation.submit' then 'Your official participation confirmation was recorded.'
        when 'entry.submit' then 'A canonical entry version was recorded.'
        when 'televote.submit' then 'Your televote participation was recorded.'
      end as description,
      case page.command
        when 'confirmation.submit' then '/participate'
        when 'entry.submit' then '/participate'
        when 'televote.submit' then '/televoting'
      end as route,
      case page.command
        when 'confirmation.submit' then 'confirmation.submitted'
        when 'entry.submit' then 'entry.version_changed'
        when 'televote.submit' then 'televote.ballot_submitted'
      end as source_event_type,
      case
        when page.command = 'confirmation.submit' then
          case
            when not exists (
              select 1
              from public.submissions submission
              where submission.id = nullif(page.result ->> 'submissionId', '')::uuid
            ) then 'unavailable'
            when exists (
              select 1
              from public.submissions submission
              where submission.id = nullif(page.result ->> 'submissionId', '')::uuid
                and submission.edit_count > coalesce(nullif(page.result ->> 'editCount', '')::bigint, -1)
            ) then 'superseded'
            else 'current'
          end
        when page.command = 'entry.submit' then
          case
            when not exists (
              select 1
              from private.v3_entry_versions entry_version
              where entry_version.id = nullif(page.result ->> 'entryVersionId', '')::uuid
            ) then 'unavailable'
            when exists (
              select 1
              from public.internal_entries internal_entry
              where internal_entry.current_version_id = nullif(page.result ->> 'entryVersionId', '')::uuid
              union all
              select 1
              from public.national_final_entries nf_entry
              where nf_entry.current_version_id = nullif(page.result ->> 'entryVersionId', '')::uuid
            ) then 'current'
            else 'superseded'
          end
        when page.command = 'televote.submit' then
          case
            when exists (
              select 1
              from televoting.vote_submissions submission
              where submission.id = nullif(page.result ->> 'submissionId', '')::uuid
                and not submission.is_historical
            ) then 'current'
            else 'unavailable'
          end
        else 'unavailable'
      end as reconciliation_state
    from page
  )
  select coalesce(jsonb_agg(
    jsonb_strip_nulls(jsonb_build_object(
      'id', shaped.operation_id,
      'occurred_at', shaped.occurred_at,
      'kind', shaped.kind,
      'title', shaped.title,
      'description', shaped.description,
      'edition_id', shaped.edition_id,
      'edition_label', edition.name,
      'country_id', null,
      'route', shaped.route,
      'receipt_id', shaped.operation_id,
      'source_event_type', shaped.source_event_type,
      'reconciliation_state', shaped.reconciliation_state
    ))
    order by shaped.occurred_at desc, shaped.operation_id desc
  ), '[]'::jsonb)
  into v_items
  from shaped
  left join public.editions edition on edition.id = shaped.edition_id;

  with safe_receipts as (
    select
      receipt.operation_id,
      coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) as occurred_at
    from public.studio2_operation_receipts receipt
    where receipt.actor_id = v_actor
      and receipt.status = 'succeeded'
      and receipt.command in ('confirmation.submit', 'entry.submit', 'televote.submit')
      and (
        p_before is null
        or (
          p_before_operation_id is null
          and coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) < p_before
        )
        or (
          p_before_operation_id is not null
          and (
            coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at),
            receipt.operation_id
          ) < (p_before, p_before_operation_id)
        )
      )
    order by occurred_at desc, receipt.operation_id desc
    limit v_limit + 1
  )
  select count(*) > v_limit
  into v_has_more
  from safe_receipts;

  if jsonb_array_length(v_items) > 0 then
    with safe_receipts as (
      select
        receipt.operation_id,
        coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) as occurred_at
      from public.studio2_operation_receipts receipt
      where receipt.actor_id = v_actor
        and receipt.status = 'succeeded'
        and receipt.command in ('confirmation.submit', 'entry.submit', 'televote.submit')
        and (
          p_before is null
          or (
            p_before_operation_id is null
            and coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at) < p_before
          )
          or (
            p_before_operation_id is not null
            and (
              coalesce(receipt.completed_at, receipt.updated_at, receipt.created_at),
              receipt.operation_id
            ) < (p_before, p_before_operation_id)
          )
        )
      order by occurred_at desc, receipt.operation_id desc
      limit v_limit
    )
    select safe_receipts.occurred_at, safe_receipts.operation_id
    into v_next_before, v_next_operation_id
    from safe_receipts
    order by safe_receipts.occurred_at asc, safe_receipts.operation_id asc
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
    raise exception using errcode = 'P0001', message = 'DATABASE';
end
$activity$;

comment on function public.v3_my_participant_activity(timestamptz, integer, uuid)
is 'Recipient-only Public V3 activity projection from allowlisted successful canonical participant receipts. Never exposes request payloads or ballot contents.';

revoke all on function public.v3_my_participant_activity(timestamptz, integer, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.v3_my_participant_activity(timestamptz, integer, uuid)
  to authenticated;

notify pgrst, 'reload schema';

commit;
