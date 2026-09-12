begin;

-- Studio 2 Phase 12 — Storytelling & Anniversary Engine
--
-- The canonical source is the existing studio2_contest_events stream plus
-- published edition/participant data. Generated narrative is deterministic and
-- editorial: generation never overwrites an organizer-edited item, and nothing
-- becomes public until an organizer explicitly publishes the storyline.

-- Phase 11 added host capabilities to the grant RPC but the original table
-- CHECK constraint still carried the pre-Phase-11 list. Repair that mismatch
-- while adding the Phase 12 storytelling capabilities.
alter table public.studio2_capability_grants
  drop constraint if exists studio2_capability_grants_capability_check;

alter table public.studio2_capability_grants
  add constraint studio2_capability_grants_capability_check check (
    capability in (
      'edition.read', 'edition.manage', 'edition.archive',
      'confirmation.read', 'confirmation.manage',
      'entry.read_private', 'entry.edit', 'entry.approve',
      'jury.ballots.read', 'televote.ballots.read',
      'results.preview', 'results.verify', 'results.publish',
      'integrity.read', 'integrity.manage', 'broadcast.control',
      'governance.vote', 'rules.edit', 'incident.manage', 'communications.send',
      'host.read', 'host.manage',
      'story.read', 'story.manage'
    )
  );

create or replace function public.studio2_grant_capability(
  p_user_id uuid,
  p_capability text,
  p_edition_id uuid default null,
  p_expires_at timestamptz default null
)
returns public.studio2_capability_grants
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_grant public.studio2_capability_grants%rowtype;
begin
  if p_user_id is null then
    raise exception 'Capability target user is required' using errcode = '22023';
  end if;

  if not v_is_service and not public.has_role(v_actor, 'organizer'::public.app_role) then
    raise exception 'Organizer role required' using errcode = '42501';
  end if;

  if p_capability not in (
    'edition.read', 'edition.manage', 'edition.archive',
    'confirmation.read', 'confirmation.manage',
    'entry.read_private', 'entry.edit', 'entry.approve',
    'jury.ballots.read', 'televote.ballots.read',
    'results.preview', 'results.verify', 'results.publish',
    'integrity.read', 'integrity.manage', 'broadcast.control',
    'governance.vote', 'rules.edit', 'incident.manage', 'communications.send',
    'host.read', 'host.manage',
    'story.read', 'story.manage'
  ) then
    raise exception 'Unknown Solaris capability: %', p_capability using errcode = '22023';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Capability expiry must be in the future' using errcode = '22023';
  end if;

  insert into public.studio2_capability_grants (
    user_id, capability, edition_id, expires_at, granted_by
  ) values (
    p_user_id, p_capability, p_edition_id, p_expires_at, v_actor
  )
  on conflict (user_id, capability, edition_id)
  do update set
    expires_at = excluded.expires_at,
    granted_by = excluded.granted_by
  returning * into v_grant;

  return v_grant;
end
$$;

-- Storyline lifecycle events join the canonical Studio 2 event stream.
alter table public.studio2_contest_events
  drop constraint if exists studio2_contest_events_type_check;

alter table public.studio2_contest_events
  add constraint studio2_contest_events_type_check check (
    type in (
      'edition.created', 'edition.state_changed', 'edition.archived',
      'edition.transition_approval_requested', 'edition.transition_approval_granted',
      'confirmation.opened', 'confirmation.closed', 'country.confirmed',
      'entry.submitted', 'entry.changed', 'entry.locked',
      'jury.opened', 'jury.closed', 'jury.ballot_submitted',
      'televote.opened', 'televote.closed', 'televote.ballot_submitted',
      'vote.flagged', 'integrity.case_created', 'integrity.case_closed',
      'results.calculated', 'results.verified', 'results.published',
      'broadcast.segment_started', 'broadcast.segment_completed',
      'incident.created', 'incident.updated', 'incident.resolved',
      'notice.sent', 'notice.acknowledged', 'rule.changed',
      'storyline.generated', 'storyline.updated',
      'storyline.published', 'storyline.unpublished'
    )
  );

create table if not exists public.studio2_storylines (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null unique references public.editions(id) on delete cascade,
  title text not null check (length(btrim(title)) >= 3),
  subtitle text,
  introduction text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  revision bigint not null default 1 check (revision >= 1),
  source_event_count integer not null default 0 check (source_event_count >= 0),
  generated_at timestamptz,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio2_storylines_publication_check check (
    (status = 'published' and published_at is not null)
    or (status = 'draft' and published_at is null)
  )
);

create index if not exists studio2_storylines_status_idx
  on public.studio2_storylines (status, published_at desc);
create index if not exists studio2_storylines_published_by_idx
  on public.studio2_storylines (published_by);
create index if not exists studio2_storylines_created_by_idx
  on public.studio2_storylines (created_by);
create index if not exists studio2_storylines_updated_by_idx
  on public.studio2_storylines (updated_by);

create table if not exists public.studio2_storyline_items (
  id uuid primary key default gen_random_uuid(),
  storyline_id uuid not null references public.studio2_storylines(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  source_event_id uuid references public.studio2_contest_events(id) on delete set null,
  source_event_type text,
  occurred_at timestamptz not null,
  importance integer not null check (importance between 0 and 100),
  headline text not null check (length(btrim(headline)) >= 3),
  summary text not null check (length(btrim(summary)) >= 3),
  canonical_facts jsonb not null default '{}'::jsonb check (jsonb_typeof(canonical_facts) = 'object'),
  included boolean not null default true,
  manual_override boolean not null default false,
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio2_storyline_items_storyline_order_idx
  on public.studio2_storyline_items (storyline_id, included, sort_order, occurred_at);
create index if not exists studio2_storyline_items_edition_time_idx
  on public.studio2_storyline_items (edition_id, occurred_at desc);
create index if not exists studio2_storyline_items_source_event_idx
  on public.studio2_storyline_items (source_event_id);
create index if not exists studio2_storyline_items_updated_by_idx
  on public.studio2_storyline_items (updated_by);
create unique index if not exists studio2_storyline_items_source_unique_idx
  on public.studio2_storyline_items (storyline_id, source_event_id)
  where source_event_id is not null;

create table if not exists public.studio2_story_operation_executions (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null unique,
  edition_id uuid not null references public.editions(id) on delete cascade,
  storyline_id uuid references public.studio2_storylines(id) on delete set null,
  item_id uuid references public.studio2_storyline_items(id) on delete set null,
  action text not null check (action in (
    'generate_storyline', 'update_storyline', 'create_manual_item',
    'update_item', 'reorder_item', 'publish_storyline', 'unpublish_storyline'
  )),
  reason text not null check (length(btrim(reason)) >= 5),
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists studio2_story_operation_executions_edition_idx
  on public.studio2_story_operation_executions (edition_id, created_at desc);
create index if not exists studio2_story_operation_executions_storyline_idx
  on public.studio2_story_operation_executions (storyline_id, created_at desc);
create index if not exists studio2_story_operation_executions_item_idx
  on public.studio2_story_operation_executions (item_id, created_at desc);
create index if not exists studio2_story_operation_executions_actor_idx
  on public.studio2_story_operation_executions (actor_user_id);

alter table public.studio2_storylines enable row level security;
alter table public.studio2_storyline_items enable row level security;
alter table public.studio2_story_operation_executions enable row level security;

revoke all on table public.studio2_storylines from public, anon, authenticated;
revoke all on table public.studio2_storyline_items from public, anon, authenticated;
revoke all on table public.studio2_story_operation_executions from public, anon, authenticated;

create or replace function private.studio2_can_read_storytelling(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    coalesce(public.has_role(p_user_id, 'organizer'::public.app_role), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'story.read', p_edition_id), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'story.manage', p_edition_id), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'edition.manage', p_edition_id), false);
$$;

create or replace function private.studio2_can_manage_storytelling(
  p_user_id uuid,
  p_edition_id uuid
) returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    coalesce(public.has_role(p_user_id, 'organizer'::public.app_role), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'story.manage', p_edition_id), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'edition.manage', p_edition_id), false);
$$;

revoke all on function private.studio2_can_read_storytelling(uuid, uuid) from public, anon, authenticated;
revoke all on function private.studio2_can_manage_storytelling(uuid, uuid) from public, anon, authenticated;
grant execute on function private.studio2_can_read_storytelling(uuid, uuid) to service_role;
grant execute on function private.studio2_can_manage_storytelling(uuid, uuid) to service_role;

create or replace function private.studio2_story_importance(p_type text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_type
    when 'results.published' then 100
    when 'results.verified' then 94
    when 'results.calculated' then 88
    when 'edition.state_changed' then 82
    when 'televote.closed' then 84
    when 'televote.opened' then 74
    when 'jury.closed' then 78
    when 'jury.opened' then 70
    when 'country.confirmed' then 66
    when 'confirmation.closed' then 62
    when 'confirmation.opened' then 58
    when 'broadcast.segment_completed' then 60
    when 'broadcast.segment_started' then 56
    when 'edition.created' then 72
    when 'edition.archived' then 68
    when 'entry.locked' then 57
    else 20
  end;
$$;

create or replace function private.studio2_story_headline(p_type text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_type
    when 'edition.created' then 'A new Solaris chapter began'
    when 'edition.state_changed' then 'The edition moved into its next phase'
    when 'edition.archived' then 'The edition entered the archive'
    when 'confirmation.opened' then 'Confirmations opened'
    when 'confirmation.closed' then 'The confirmation window closed'
    when 'country.confirmed' then 'Another delegation joined the edition'
    when 'entry.locked' then 'The entry field was locked'
    when 'jury.opened' then 'Jury voting opened'
    when 'jury.closed' then 'The juries finished voting'
    when 'televote.opened' then 'The televote opened'
    when 'televote.closed' then 'The televote closed'
    when 'results.calculated' then 'The scoreboard took shape'
    when 'results.verified' then 'The result passed verification'
    when 'results.published' then 'The result became official'
    when 'broadcast.segment_started' then 'The live show moved into a new segment'
    when 'broadcast.segment_completed' then 'A broadcast chapter was completed'
    else 'A Solaris milestone was recorded'
  end;
$$;

create or replace function private.studio2_story_summary(p_type text, p_edition_name text)
returns text
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_type
    when 'results.published' then format('%s reached its official result, closing the competitive story with a published scoreboard.', p_edition_name)
    when 'results.verified' then format('%s completed result verification before publication.', p_edition_name)
    when 'results.calculated' then format('%s produced a calculated result from the canonical voting systems.', p_edition_name)
    when 'televote.opened' then format('Public voting opened for %s.', p_edition_name)
    when 'televote.closed' then format('Public voting closed for %s and the final vote set moved toward verification.', p_edition_name)
    when 'jury.opened' then format('Jury voting opened for %s.', p_edition_name)
    when 'jury.closed' then format('The jury voting window closed for %s.', p_edition_name)
    when 'country.confirmed' then format('A delegation formally confirmed participation in %s.', p_edition_name)
    when 'confirmation.opened' then format('The confirmation process opened for %s.', p_edition_name)
    when 'confirmation.closed' then format('The confirmation process closed for %s.', p_edition_name)
    when 'edition.created' then format('%s was created in Solaris Studio and began its operational history.', p_edition_name)
    when 'edition.archived' then format('%s completed its active lifecycle and moved into the Solaris archive.', p_edition_name)
    when 'edition.state_changed' then format('%s changed operational phase as the contest moved forward.', p_edition_name)
    when 'entry.locked' then format('The competitive entry field for %s reached a locked milestone.', p_edition_name)
    when 'broadcast.segment_started' then format('A new live-broadcast segment started during %s.', p_edition_name)
    when 'broadcast.segment_completed' then format('A live-broadcast segment was completed during %s.', p_edition_name)
    else format('A canonical event in %s was marked as a possible storyline moment.', p_edition_name)
  end;
$$;

create or replace function public.studio2_storytelling_snapshot(p_edition_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_edition public.editions%rowtype;
  v_story public.studio2_storylines%rowtype;
  v_items jsonb := '[]'::jsonb;
  v_source_count integer := 0;
  v_eligible_count integer := 0;
  v_last_event_at timestamptz;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;

  select * into v_edition from public.editions where id = p_edition_id;
  if not found then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;

  if not v_is_service and not private.studio2_can_read_storytelling(v_actor, p_edition_id) then
    raise exception 'Missing Solaris capability: story.read' using errcode = '42501';
  end if;

  select count(*),
         count(*) filter (where private.studio2_story_importance(type) >= 55),
         max(occurred_at)
    into v_source_count, v_eligible_count, v_last_event_at
  from public.studio2_contest_events
  where edition_id = p_edition_id;

  select * into v_story
  from public.studio2_storylines
  where edition_id = p_edition_id;

  if found then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', i.id,
      'sourceEventId', i.source_event_id,
      'sourceEventType', i.source_event_type,
      'occurredAt', i.occurred_at,
      'importance', i.importance,
      'headline', i.headline,
      'summary', i.summary,
      'canonicalFacts', i.canonical_facts,
      'included', i.included,
      'manualOverride', i.manual_override,
      'sortOrder', i.sort_order,
      'updatedAt', i.updated_at
    ) order by i.sort_order, i.occurred_at, i.id), '[]'::jsonb)
    into v_items
    from public.studio2_storyline_items i
    where i.storyline_id = v_story.id;
  end if;

  return jsonb_build_object(
    'edition', jsonb_build_object(
      'id', v_edition.id,
      'name', v_edition.name,
      'slug', v_edition.slug,
      'editionNumber', v_edition.edition_number,
      'eventDate', v_edition.event_date,
      'published', v_edition.published
    ),
    'sourceEventCount', v_source_count,
    'eligibleSourceEventCount', v_eligible_count,
    'lastSourceEventAt', v_last_event_at,
    'storyline', case when v_story.id is null then null else jsonb_build_object(
      'id', v_story.id,
      'editionId', v_story.edition_id,
      'title', v_story.title,
      'subtitle', v_story.subtitle,
      'introduction', v_story.introduction,
      'status', v_story.status,
      'revision', v_story.revision,
      'sourceEventCount', v_story.source_event_count,
      'generatedAt', v_story.generated_at,
      'publishedAt', v_story.published_at,
      'createdAt', v_story.created_at,
      'updatedAt', v_story.updated_at,
      'items', v_items
    ) end
  );
end
$$;

revoke all on function public.studio2_storytelling_snapshot(uuid) from public, anon;
grant execute on function public.studio2_storytelling_snapshot(uuid) to authenticated, service_role;

create or replace function public.studio2_execute_story_operation(
  p_edition_id uuid,
  p_action text,
  p_reason text,
  p_execution_id uuid,
  p_expected_revision bigint default null,
  p_item_id uuid default null,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.jwt() ->> 'role', '') = 'service_role';
  v_reason text := btrim(coalesce(p_reason, ''));
  v_payload_input jsonb := coalesce(p_payload, '{}'::jsonb);
  v_edition public.editions%rowtype;
  v_story public.studio2_storylines%rowtype;
  v_item public.studio2_storyline_items%rowtype;
  v_existing public.studio2_story_operation_executions%rowtype;
  v_result jsonb;
  v_created integer := 0;
  v_included_count integer := 0;
  v_event_type text := 'storyline.updated';
  v_headline text;
  v_summary text;
  v_importance integer;
  v_occurred_at timestamptz;
  v_sort_order integer;
begin
  if p_edition_id is null or p_execution_id is null then
    raise exception 'Edition id and execution id are required' using errcode = '22023';
  end if;

  if p_action not in (
    'generate_storyline', 'update_storyline', 'create_manual_item',
    'update_item', 'reorder_item', 'publish_storyline', 'unpublish_storyline'
  ) then
    raise exception 'Unsupported story operation: %', p_action using errcode = '22023';
  end if;

  if length(v_reason) < 5 then
    raise exception 'A story operation reason of at least 5 characters is required' using errcode = '22023';
  end if;

  if jsonb_typeof(v_payload_input) <> 'object' then
    raise exception 'Story operation payload must be an object' using errcode = '22023';
  end if;

  select * into v_edition from public.editions where id = p_edition_id;
  if not found then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;

  if not v_is_service and not private.studio2_can_manage_storytelling(v_actor, p_edition_id) then
    raise exception 'Missing Solaris capability: story.manage' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studio2-story:' || p_edition_id::text, 0));

  select * into v_existing
  from public.studio2_story_operation_executions
  where execution_id = p_execution_id;

  if found then
    if v_existing.edition_id <> p_edition_id or v_existing.action <> p_action then
      raise exception 'Execution id was already used for a different story operation' using errcode = '23505';
    end if;
    return v_existing.payload || jsonb_build_object('idempotentReplay', true);
  end if;

  select * into v_story
  from public.studio2_storylines
  where edition_id = p_edition_id
  for update;

  if p_action = 'generate_storyline' then
    if found then
      if p_expected_revision is null or p_expected_revision <> v_story.revision then
        raise exception 'Storyline changed since this action was loaded. Refresh before continuing.' using errcode = '40001';
      end if;
    else
      insert into public.studio2_storylines (
        edition_id, title, subtitle, introduction, created_by, updated_by
      ) values (
        p_edition_id,
        coalesce(nullif(btrim(v_payload_input ->> 'title'), ''), v_edition.name || ': The Story'),
        nullif(btrim(v_payload_input ->> 'subtitle'), ''),
        coalesce(
          nullif(btrim(v_payload_input ->> 'introduction'), ''),
          format('A verified timeline of the moments that shaped %s, assembled from the canonical Solaris Studio event stream.', v_edition.name)
        ),
        v_actor,
        v_actor
      ) returning * into v_story;
    end if;

    insert into public.studio2_storyline_items (
      storyline_id, edition_id, source_event_id, source_event_type, occurred_at,
      importance, headline, summary, canonical_facts, included, manual_override,
      sort_order, updated_by
    )
    select
      v_story.id,
      p_edition_id,
      e.id,
      e.type,
      e.occurred_at,
      private.studio2_story_importance(e.type),
      private.studio2_story_headline(e.type),
      private.studio2_story_summary(e.type, v_edition.name),
      jsonb_build_object(
        'sourceEventId', e.id,
        'eventType', e.type,
        'occurredAt', e.occurred_at,
        'entityType', e.entity_type,
        'entityId', e.entity_id
      ),
      true,
      false,
      coalesce((select max(existing.sort_order) from public.studio2_storyline_items existing where existing.storyline_id = v_story.id), 0)
        + row_number() over (order by e.occurred_at, e.id)::integer * 10,
      v_actor
    from public.studio2_contest_events e
    where e.edition_id = p_edition_id
      and private.studio2_story_importance(e.type) >= 55
      and not exists (
        select 1 from public.studio2_storyline_items existing
        where existing.storyline_id = v_story.id and existing.source_event_id = e.id
      )
    order by e.occurred_at, e.id;

    get diagnostics v_created = row_count;

    update public.studio2_storylines
    set source_event_count = (select count(*) from public.studio2_contest_events where edition_id = p_edition_id),
        generated_at = now(),
        status = 'draft',
        published_at = null,
        published_by = null,
        revision = revision + 1,
        updated_by = v_actor,
        updated_at = now()
    where id = v_story.id
    returning * into v_story;

    v_event_type := 'storyline.generated';

  else
    if v_story.id is null then
      raise exception 'Generate the edition storyline before editing it' using errcode = '55000';
    end if;

    if p_expected_revision is null or p_expected_revision <> v_story.revision then
      raise exception 'Storyline changed since this action was loaded. Refresh before continuing.' using errcode = '40001';
    end if;

    if p_action = 'update_storyline' then
      update public.studio2_storylines
      set title = case when v_payload_input ? 'title' then btrim(v_payload_input ->> 'title') else title end,
          subtitle = case when v_payload_input ? 'subtitle' then nullif(btrim(v_payload_input ->> 'subtitle'), '') else subtitle end,
          introduction = case when v_payload_input ? 'introduction' then nullif(btrim(v_payload_input ->> 'introduction'), '') else introduction end,
          status = 'draft',
          published_at = null,
          published_by = null,
          revision = revision + 1,
          updated_by = v_actor,
          updated_at = now()
      where id = v_story.id
      returning * into v_story;

    elsif p_action = 'create_manual_item' then
      v_headline := btrim(coalesce(v_payload_input ->> 'headline', ''));
      v_summary := btrim(coalesce(v_payload_input ->> 'summary', ''));
      if length(v_headline) < 3 or length(v_summary) < 3 then
        raise exception 'Manual story moments require a headline and summary' using errcode = '22023';
      end if;
      v_importance := coalesce(nullif(v_payload_input ->> 'importance', '')::integer, 70);
      if v_importance < 0 or v_importance > 100 then
        raise exception 'Story importance must be between 0 and 100' using errcode = '22023';
      end if;
      v_occurred_at := coalesce(nullif(v_payload_input ->> 'occurredAt', '')::timestamptz, now());
      select coalesce(max(sort_order), 0) + 10 into v_sort_order
      from public.studio2_storyline_items where storyline_id = v_story.id;

      insert into public.studio2_storyline_items (
        storyline_id, edition_id, occurred_at, importance, headline, summary,
        canonical_facts, included, manual_override, sort_order, updated_by
      ) values (
        v_story.id, p_edition_id, v_occurred_at, v_importance, v_headline, v_summary,
        jsonb_build_object('manual', true, 'occurredAt', v_occurred_at),
        coalesce((v_payload_input ->> 'included')::boolean, true), true, v_sort_order, v_actor
      ) returning * into v_item;
      p_item_id := v_item.id;

      update public.studio2_storylines
      set status = 'draft', published_at = null, published_by = null,
          revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = v_story.id returning * into v_story;

    elsif p_action in ('update_item', 'reorder_item') then
      if p_item_id is null then
        raise exception 'Story item id is required for %', p_action using errcode = '22023';
      end if;

      select * into v_item
      from public.studio2_storyline_items
      where id = p_item_id and storyline_id = v_story.id and edition_id = p_edition_id
      for update;
      if not found then
        raise exception 'Story item not found in this edition' using errcode = 'P0002';
      end if;

      if p_action = 'update_item' then
        v_importance := case
          when v_payload_input ? 'importance' then nullif(v_payload_input ->> 'importance', '')::integer
          else v_item.importance
        end;
        if v_importance is null or v_importance < 0 or v_importance > 100 then
          raise exception 'Story importance must be between 0 and 100' using errcode = '22023';
        end if;

        update public.studio2_storyline_items
        set headline = case when v_payload_input ? 'headline' then btrim(v_payload_input ->> 'headline') else headline end,
            summary = case when v_payload_input ? 'summary' then btrim(v_payload_input ->> 'summary') else summary end,
            importance = v_importance,
            included = case when v_payload_input ? 'included' then (v_payload_input ->> 'included')::boolean else included end,
            manual_override = true,
            updated_by = v_actor,
            updated_at = now()
        where id = p_item_id
        returning * into v_item;
      else
        v_sort_order := nullif(v_payload_input ->> 'sortOrder', '')::integer;
        if v_sort_order is null then
          raise exception 'sortOrder is required' using errcode = '22023';
        end if;
        update public.studio2_storyline_items
        set sort_order = v_sort_order,
            manual_override = true,
            updated_by = v_actor,
            updated_at = now()
        where id = p_item_id
        returning * into v_item;
      end if;

      update public.studio2_storylines
      set status = 'draft', published_at = null, published_by = null,
          revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = v_story.id returning * into v_story;

    elsif p_action = 'publish_storyline' then
      if not v_edition.published then
        raise exception 'Publish the edition before publishing its storyline' using errcode = '55000';
      end if;
      if length(btrim(coalesce(v_story.introduction, ''))) < 10 then
        raise exception 'Add a storyline introduction before publication' using errcode = '55000';
      end if;
      select count(*) into v_included_count
      from public.studio2_storyline_items
      where storyline_id = v_story.id and included;
      if v_included_count < 3 then
        raise exception 'Include at least three story moments before publication' using errcode = '55000';
      end if;

      update public.studio2_storylines
      set status = 'published', published_at = now(), published_by = v_actor,
          revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = v_story.id returning * into v_story;
      v_event_type := 'storyline.published';

    elsif p_action = 'unpublish_storyline' then
      if v_story.status <> 'published' then
        raise exception 'Only a published storyline can be unpublished' using errcode = '55000';
      end if;
      update public.studio2_storylines
      set status = 'draft', published_at = null, published_by = null,
          revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = v_story.id returning * into v_story;
      v_event_type := 'storyline.unpublished';
    end if;
  end if;

  v_result := jsonb_build_object(
    'executionId', p_execution_id,
    'editionId', p_edition_id,
    'storylineId', v_story.id,
    'itemId', p_item_id,
    'action', p_action,
    'reason', v_reason,
    'revision', v_story.revision,
    'status', v_story.status,
    'createdItems', v_created,
    'idempotentReplay', false
  );

  insert into public.studio2_story_operation_executions (
    execution_id, edition_id, storyline_id, item_id, action, reason, actor_user_id, payload
  ) values (
    p_execution_id, p_edition_id, v_story.id, p_item_id, p_action, v_reason, v_actor, v_result
  );

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id,
    v_event_type,
    v_actor,
    case when p_item_id is null then 'storyline' else 'storyline_item' end,
    coalesce(p_item_id::text, v_story.id::text),
    jsonb_build_object(
      'action', p_action,
      'executionId', p_execution_id,
      'reason', v_reason,
      'storylineId', v_story.id,
      'itemId', p_item_id,
      'revision', v_story.revision,
      'status', v_story.status,
      'createdItems', v_created
    )
  );

  return v_result;
end
$$;

revoke all on function public.studio2_execute_story_operation(uuid, text, text, uuid, bigint, uuid, jsonb) from public, anon;
grant execute on function public.studio2_execute_story_operation(uuid, text, text, uuid, bigint, uuid, jsonb) to authenticated, service_role;

-- Public story APIs expose only explicitly published storylines and editorial
-- copy. Raw contest-event payloads and canonical_facts never cross this API.
create or replace function public.studio2_public_storylines(p_limit integer default 20)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce(jsonb_agg(row_data order by published_at desc), '[]'::jsonb)
  from (
    select
      s.published_at,
      jsonb_build_object(
        'editionId', e.id,
        'editionSlug', e.slug,
        'editionName', e.name,
        'editionNumber', e.edition_number,
        'eventDate', e.event_date,
        'title', s.title,
        'subtitle', s.subtitle,
        'introduction', s.introduction,
        'publishedAt', s.published_at,
        'itemCount', (select count(*) from public.studio2_storyline_items i where i.storyline_id = s.id and i.included),
        'heroMoment', (
          select jsonb_build_object(
            'headline', i.headline,
            'summary', i.summary,
            'importance', i.importance,
            'occurredAt', i.occurred_at
          )
          from public.studio2_storyline_items i
          where i.storyline_id = s.id and i.included
          order by i.importance desc, i.occurred_at desc
          limit 1
        )
      ) as row_data
    from public.studio2_storylines s
    join public.editions e on e.id = s.edition_id
    where s.status = 'published' and e.published
    order by s.published_at desc
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  ) q;
$$;

revoke all on function public.studio2_public_storylines(integer) from public;
grant execute on function public.studio2_public_storylines(integer) to anon, authenticated, service_role;

create or replace function public.studio2_public_storyline(p_edition_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_story public.studio2_storylines%rowtype;
  v_edition public.editions%rowtype;
  v_items jsonb := '[]'::jsonb;
begin
  select s.*, e.* into v_story, v_edition
  from public.studio2_storylines s
  join public.editions e on e.id = s.edition_id
  where e.slug = p_edition_slug and e.published and s.status = 'published'
  limit 1;

  if v_story.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', i.id,
    'sourceEventType', i.source_event_type,
    'occurredAt', i.occurred_at,
    'importance', i.importance,
    'headline', i.headline,
    'summary', i.summary,
    'sortOrder', i.sort_order
  ) order by i.sort_order, i.occurred_at, i.id), '[]'::jsonb)
  into v_items
  from public.studio2_storyline_items i
  where i.storyline_id = v_story.id and i.included;

  return jsonb_build_object(
    'editionId', v_edition.id,
    'editionSlug', v_edition.slug,
    'editionName', v_edition.name,
    'editionNumber', v_edition.edition_number,
    'eventDate', v_edition.event_date,
    'title', v_story.title,
    'subtitle', v_story.subtitle,
    'introduction', v_story.introduction,
    'publishedAt', v_story.published_at,
    'items', v_items
  );
end
$$;

revoke all on function public.studio2_public_storyline(text) from public;
grant execute on function public.studio2_public_storyline(text) to anon, authenticated, service_role;

create or replace function public.studio2_anniversary_engine(
  p_reference_date date default current_date,
  p_limit integer default 24
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reference date := coalesce(p_reference_date, current_date);
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 100));
  v_on_this_day jsonb := '[]'::jsonb;
  v_one_year jsonb := '[]'::jsonb;
  v_five_year jsonb := '[]'::jsonb;
  v_country_anniversaries jsonb := '[]'::jsonb;
  v_recent_stories jsonb := '[]'::jsonb;
  v_ssc_anniversary jsonb := null;
begin
  select coalesce(jsonb_agg(moment order by occurred_at desc), '[]'::jsonb)
  into v_on_this_day
  from (
    select i.occurred_at,
      jsonb_build_object(
        'editionSlug', e.slug,
        'editionName', e.name,
        'editionNumber', e.edition_number,
        'headline', i.headline,
        'summary', i.summary,
        'importance', i.importance,
        'occurredAt', i.occurred_at,
        'yearsAgo', extract(year from v_reference)::integer - extract(year from (i.occurred_at at time zone 'Europe/Paris'))::integer
      ) moment
    from public.studio2_storyline_items i
    join public.studio2_storylines s on s.id = i.storyline_id and s.status = 'published'
    join public.editions e on e.id = s.edition_id and e.published
    where i.included
      and to_char(i.occurred_at at time zone 'Europe/Paris', 'MM-DD') = to_char(v_reference, 'MM-DD')
      and (i.occurred_at at time zone 'Europe/Paris')::date < v_reference
    order by i.importance desc, i.occurred_at desc
    limit v_limit
  ) q;

  select coalesce(jsonb_agg(moment order by importance desc, occurred_at desc), '[]'::jsonb)
  into v_one_year
  from (
    select i.importance, i.occurred_at,
      jsonb_build_object(
        'editionSlug', e.slug,
        'editionName', e.name,
        'editionNumber', e.edition_number,
        'headline', i.headline,
        'summary', i.summary,
        'importance', i.importance,
        'occurredAt', i.occurred_at,
        'yearsAgo', 1
      ) moment
    from public.studio2_storyline_items i
    join public.studio2_storylines s on s.id = i.storyline_id and s.status = 'published'
    join public.editions e on e.id = s.edition_id and e.published
    where i.included
      and (i.occurred_at at time zone 'Europe/Paris')::date = (v_reference - interval '1 year')::date
    order by i.importance desc, i.occurred_at desc
    limit v_limit
  ) q;

  select coalesce(jsonb_agg(moment order by importance desc, occurred_at desc), '[]'::jsonb)
  into v_five_year
  from (
    select i.importance, i.occurred_at,
      jsonb_build_object(
        'editionSlug', e.slug,
        'editionName', e.name,
        'editionNumber', e.edition_number,
        'headline', i.headline,
        'summary', i.summary,
        'importance', i.importance,
        'occurredAt', i.occurred_at,
        'yearsAgo', 5
      ) moment
    from public.studio2_storyline_items i
    join public.studio2_storylines s on s.id = i.storyline_id and s.status = 'published'
    join public.editions e on e.id = s.edition_id and e.published
    where i.included
      and (i.occurred_at at time zone 'Europe/Paris')::date = (v_reference - interval '5 years')::date
    order by i.importance desc, i.occurred_at desc
    limit v_limit
  ) q;

  with first_participations as (
    select p.country_id, min(e.event_date) as first_date
    from public.participants p
    join public.editions e on e.id = p.edition_id
    where p.country_id is not null
      and p.show_id is null
      and e.published
      and e.event_date is not null
    group by p.country_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'countryId', c.id,
    'countryName', c.name,
    'firstParticipationDate', f.first_date,
    'years', extract(year from age(v_reference, f.first_date))::integer
  ) order by c.name), '[]'::jsonb)
  into v_country_anniversaries
  from first_participations f
  join public.countries c on c.id = f.country_id
  where f.first_date < v_reference
    and to_char(f.first_date, 'MM-DD') = to_char(v_reference, 'MM-DD');

  if v_reference >= date '2022-09-17' and to_char(v_reference, 'MM-DD') = '09-17' then
    v_ssc_anniversary := jsonb_build_object(
      'birthDate', '2022-09-17',
      'years', extract(year from v_reference)::integer - 2022,
      'label', format('%s years of Solaris', extract(year from v_reference)::integer - 2022)
    );
  end if;

  select coalesce(jsonb_agg(story order by published_at desc), '[]'::jsonb)
  into v_recent_stories
  from (
    select s.published_at,
      jsonb_build_object(
        'editionSlug', e.slug,
        'editionName', e.name,
        'editionNumber', e.edition_number,
        'title', s.title,
        'subtitle', s.subtitle,
        'publishedAt', s.published_at,
        'itemCount', (select count(*) from public.studio2_storyline_items i where i.storyline_id = s.id and i.included)
      ) story
    from public.studio2_storylines s
    join public.editions e on e.id = s.edition_id
    where s.status = 'published' and e.published
    order by s.published_at desc
    limit least(v_limit, 12)
  ) q;

  return jsonb_build_object(
    'referenceDate', v_reference,
    'timeZone', 'Europe/Paris',
    'sscAnniversary', v_ssc_anniversary,
    'onThisDay', v_on_this_day,
    'oneYearAgo', v_one_year,
    'fiveYearsAgo', v_five_year,
    'countryAnniversaries', v_country_anniversaries,
    'recentStories', v_recent_stories
  );
end
$$;

revoke all on function public.studio2_anniversary_engine(date, integer) from public;
grant execute on function public.studio2_anniversary_engine(date, integer) to anon, authenticated, service_role;

commit;
