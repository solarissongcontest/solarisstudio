begin;

-- Phase 12 hardening.
-- Keep storyline lifecycle/audit events out of the source-history counters and
-- correct the composite row load used by the public storyline projection.

create or replace function private.studio2_sync_story_source_count()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  update public.studio2_storylines s
  set source_event_count = (
    select count(*)
    from public.studio2_contest_events e
    where e.edition_id = new.edition_id
      and e.type not like 'storyline.%'
  )
  where s.edition_id = new.edition_id;

  return new;
end
$$;

revoke all on function private.studio2_sync_story_source_count() from public, anon, authenticated;
grant execute on function private.studio2_sync_story_source_count() to service_role;

drop trigger if exists studio2_story_source_count_sync on public.studio2_contest_events;
create trigger studio2_story_source_count_sync
after insert on public.studio2_contest_events
for each row
when (new.type in ('storyline.generated', 'storyline.updated', 'storyline.published', 'storyline.unpublished'))
execute function private.studio2_sync_story_source_count();

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
  where edition_id = p_edition_id
    and type not like 'storyline.%';

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
  select s, e into v_story, v_edition
  from public.studio2_storylines s
  join public.editions e on e.id = s.edition_id
  where e.slug = p_edition_slug
    and e.published
    and s.status = 'published'
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
  where i.storyline_id = v_story.id
    and i.included;

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

commit;
