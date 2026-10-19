begin;

-- System V3 / Public P40: caller-scoped participant Activity projection.
--
-- Activity is not a new write model. It is rebuilt from canonical operation
-- receipts plus canonical DomainEvents and exposes only a deliberately narrow,
-- recipient-safe shape. Raw receipts, event payloads, audit metadata, request
-- fingerprints and ballot/result content remain private infrastructure.
select public.v3_register_migration_contract(
  '20261019213000_v3_participant_activity_projection',
  1,
  'forward_fix_only',
  false,
  null,
  'Caller-scoped participant activity projection derived from canonical operations and DomainEvents'
);

create or replace function private.v3_activity_safe_uuid(p_value text)
returns uuid
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $safe_uuid$
begin
  return p_value::uuid;
exception when invalid_text_representation then
  return null;
end
$safe_uuid$;

revoke all on function private.v3_activity_safe_uuid(text)
  from public, anon, authenticated;

create or replace function private.v3_participant_activity_kind(
  p_command text,
  p_event_type text
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $kind$
  select case
    when p_event_type = 'jury.ballot_submitted'
      or p_command in ('jury.submit', 'jury.ballot_submit')
      then 'jury_participation'
    when p_event_type = 'televote.ballot_submitted'
      or p_command = 'televote.submit'
      then 'televote_participation'
    when p_event_type in ('prediction.submitted', 'prediction.changed')
      or p_command = 'prediction.submit'
      then 'prediction'
    when p_event_type in ('fantasy.submitted', 'fantasy.locked')
      or p_command in ('fantasy.submit', 'fantasy.lock')
      then 'fantasy'
    when p_event_type in (
      'confirmation.submitted',
      'entry.submitted',
      'entry.resubmitted',
      'next_in_line.submitted'
    )
      or p_command in (
        'confirmation.submit',
        'entry.submit',
        'entry.resubmit',
        'next_in_line.submit',
        'media.finalize_upload'
      )
      then 'submission'
    else 'receipt'
  end
$kind$;

create or replace function private.v3_participant_activity_title(
  p_command text,
  p_event_type text
)
returns text
language sql
immutable
security invoker
set search_path = pg_catalog
as $title$
  select case
    when p_event_type = 'confirmation.submitted' or p_command = 'confirmation.submit'
      then 'Participation confirmation submitted'
    when p_event_type = 'entry.submitted' or p_command = 'entry.submit'
      then 'Entry submitted'
    when p_event_type = 'entry.resubmitted' or p_command = 'entry.resubmit'
      then 'Entry resubmitted'
    when p_event_type = 'next_in_line.submitted' or p_command = 'next_in_line.submit'
      then 'Next in Line submission sent'
    when p_event_type = 'jury.ballot_submitted'
      or p_command in ('jury.submit', 'jury.ballot_submit')
      then 'Jury ballot submitted'
    when p_event_type = 'televote.ballot_submitted' or p_command = 'televote.submit'
      then 'Televote submitted'
    when p_event_type in ('prediction.submitted', 'prediction.changed')
      or p_command = 'prediction.submit'
      then 'Prediction submitted'
    when p_event_type in ('fantasy.submitted', 'fantasy.locked')
      or p_command in ('fantasy.submit', 'fantasy.lock')
      then 'Fantasy submission saved'
    when p_command = 'media.finalize_upload'
      then 'Media upload finalized'
    else 'Solaris operation completed'
  end
$title$;

revoke all on function private.v3_participant_activity_kind(text, text)
  from public, anon, authenticated;
revoke all on function private.v3_participant_activity_title(text, text)
  from public, anon, authenticated;

create or replace function public.v3_my_participant_activity(
  p_before timestamptz default null,
  p_before_id uuid default null,
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
  v_generated_at timestamptz := now();
  v_items jsonb := '[]'::jsonb;
  v_has_more boolean := false;
  v_next_before timestamptz;
  v_next_before_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_limit < 1 or v_limit > 50 then
    raise exception 'Participant activity limit must be between 1 and 50'
      using errcode = '22023';
  end if;

  -- Equal timestamps are common enough that a timestamp-only cursor is unsafe.
  -- Require the stable UUID tie-breaker together with the timestamp or neither.
  if (p_before is null) <> (p_before_id is null) then
    raise exception 'Participant activity cursor requires both before and before_id'
      using errcode = '22023';
  end if;

  with receipt_candidates as materialized (
    select
      coalesce(event.id, receipt.operation_id) as id,
      coalesce(event.occurred_at, receipt.completed_at, receipt.updated_at, receipt.created_at) as occurred_at,
      receipt.operation_id as receipt_id,
      receipt.command,
      event.event_type,
      coalesce(
        event.edition_id,
        private.v3_activity_safe_uuid(receipt.scope ->> 'editionId')
      ) as edition_id,
      coalesce(
        private.v3_activity_safe_uuid(receipt.scope ->> 'countryId'),
        private.v3_activity_safe_uuid(event.payload ->> 'countryId')
      ) as country_id,
      case
        when event.payload ->> 'reconciliationState' in ('current', 'superseded', 'unavailable')
          then event.payload ->> 'reconciliationState'
        else null
      end as explicit_reconciliation_state
    from public.studio2_operation_receipts receipt
    left join lateral (
      select domain_event.*
      from private.v3_domain_events domain_event
      where domain_event.operation_id = receipt.operation_id
        and domain_event.event_type in (
          'confirmation.submitted',
          'entry.submitted',
          'entry.resubmitted',
          'jury.ballot_submitted',
          'televote.ballot_submitted',
          'next_in_line.submitted',
          'prediction.submitted',
          'prediction.changed',
          'fantasy.submitted',
          'fantasy.locked'
        )
      order by domain_event.occurred_at desc, domain_event.id desc
      limit 1
    ) event on true
    where receipt.actor_id = v_actor
      and receipt.status = 'succeeded'
      and receipt.command in (
        'confirmation.submit',
        'entry.submit',
        'entry.resubmit',
        'jury.submit',
        'jury.ballot_submit',
        'televote.submit',
        'next_in_line.submit',
        'prediction.submit',
        'fantasy.submit',
        'fantasy.lock',
        'media.finalize_upload'
      )
  ),
  event_only_candidates as materialized (
    -- Some canonical event producers may not use the shared participant receipt
    -- yet. Actor-owned DomainEvents are still safe evidence, but only from this
    -- explicit participant-safe event allowlist and only when no caller-owned
    -- successful receipt already represents the same operation.
    select distinct on (event.operation_id)
      event.id as id,
      event.occurred_at,
      null::uuid as receipt_id,
      null::text as command,
      event.event_type,
      event.edition_id,
      private.v3_activity_safe_uuid(event.payload ->> 'countryId') as country_id,
      case
        when event.payload ->> 'reconciliationState' in ('current', 'superseded', 'unavailable')
          then event.payload ->> 'reconciliationState'
        else null
      end as explicit_reconciliation_state
    from private.v3_domain_events event
    where event.actor_id = v_actor
      and event.event_type in (
        'confirmation.submitted',
        'entry.submitted',
        'entry.resubmitted',
        'jury.ballot_submitted',
        'televote.ballot_submitted',
        'next_in_line.submitted',
        'prediction.submitted',
        'prediction.changed',
        'fantasy.submitted',
        'fantasy.locked'
      )
      and not exists (
        select 1
        from public.studio2_operation_receipts receipt
        where receipt.operation_id = event.operation_id
          and receipt.actor_id = v_actor
          and receipt.status = 'succeeded'
      )
    order by event.operation_id, event.occurred_at desc, event.id desc
  ),
  candidates as materialized (
    select * from receipt_candidates
    union all
    select * from event_only_candidates
  ),
  shaped as materialized (
    select
      candidate.id,
      candidate.occurred_at,
      private.v3_participant_activity_kind(candidate.command, candidate.event_type) as kind,
      private.v3_participant_activity_title(candidate.command, candidate.event_type) as title,
      case
        when edition.id is not null then edition.name
        else null
      end as description,
      candidate.edition_id,
      edition.name as edition_label,
      candidate.country_id,
      candidate.receipt_id,
      coalesce(candidate.event_type, candidate.command) as source_event_type,
      case
        when candidate.explicit_reconciliation_state is not null
          then candidate.explicit_reconciliation_state
        when candidate.edition_id is not null and edition.id is null
          then 'unavailable'
        else 'current'
      end as reconciliation_state
    from candidates candidate
    left join public.editions edition on edition.id = candidate.edition_id
  ),
  cursor_filtered as materialized (
    select shaped.*
    from shaped
    where p_before is null
       or (shaped.occurred_at, shaped.id) < (p_before, p_before_id)
  ),
  page_plus_one as materialized (
    select cursor_filtered.*
    from cursor_filtered
    order by occurred_at desc, id desc
    limit v_limit + 1
  ),
  visible as materialized (
    select page_plus_one.*
    from page_plus_one
    order by occurred_at desc, id desc
    limit v_limit
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', visible_row.id,
            'occurred_at', visible_row.occurred_at,
            'kind', visible_row.kind,
            'title', visible_row.title,
            'description', visible_row.description,
            'edition_id', visible_row.edition_id,
            'edition_label', visible_row.edition_label,
            'country_id', visible_row.country_id,
            -- Activity does not accept arbitrary stored URLs. A future route is
            -- added only through an explicit server-owned mapping.
            'route', null,
            'receipt_id', visible_row.receipt_id,
            'source_event_type', visible_row.source_event_type,
            'reconciliation_state', visible_row.reconciliation_state
          )
          order by visible_row.occurred_at desc, visible_row.id desc
        )
        from visible visible_row
      ),
      '[]'::jsonb
    ),
    (select count(*) > v_limit from page_plus_one),
    (
      select visible_row.occurred_at
      from visible visible_row
      order by visible_row.occurred_at asc, visible_row.id asc
      limit 1
    ),
    (
      select visible_row.id
      from visible visible_row
      order by visible_row.occurred_at asc, visible_row.id asc
      limit 1
    )
  into v_items, v_has_more, v_next_before, v_next_before_id;

  if not v_has_more then
    v_next_before := null;
    v_next_before_id := null;
  end if;

  return jsonb_build_object(
    'schema_version', 1,
    'items', v_items,
    'next_before', v_next_before,
    'next_before_id', v_next_before_id,
    'has_more', v_has_more,
    'generated_at', v_generated_at
  );
end
$activity$;

revoke all on function public.v3_my_participant_activity(timestamptz, uuid, integer)
  from public, anon;
grant execute on function public.v3_my_participant_activity(timestamptz, uuid, integer)
  to authenticated;

notify pgrst, 'reload schema';

commit;
