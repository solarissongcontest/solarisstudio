begin;

-- Organisation OS V5: expand canonical Tasks from persisted entry, media and
-- integration truth. Do not create publication work merely because a result is
-- reveal-ready: staged publication is an intentional Organizer decision unless
-- another authoritative object explicitly requires release.

-- The runtime already records "skipped" result-sync events and Sync Health
-- understands "retrying", while the original persistence constraint only
-- allowed pending/completed/failed. Keep one canonical vocabulary.
alter table public.integration_events
  drop constraint if exists integration_events_status_check;

alter table public.integration_events
  add constraint integration_events_status_check
  check (status in ('pending', 'retrying', 'completed', 'failed', 'skipped'));

create or replace function private.studio2_required_media_faults(
  p_edition_id uuid default null
)
returns table (
  edition_id uuid,
  country_id uuid,
  country_name text,
  missing_count integer,
  invalid_count integer,
  fault_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $media$
  with active_delegations as (
    select distinct participant.edition_id, participant.country_id
    from public.participants participant
    where participant.country_id is not null
      and participant.participation_status = 'confirmed'
      and (p_edition_id is null or participant.edition_id = p_edition_id)

    union

    select distinct entry.edition_id, entry.country_id
    from public.entries entry
    where entry.status = 'confirmed'
      and (p_edition_id is null or entry.edition_id = p_edition_id)
  ),
  faults as (
    -- Every active delegation needs its canonical flag.
    select
      delegation.edition_id,
      delegation.country_id,
      country.name as country_name,
      'missing'::text as fault_state
    from active_delegations delegation
    join public.countries country on country.id = delegation.country_id
    where nullif(btrim(country.flag_image), '') is null

    union all

    -- The shared media model blocks malformed required HTTP(S) sources even
    -- before an Organizer review decision exists.
    select
      delegation.edition_id,
      delegation.country_id,
      country.name as country_name,
      'invalid'::text as fault_state
    from active_delegations delegation
    join public.countries country on country.id = delegation.country_id
    where nullif(btrim(country.flag_image), '') is not null
      and btrim(country.flag_image) !~* '^https?://'

    union all

    -- An explicit invalid review applies only while it matches the current
    -- source fingerprint. Replacing the source therefore clears this condition
    -- until the replacement is reviewed.
    select
      delegation.edition_id,
      delegation.country_id,
      country.name as country_name,
      'invalid'::text as fault_state
    from active_delegations delegation
    join public.countries country on country.id = delegation.country_id
    where nullif(btrim(country.flag_image), '') is not null
      and btrim(country.flag_image) ~* '^https?://'
      and exists (
        select 1
        from public.studio2_media_asset_reviews review
        where review.edition_id = delegation.edition_id
          and review.asset_key = 'country:' || delegation.country_id::text || ':flag'
          and review.asset_type = 'flag'
          and review.source_fingerprint = btrim(country.flag_image)
          and review.decision = 'invalid'
          and review.superseded_at is null
      )

    union all

    -- Performance video is a required slot only after the canonical entry is
    -- confirmed. Pending confirmation placeholders intentionally do not create
    -- a second Organizer task.
    select
      entry.edition_id,
      entry.country_id,
      country.name as country_name,
      'missing'::text as fault_state
    from public.entries entry
    join public.countries country on country.id = entry.country_id
    where entry.status = 'confirmed'
      and nullif(btrim(entry.song_url), '') is null
      and (p_edition_id is null or entry.edition_id = p_edition_id)

    union all

    -- Processing is its own non-blocking state in the shared media model.
    -- Only a stable current source can become an invalid required-media fault.
    select
      entry.edition_id,
      entry.country_id,
      country.name as country_name,
      'invalid'::text as fault_state
    from public.entries entry
    join public.countries country on country.id = entry.country_id
    where entry.status = 'confirmed'
      and nullif(btrim(entry.song_url), '') is not null
      and btrim(entry.song_url) !~* '^https?://'
      and not (
        coalesce(entry.metadata ->> 'video_processing', '') = 'true'
        or coalesce(entry.metadata ->> 'videoProcessing', '') = 'true'
      )
      and (p_edition_id is null or entry.edition_id = p_edition_id)

    union all

    select
      entry.edition_id,
      entry.country_id,
      country.name as country_name,
      'invalid'::text as fault_state
    from public.entries entry
    join public.countries country on country.id = entry.country_id
    where entry.status = 'confirmed'
      and nullif(btrim(entry.song_url), '') is not null
      and btrim(entry.song_url) ~* '^https?://'
      and not (
        coalesce(entry.metadata ->> 'video_processing', '') = 'true'
        or coalesce(entry.metadata ->> 'videoProcessing', '') = 'true'
      )
      and (p_edition_id is null or entry.edition_id = p_edition_id)
      and exists (
        select 1
        from public.studio2_media_asset_reviews review
        where review.edition_id = entry.edition_id
          and review.asset_key = 'entry:' || entry.id::text || ':performance_video'
          and review.asset_type = 'performance_video'
          and review.source_fingerprint = btrim(entry.song_url)
          and review.decision = 'invalid'
          and review.superseded_at is null
      )
  )
  select
    fault.edition_id,
    fault.country_id,
    max(fault.country_name) as country_name,
    count(*) filter (where fault.fault_state = 'missing')::integer as missing_count,
    count(*) filter (where fault.fault_state = 'invalid')::integer as invalid_count,
    count(*)::integer as fault_count
  from faults fault
  group by fault.edition_id, fault.country_id;
$media$;

revoke all on function private.studio2_required_media_faults(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_current_integration_failures(
  p_edition_id uuid default null
)
returns table (
  source_id text,
  edition_id uuid,
  service text,
  event_type text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $integration$
  with normalized as (
    select
      event.id,
      event.service,
      event.event_type,
      event.entity_type,
      event.entity_id,
      event.remote_id,
      event.status,
      event.created_at,
      event.updated_at,
      case
        when event.event_type in (
          'round.lineup.autosynced',
          'round.lineup.autosync_failed'
        ) then 'round.lineup.autosync'
        else event.event_type
      end as event_family,
      coalesce(
        nullif(event.remote_id, ''),
        event.entity_type || ':' || coalesce(event.entity_id::text, event.id::text)
      ) as object_key,
      coalesce(
        case
          when event.entity_type = 'edition'
           and exists (
             select 1
             from public.editions edition
             where edition.id = event.entity_id
           )
          then event.entity_id
          else null
        end,
        (
          select show_row.edition_id
          from public.shows show_row
          where event.entity_type = 'show'
            and show_row.id = event.entity_id
          limit 1
        ),
        (
          select participant.edition_id
          from public.participants participant
          where event.entity_type in ('participant', 'submission')
            and participant.id = event.entity_id
          limit 1
        ),
        (
          select entry.edition_id
          from public.entries entry
          where event.entity_type = 'entry'
            and entry.id = event.entity_id
          limit 1
        ),
        (
          select link.edition_id
          from public.integration_links link
          where link.service = event.service
            and link.edition_id is not null
            and (
              (event.remote_id is not null and link.remote_id = event.remote_id)
              or (event.entity_id is not null and link.solaris_id = event.entity_id)
            )
          order by link.updated_at desc, link.id desc
          limit 1
        ),
        (
          select binding.edition_id
          from public.televoting_round_bindings binding
          where event.remote_id is not null
            and binding.remote_round_id = event.remote_id
          order by binding.last_synced_at desc nulls last, binding.edition_id
          limit 1
        )
      ) as resolved_edition_id
    from public.integration_events event
    where event.status in ('failed', 'completed', 'skipped')
  ),
  latest as (
    select distinct on (
      normalized.service,
      normalized.event_family,
      normalized.object_key
    )
      normalized.*
    from normalized
    order by
      normalized.service,
      normalized.event_family,
      normalized.object_key,
      normalized.updated_at desc,
      normalized.created_at desc,
      normalized.id desc
  )
  select
    latest.service || ':' || latest.event_family || ':' || latest.object_key as source_id,
    latest.resolved_edition_id as edition_id,
    latest.service,
    latest.event_type,
    latest.updated_at
  from latest
  where latest.status = 'failed'
    and (
      p_edition_id is null
      or latest.resolved_edition_id is null
      or latest.resolved_edition_id = p_edition_id
    );
$integration$;

revoke all on function private.studio2_current_integration_failures(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_reconcile_organizer_tasks_truth(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $tasktruth$
begin
  -- ----------------------------------------------------------
  -- Canonical entries awaiting Organizer approval
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'entry_approval'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.entries entry
      where entry.id::text = task.source_id
        and entry.status = 'pending'
        and nullif(btrim(entry.artist), '') is not null
        and nullif(btrim(entry.song_title), '') is not null
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    country_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    entry.edition_id,
    entry.country_id,
    'entry_approval',
    entry.id::text,
    'entry-approval:' || entry.id::text,
    'entry.approval',
    'entry.approve',
    'high',
    'open',
    country.name || ' entry needs approval',
    'Canonical artist and song data are present, but the edition entry is still pending Organizer approval.',
    '/admin/countries/' || entry.country_id::text || '?tab=entry',
    jsonb_build_object(
      'table', 'entries',
      'entryId', entry.id,
      'resolvedWhen', 'entry status is no longer pending'
    ),
    entry.created_at,
    null,
    now(),
    now()
  from public.entries entry
  join public.countries country on country.id = entry.country_id
  where entry.status = 'pending'
    and nullif(btrim(entry.artist), '') is not null
    and nullif(btrim(entry.song_title), '') is not null
    and (p_edition_id is null or entry.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    country_id = excluded.country_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Required media slots that are missing or explicitly invalid
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'media_required_fault'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from private.studio2_required_media_faults(p_edition_id) fault
      where (
        fault.edition_id::text || ':' || fault.country_id::text
      ) = task.source_id
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    country_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    fault.edition_id,
    fault.country_id,
    'media_required_fault',
    fault.edition_id::text || ':' || fault.country_id::text,
    'media-required:' || fault.edition_id::text || ':' || fault.country_id::text,
    'media.required',
    'entry.approve',
    'high',
    'open',
    fault.country_name || ' required media needs attention',
    fault.fault_count::text || ' required media slot' ||
      case when fault.fault_count = 1 then ' is' else 's are' end ||
      ' unresolved (' || fault.missing_count::text || ' missing, ' ||
      fault.invalid_count::text || ' explicitly invalid).',
    '/admin/media-assets',
    jsonb_build_object(
      'table', 'studio2_media_asset_reviews',
      'editionId', fault.edition_id,
      'countryId', fault.country_id,
      'resolvedWhen', 'required flag and confirmed-entry performance video are present and have no current invalid review'
    ),
    now(),
    null,
    now(),
    now()
  from private.studio2_required_media_faults(p_edition_id) fault
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    country_id = excluded.country_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Persistent integration links whose canonical sync state is error
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'integration_link_error'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and not exists (
      select 1
      from public.integration_links link
      where link.id::text = task.source_id
        and link.sync_status = 'error'
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    link.edition_id,
    'integration_link_error',
    link.id::text,
    'integration-link-error:' || link.id::text,
    'integration.link.repair',
    case
      when link.service = 'confirmations' then 'confirmation.manage'
      else 'voting.manage'
    end,
    'high',
    'open',
    initcap(link.service) || ' integration link needs repair',
    'The canonical ' || link.entity_type || ' integration link is in error state. Open Sync Health before continuing dependent operations.',
    '/admin/sync-health',
    jsonb_build_object(
      'table', 'integration_links',
      'linkId', link.id,
      'resolvedWhen', 'sync_status is no longer error'
    ),
    link.updated_at,
    null,
    now(),
    now()
  from public.integration_links link
  where link.sync_status = 'error'
    and (
      p_edition_id is null
      or link.edition_id is null
      or link.edition_id = p_edition_id
    )
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- ----------------------------------------------------------
  -- Latest integration operation for an object is failed
  -- ----------------------------------------------------------
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'integration_failure'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and not exists (
      select 1
      from private.studio2_current_integration_failures(p_edition_id) failure
      where failure.source_id = task.source_id
    );

  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    failure.edition_id,
    'integration_failure',
    failure.source_id,
    'integration-failure:' || failure.source_id,
    'integration.operation.failed',
    case
      when failure.service = 'confirmations' then 'confirmation.manage'
      else 'voting.manage'
    end,
    'high',
    'open',
    initcap(failure.service) || ' integration operation failed',
    'The latest ' || failure.event_type ||
      ' state for this integration object failed. Open Sync Health to inspect the authoritative diagnostic event and retry path.',
    '/admin/sync-health',
    jsonb_build_object(
      'table', 'integration_events',
      'sourceId', failure.source_id,
      'resolvedWhen', 'a later canonical event for the same operation object is completed or skipped'
    ),
    failure.updated_at,
    null,
    now(),
    now()
  from private.studio2_current_integration_failures(p_edition_id) failure
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    opened_at = least(
      public.studio2_organizer_tasks.opened_at,
      excluded.opened_at
    ),
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  update public.admin_notifications notification
  set resolved_at = task.resolved_at
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.requires_action = true
    and notification.resolved_at is distinct from task.resolved_at;
end
$tasktruth$;

revoke all on function private.studio2_reconcile_organizer_tasks_truth(uuid)
  from public, anon, authenticated;

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $alltasks$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);

  -- Delivery state follows the complete canonical queue only after every source
  -- reconciler has evaluated its domain truth.
  update public.admin_notifications notification
  set resolved_at = task.resolved_at
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.requires_action = true
    and notification.resolved_at is distinct from task.resolved_at;
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
