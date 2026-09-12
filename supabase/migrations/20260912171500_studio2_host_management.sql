begin;

-- Studio 2 Phase 11 — Host Management
--
-- Existing editions.host_* and shows.host_* remain the canonical public host
-- location fields. Phase 11 adds the operational layer around them: bids,
-- evaluation, selection, readiness, stale-write protection and immutable
-- execution receipts. It intentionally does not create a second public host
-- location truth.

create table if not exists public.studio2_host_bids (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete restrict,
  city text not null check (length(btrim(city)) >= 2),
  venue_name text not null check (length(btrim(venue_name)) >= 2),
  venue_capacity integer check (venue_capacity is null or venue_capacity > 0),
  venue_address text,
  airport_summary text,
  transport_summary text,
  accommodation_beds integer check (accommodation_beds is null or accommodation_beds >= 0),
  production_summary text,
  sustainability_summary text,
  accessibility_summary text,
  local_broadcaster text,
  timezone text,
  latitude numeric(9,6) check (latitude is null or latitude between -90 and 90),
  longitude numeric(9,6) check (longitude is null or longitude between -180 and 180),
  supporting_links jsonb not null default '[]'::jsonb check (jsonb_typeof(supporting_links) = 'array'),
  status text not null default 'draft' check (status in (
    'draft', 'submitted', 'eligible', 'shortlisted', 'selected', 'rejected', 'withdrawn', 'superseded'
  )),
  revision bigint not null default 1 check (revision >= 1),
  submitted_at timestamptz,
  selected_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists studio2_host_bids_edition_status_idx
  on public.studio2_host_bids (edition_id, status, updated_at desc);
create index if not exists studio2_host_bids_country_idx
  on public.studio2_host_bids (country_id);
create index if not exists studio2_host_bids_created_by_idx
  on public.studio2_host_bids (created_by);
create index if not exists studio2_host_bids_updated_by_idx
  on public.studio2_host_bids (updated_by);
create unique index if not exists studio2_host_bids_one_selected_per_edition_idx
  on public.studio2_host_bids (edition_id)
  where status = 'selected';

create table if not exists public.studio2_host_bid_evaluations (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id) on delete cascade,
  bid_id uuid not null references public.studio2_host_bids(id) on delete cascade,
  criterion text not null check (criterion in (
    'technical', 'venue', 'transport', 'accommodation', 'security', 'cost',
    'broadcaster', 'accessibility', 'sustainability'
  )),
  score numeric(4,2) not null check (score between 0 and 10),
  comment text,
  evaluator_user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  unique (bid_id, criterion, evaluator_user_id)
);

create index if not exists studio2_host_bid_evaluations_edition_idx
  on public.studio2_host_bid_evaluations (edition_id, bid_id);
create index if not exists studio2_host_bid_evaluations_evaluator_idx
  on public.studio2_host_bid_evaluations (evaluator_user_id);

create table if not exists public.studio2_host_operations (
  edition_id uuid primary key references public.editions(id) on delete cascade,
  selected_bid_id uuid not null references public.studio2_host_bids(id) on delete restrict,
  revision bigint not null default 1 check (revision >= 1),
  venue_confirmed boolean not null default false,
  contracts_ready boolean not null default false,
  stage_access_ready boolean not null default false,
  technical_ready boolean not null default false,
  accreditation_ready boolean not null default false,
  hotels_ready boolean not null default false,
  transport_ready boolean not null default false,
  security_ready boolean not null default false,
  rehearsals_ready boolean not null default false,
  press_centre_ready boolean not null default false,
  accessibility_ready boolean not null default false,
  ceremonies_ready boolean not null default false,
  notes text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (selected_bid_id)
);

create index if not exists studio2_host_operations_updated_by_idx
  on public.studio2_host_operations (updated_by);

create table if not exists public.studio2_host_operation_executions (
  id uuid primary key default gen_random_uuid(),
  execution_id uuid not null unique,
  edition_id uuid not null references public.editions(id) on delete cascade,
  bid_id uuid references public.studio2_host_bids(id) on delete set null,
  action text not null check (action in (
    'create_bid', 'update_bid', 'submit_bid', 'mark_eligible', 'shortlist_bid',
    'reject_bid', 'withdraw_bid', 'select_bid', 'evaluate_bid',
    'update_operations', 'set_show_host', 'sync_show_hosts'
  )),
  reason text not null check (length(btrim(reason)) >= 5),
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists studio2_host_operation_executions_edition_idx
  on public.studio2_host_operation_executions (edition_id, created_at desc);
create index if not exists studio2_host_operation_executions_bid_idx
  on public.studio2_host_operation_executions (bid_id, created_at desc);
create index if not exists studio2_host_operation_executions_actor_idx
  on public.studio2_host_operation_executions (actor_user_id);

alter table public.studio2_host_bids enable row level security;
alter table public.studio2_host_bid_evaluations enable row level security;
alter table public.studio2_host_operations enable row level security;
alter table public.studio2_host_operation_executions enable row level security;

revoke all on table public.studio2_host_bids from public, anon, authenticated;
revoke all on table public.studio2_host_bid_evaluations from public, anon, authenticated;
revoke all on table public.studio2_host_operations from public, anon, authenticated;
revoke all on table public.studio2_host_operation_executions from public, anon, authenticated;

-- Add Phase 11 capabilities to the existing capability grant command. Existing
-- organizer users retain their broad compatibility access through has_role().
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
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
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
    'host.read', 'host.manage'
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

create or replace function private.studio2_can_read_host(
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
    or coalesce(private.studio2_user_has_capability(p_user_id, 'host.read', p_edition_id), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'host.manage', p_edition_id), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'edition.manage', p_edition_id), false);
$$;

create or replace function private.studio2_can_manage_host(
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
    or coalesce(private.studio2_user_has_capability(p_user_id, 'host.manage', p_edition_id), false)
    or coalesce(private.studio2_user_has_capability(p_user_id, 'edition.manage', p_edition_id), false);
$$;

revoke all on function private.studio2_can_read_host(uuid, uuid) from public, anon, authenticated;
revoke all on function private.studio2_can_manage_host(uuid, uuid) from public, anon, authenticated;
grant execute on function private.studio2_can_read_host(uuid, uuid) to service_role;
grant execute on function private.studio2_can_manage_host(uuid, uuid) to service_role;

create or replace function public.studio2_host_management_snapshot(p_edition_id uuid)
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
  v_bids jsonb := '[]'::jsonb;
  v_operations jsonb := null;
  v_shows jsonb := '[]'::jsonb;
begin
  if p_edition_id is null then
    raise exception 'Edition id is required' using errcode = '22023';
  end if;

  select * into v_edition from public.editions where id = p_edition_id;
  if not found then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;

  if not v_is_service and not private.studio2_can_read_host(v_actor, p_edition_id) then
    raise exception 'Missing Solaris capability: host.read' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'editionId', b.edition_id,
      'countryId', b.country_id,
      'countryName', c.name,
      'city', b.city,
      'venueName', b.venue_name,
      'venueCapacity', b.venue_capacity,
      'venueAddress', b.venue_address,
      'airportSummary', b.airport_summary,
      'transportSummary', b.transport_summary,
      'accommodationBeds', b.accommodation_beds,
      'productionSummary', b.production_summary,
      'sustainabilitySummary', b.sustainability_summary,
      'accessibilitySummary', b.accessibility_summary,
      'localBroadcaster', b.local_broadcaster,
      'timezone', b.timezone,
      'latitude', b.latitude,
      'longitude', b.longitude,
      'supportingLinks', b.supporting_links,
      'status', b.status,
      'revision', b.revision,
      'submittedAt', b.submitted_at,
      'selectedAt', b.selected_at,
      'createdAt', b.created_at,
      'updatedAt', b.updated_at,
      'evaluationCount', (
        select count(*) from public.studio2_host_bid_evaluations e where e.bid_id = b.id
      ),
      'averageScore', (
        select round(avg(e.score), 2) from public.studio2_host_bid_evaluations e where e.bid_id = b.id
      ),
      'evaluations', coalesce((
        select jsonb_agg(jsonb_build_object(
          'criterion', e.criterion,
          'score', e.score,
          'comment', e.comment,
          'evaluatorUserId', e.evaluator_user_id,
          'updatedAt', e.updated_at
        ) order by e.criterion, e.updated_at desc)
        from public.studio2_host_bid_evaluations e
        where e.bid_id = b.id
      ), '[]'::jsonb)
    )
    order by
      case b.status
        when 'selected' then 0
        when 'shortlisted' then 1
        when 'eligible' then 2
        when 'submitted' then 3
        when 'draft' then 4
        when 'superseded' then 5
        when 'rejected' then 6
        else 7
      end,
      b.updated_at desc
  ), '[]'::jsonb)
  into v_bids
  from public.studio2_host_bids b
  join public.countries c on c.id = b.country_id
  where b.edition_id = p_edition_id;

  select jsonb_build_object(
    'editionId', o.edition_id,
    'selectedBidId', o.selected_bid_id,
    'revision', o.revision,
    'readiness', jsonb_build_object(
      'venueConfirmed', o.venue_confirmed,
      'contractsReady', o.contracts_ready,
      'stageAccessReady', o.stage_access_ready,
      'technicalReady', o.technical_ready,
      'accreditationReady', o.accreditation_ready,
      'hotelsReady', o.hotels_ready,
      'transportReady', o.transport_ready,
      'securityReady', o.security_ready,
      'rehearsalsReady', o.rehearsals_ready,
      'pressCentreReady', o.press_centre_ready,
      'accessibilityReady', o.accessibility_ready,
      'ceremoniesReady', o.ceremonies_ready
    ),
    'notes', o.notes,
    'updatedAt', o.updated_at
  ) into v_operations
  from public.studio2_host_operations o
  where o.edition_id = p_edition_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'showId', s.id,
    'showName', s.name,
    'showKind', s.kind,
    'sortOrder', s.sort_order,
    'hostCountryId', s.host_country_id,
    'hostCountryName', c.name,
    'hostCity', s.host_city,
    'effectiveCountryId', coalesce(s.host_country_id, v_edition.host_country_id),
    'effectiveCity', coalesce(s.host_city, v_edition.host_city)
  ) order by s.sort_order, s.name), '[]'::jsonb)
  into v_shows
  from public.shows s
  left join public.countries c on c.id = s.host_country_id
  where s.edition_id = p_edition_id;

  return jsonb_build_object(
    'edition', jsonb_build_object(
      'id', v_edition.id,
      'name', v_edition.name,
      'slug', v_edition.slug,
      'hostCountryId', v_edition.host_country_id,
      'hostCity', v_edition.host_city
    ),
    'bids', v_bids,
    'operations', v_operations,
    'shows', v_shows
  );
end
$$;

revoke all on function public.studio2_host_management_snapshot(uuid) from public, anon;
grant execute on function public.studio2_host_management_snapshot(uuid) to authenticated, service_role;

create or replace function public.studio2_execute_host_operation(
  p_edition_id uuid,
  p_action text,
  p_reason text,
  p_execution_id uuid,
  p_bid_id uuid default null,
  p_expected_revision bigint default null,
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
  v_bid public.studio2_host_bids%rowtype;
  v_ops public.studio2_host_operations%rowtype;
  v_existing public.studio2_host_operation_executions%rowtype;
  v_result jsonb;
  v_country_id uuid;
  v_city text;
  v_venue_name text;
  v_show_id uuid;
  v_criterion text;
  v_score numeric;
  v_old_selected_id uuid;
  v_entity_type text := 'host_bid';
  v_entity_id text;
begin
  if p_edition_id is null or p_execution_id is null then
    raise exception 'Edition id and execution id are required' using errcode = '22023';
  end if;
  if p_action not in (
    'create_bid', 'update_bid', 'submit_bid', 'mark_eligible', 'shortlist_bid',
    'reject_bid', 'withdraw_bid', 'select_bid', 'evaluate_bid',
    'update_operations', 'set_show_host', 'sync_show_hosts'
  ) then
    raise exception 'Unsupported host operation: %', p_action using errcode = '22023';
  end if;
  if length(v_reason) < 5 then
    raise exception 'A host operation reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if jsonb_typeof(v_payload_input) <> 'object' then
    raise exception 'Host operation payload must be an object' using errcode = '22023';
  end if;
  if not exists (select 1 from public.editions e where e.id = p_edition_id) then
    raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
  end if;
  if not v_is_service and not private.studio2_can_manage_host(v_actor, p_edition_id) then
    raise exception 'Missing Solaris capability: host.manage' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('studio2-host:' || p_edition_id::text, 0));

  select * into v_existing
  from public.studio2_host_operation_executions e
  where e.execution_id = p_execution_id;
  if found then
    if v_existing.edition_id <> p_edition_id or v_existing.action <> p_action then
      raise exception 'Execution id was already used for a different host operation' using errcode = '23505';
    end if;
    return v_existing.payload || jsonb_build_object('idempotentReplay', true);
  end if;

  if p_action = 'create_bid' then
    v_country_id := nullif(v_payload_input ->> 'countryId', '')::uuid;
    v_city := btrim(coalesce(v_payload_input ->> 'city', ''));
    v_venue_name := btrim(coalesce(v_payload_input ->> 'venueName', ''));
    if v_country_id is null or length(v_city) < 2 or length(v_venue_name) < 2 then
      raise exception 'Host bid country, city and venue are required' using errcode = '22023';
    end if;
    if v_payload_input ? 'supportingLinks' and jsonb_typeof(v_payload_input -> 'supportingLinks') <> 'array' then
      raise exception 'supportingLinks must be an array' using errcode = '22023';
    end if;

    insert into public.studio2_host_bids (
      edition_id, country_id, city, venue_name, venue_capacity, venue_address,
      airport_summary, transport_summary, accommodation_beds, production_summary,
      sustainability_summary, accessibility_summary, local_broadcaster, timezone,
      latitude, longitude, supporting_links, created_by, updated_by
    ) values (
      p_edition_id,
      v_country_id,
      v_city,
      v_venue_name,
      nullif(v_payload_input ->> 'venueCapacity', '')::integer,
      nullif(btrim(v_payload_input ->> 'venueAddress'), ''),
      nullif(btrim(v_payload_input ->> 'airportSummary'), ''),
      nullif(btrim(v_payload_input ->> 'transportSummary'), ''),
      nullif(v_payload_input ->> 'accommodationBeds', '')::integer,
      nullif(btrim(v_payload_input ->> 'productionSummary'), ''),
      nullif(btrim(v_payload_input ->> 'sustainabilitySummary'), ''),
      nullif(btrim(v_payload_input ->> 'accessibilitySummary'), ''),
      nullif(btrim(v_payload_input ->> 'localBroadcaster'), ''),
      nullif(btrim(v_payload_input ->> 'timezone'), ''),
      nullif(v_payload_input ->> 'latitude', '')::numeric,
      nullif(v_payload_input ->> 'longitude', '')::numeric,
      coalesce(v_payload_input -> 'supportingLinks', '[]'::jsonb),
      v_actor,
      v_actor
    ) returning * into v_bid;

    p_bid_id := v_bid.id;

  else
    if p_bid_id is not null then
      select * into v_bid
      from public.studio2_host_bids b
      where b.id = p_bid_id and b.edition_id = p_edition_id
      for update;
      if not found then
        raise exception 'Host bid not found in this edition: %', p_bid_id using errcode = 'P0002';
      end if;
    end if;

    if p_action in (
      'update_bid', 'submit_bid', 'mark_eligible', 'shortlist_bid', 'reject_bid',
      'withdraw_bid', 'select_bid', 'evaluate_bid'
    ) then
      if p_bid_id is null then
        raise exception 'Host bid id is required for %', p_action using errcode = '22023';
      end if;
      if p_expected_revision is null or p_expected_revision <> v_bid.revision then
        raise exception 'Host bid changed since this action was loaded. Refresh before continuing.' using errcode = '40001';
      end if;
    end if;

    if p_action = 'update_bid' then
      if v_bid.status not in ('draft', 'submitted', 'eligible', 'shortlisted') then
        raise exception 'This host bid is read-only in status %', v_bid.status using errcode = '55000';
      end if;
      if v_payload_input ? 'supportingLinks' and jsonb_typeof(v_payload_input -> 'supportingLinks') <> 'array' then
        raise exception 'supportingLinks must be an array' using errcode = '22023';
      end if;

      update public.studio2_host_bids
      set country_id = case when v_payload_input ? 'countryId' then nullif(v_payload_input ->> 'countryId', '')::uuid else country_id end,
          city = case when v_payload_input ? 'city' then btrim(v_payload_input ->> 'city') else city end,
          venue_name = case when v_payload_input ? 'venueName' then btrim(v_payload_input ->> 'venueName') else venue_name end,
          venue_capacity = case when v_payload_input ? 'venueCapacity' then nullif(v_payload_input ->> 'venueCapacity', '')::integer else venue_capacity end,
          venue_address = case when v_payload_input ? 'venueAddress' then nullif(btrim(v_payload_input ->> 'venueAddress'), '') else venue_address end,
          airport_summary = case when v_payload_input ? 'airportSummary' then nullif(btrim(v_payload_input ->> 'airportSummary'), '') else airport_summary end,
          transport_summary = case when v_payload_input ? 'transportSummary' then nullif(btrim(v_payload_input ->> 'transportSummary'), '') else transport_summary end,
          accommodation_beds = case when v_payload_input ? 'accommodationBeds' then nullif(v_payload_input ->> 'accommodationBeds', '')::integer else accommodation_beds end,
          production_summary = case when v_payload_input ? 'productionSummary' then nullif(btrim(v_payload_input ->> 'productionSummary'), '') else production_summary end,
          sustainability_summary = case when v_payload_input ? 'sustainabilitySummary' then nullif(btrim(v_payload_input ->> 'sustainabilitySummary'), '') else sustainability_summary end,
          accessibility_summary = case when v_payload_input ? 'accessibilitySummary' then nullif(btrim(v_payload_input ->> 'accessibilitySummary'), '') else accessibility_summary end,
          local_broadcaster = case when v_payload_input ? 'localBroadcaster' then nullif(btrim(v_payload_input ->> 'localBroadcaster'), '') else local_broadcaster end,
          timezone = case when v_payload_input ? 'timezone' then nullif(btrim(v_payload_input ->> 'timezone'), '') else timezone end,
          latitude = case when v_payload_input ? 'latitude' then nullif(v_payload_input ->> 'latitude', '')::numeric else latitude end,
          longitude = case when v_payload_input ? 'longitude' then nullif(v_payload_input ->> 'longitude', '')::numeric else longitude end,
          supporting_links = case when v_payload_input ? 'supportingLinks' then v_payload_input -> 'supportingLinks' else supporting_links end,
          revision = revision + 1,
          updated_by = v_actor,
          updated_at = now()
      where id = p_bid_id
      returning * into v_bid;

    elsif p_action = 'submit_bid' then
      if v_bid.status <> 'draft' then
        raise exception 'Only draft host bids can be submitted' using errcode = '55000';
      end if;
      update public.studio2_host_bids
      set status = 'submitted', submitted_at = now(), revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = p_bid_id returning * into v_bid;

    elsif p_action = 'mark_eligible' then
      if v_bid.status <> 'submitted' then
        raise exception 'Only submitted host bids can be marked eligible' using errcode = '55000';
      end if;
      update public.studio2_host_bids
      set status = 'eligible', revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = p_bid_id returning * into v_bid;

    elsif p_action = 'shortlist_bid' then
      if v_bid.status <> 'eligible' then
        raise exception 'Only eligible host bids can be shortlisted' using errcode = '55000';
      end if;
      update public.studio2_host_bids
      set status = 'shortlisted', revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = p_bid_id returning * into v_bid;

    elsif p_action = 'reject_bid' then
      if v_bid.status not in ('submitted', 'eligible', 'shortlisted') then
        raise exception 'This host bid cannot be rejected from status %', v_bid.status using errcode = '55000';
      end if;
      update public.studio2_host_bids
      set status = 'rejected', revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = p_bid_id returning * into v_bid;

    elsif p_action = 'withdraw_bid' then
      if v_bid.status not in ('draft', 'submitted', 'eligible', 'shortlisted') then
        raise exception 'This host bid cannot be withdrawn from status %', v_bid.status using errcode = '55000';
      end if;
      update public.studio2_host_bids
      set status = 'withdrawn', revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = p_bid_id returning * into v_bid;

    elsif p_action = 'evaluate_bid' then
      if v_actor is null then
        raise exception 'An authenticated evaluator is required' using errcode = '42501';
      end if;
      if v_bid.status not in ('submitted', 'eligible', 'shortlisted') then
        raise exception 'Only submitted, eligible or shortlisted bids can be evaluated' using errcode = '55000';
      end if;
      v_criterion := v_payload_input ->> 'criterion';
      if v_criterion not in (
        'technical', 'venue', 'transport', 'accommodation', 'security', 'cost',
        'broadcaster', 'accessibility', 'sustainability'
      ) then
        raise exception 'Unknown host evaluation criterion: %', v_criterion using errcode = '22023';
      end if;
      v_score := nullif(v_payload_input ->> 'score', '')::numeric;
      if v_score is null or v_score < 0 or v_score > 10 then
        raise exception 'Host evaluation score must be between 0 and 10' using errcode = '22023';
      end if;

      insert into public.studio2_host_bid_evaluations (
        edition_id, bid_id, criterion, score, comment, evaluator_user_id
      ) values (
        p_edition_id, p_bid_id, v_criterion, v_score,
        nullif(btrim(v_payload_input ->> 'comment'), ''), v_actor
      )
      on conflict (bid_id, criterion, evaluator_user_id)
      do update set score = excluded.score, comment = excluded.comment, updated_at = now();

      update public.studio2_host_bids
      set revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = p_bid_id returning * into v_bid;

    elsif p_action = 'select_bid' then
      if v_bid.status not in ('eligible', 'shortlisted') then
        raise exception 'Only eligible or shortlisted host bids can be selected' using errcode = '55000';
      end if;

      select b.id into v_old_selected_id
      from public.studio2_host_bids b
      where b.edition_id = p_edition_id and b.status = 'selected' and b.id <> p_bid_id
      limit 1;

      if v_old_selected_id is not null then
        update public.studio2_host_bids
        set status = 'superseded', revision = revision + 1, updated_by = v_actor, updated_at = now()
        where id = v_old_selected_id;
      end if;

      update public.studio2_host_bids
      set status = 'selected', selected_at = now(), revision = revision + 1, updated_by = v_actor, updated_at = now()
      where id = p_bid_id returning * into v_bid;

      insert into public.studio2_host_operations (
        edition_id, selected_bid_id, updated_by
      ) values (
        p_edition_id, p_bid_id, v_actor
      )
      on conflict (edition_id) do update set
        selected_bid_id = excluded.selected_bid_id,
        revision = public.studio2_host_operations.revision + 1,
        venue_confirmed = false,
        contracts_ready = false,
        stage_access_ready = false,
        technical_ready = false,
        accreditation_ready = false,
        hotels_ready = false,
        transport_ready = false,
        security_ready = false,
        rehearsals_ready = false,
        press_centre_ready = false,
        accessibility_ready = false,
        ceremonies_ready = false,
        notes = null,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning * into v_ops;

      -- Existing public edition host fields remain canonical for public pages.
      update public.editions
      set host_country_id = v_bid.country_id,
          host_city = v_bid.city,
          data_revision = data_revision + 1
      where id = p_edition_id;

    elsif p_action in ('update_operations', 'set_show_host', 'sync_show_hosts') then
      select * into v_ops
      from public.studio2_host_operations o
      where o.edition_id = p_edition_id
      for update;
      if not found then
        raise exception 'Select a host bid before editing host operations' using errcode = '55000';
      end if;
      if p_expected_revision is null or p_expected_revision <> v_ops.revision then
        raise exception 'Host operations changed since this action was loaded. Refresh before continuing.' using errcode = '40001';
      end if;

      select * into v_bid
      from public.studio2_host_bids b
      where b.id = v_ops.selected_bid_id and b.edition_id = p_edition_id;

      if p_action = 'update_operations' then
        update public.studio2_host_operations
        set venue_confirmed = case when v_payload_input ? 'venueConfirmed' then (v_payload_input ->> 'venueConfirmed')::boolean else venue_confirmed end,
            contracts_ready = case when v_payload_input ? 'contractsReady' then (v_payload_input ->> 'contractsReady')::boolean else contracts_ready end,
            stage_access_ready = case when v_payload_input ? 'stageAccessReady' then (v_payload_input ->> 'stageAccessReady')::boolean else stage_access_ready end,
            technical_ready = case when v_payload_input ? 'technicalReady' then (v_payload_input ->> 'technicalReady')::boolean else technical_ready end,
            accreditation_ready = case when v_payload_input ? 'accreditationReady' then (v_payload_input ->> 'accreditationReady')::boolean else accreditation_ready end,
            hotels_ready = case when v_payload_input ? 'hotelsReady' then (v_payload_input ->> 'hotelsReady')::boolean else hotels_ready end,
            transport_ready = case when v_payload_input ? 'transportReady' then (v_payload_input ->> 'transportReady')::boolean else transport_ready end,
            security_ready = case when v_payload_input ? 'securityReady' then (v_payload_input ->> 'securityReady')::boolean else security_ready end,
            rehearsals_ready = case when v_payload_input ? 'rehearsalsReady' then (v_payload_input ->> 'rehearsalsReady')::boolean else rehearsals_ready end,
            press_centre_ready = case when v_payload_input ? 'pressCentreReady' then (v_payload_input ->> 'pressCentreReady')::boolean else press_centre_ready end,
            accessibility_ready = case when v_payload_input ? 'accessibilityReady' then (v_payload_input ->> 'accessibilityReady')::boolean else accessibility_ready end,
            ceremonies_ready = case when v_payload_input ? 'ceremoniesReady' then (v_payload_input ->> 'ceremoniesReady')::boolean else ceremonies_ready end,
            notes = case when v_payload_input ? 'notes' then nullif(btrim(v_payload_input ->> 'notes'), '') else notes end,
            revision = revision + 1,
            updated_by = v_actor,
            updated_at = now()
        where edition_id = p_edition_id returning * into v_ops;

      elsif p_action = 'set_show_host' then
        v_show_id := nullif(v_payload_input ->> 'showId', '')::uuid;
        if v_show_id is null or not exists (
          select 1 from public.shows s where s.id = v_show_id and s.edition_id = p_edition_id
        ) then
          raise exception 'Show does not belong to this edition' using errcode = '22023';
        end if;
        update public.shows
        set host_country_id = nullif(v_payload_input ->> 'countryId', '')::uuid,
            host_city = nullif(btrim(v_payload_input ->> 'city'), ''),
            updated_at = now()
        where id = v_show_id;
        update public.studio2_host_operations
        set revision = revision + 1, updated_by = v_actor, updated_at = now()
        where edition_id = p_edition_id returning * into v_ops;
        v_entity_type := 'show';
        v_entity_id := v_show_id::text;

      else
        update public.shows
        set host_country_id = v_bid.country_id,
            host_city = v_bid.city,
            updated_at = now()
        where edition_id = p_edition_id;
        update public.studio2_host_operations
        set revision = revision + 1, updated_by = v_actor, updated_at = now()
        where edition_id = p_edition_id returning * into v_ops;
        v_entity_type := 'edition';
        v_entity_id := p_edition_id::text;
      end if;
    end if;
  end if;

  if v_entity_id is null then
    v_entity_id := coalesce(p_bid_id::text, p_edition_id::text);
  end if;

  v_result := jsonb_build_object(
    'executionId', p_execution_id,
    'editionId', p_edition_id,
    'bidId', p_bid_id,
    'action', p_action,
    'reason', v_reason,
    'bidRevision', case when p_bid_id is not null then v_bid.revision else null end,
    'operationsRevision', case when v_ops.edition_id is not null then v_ops.revision else null end,
    'idempotentReplay', false
  );

  insert into public.studio2_host_operation_executions (
    execution_id, edition_id, bid_id, action, reason, actor_user_id, payload
  ) values (
    p_execution_id, p_edition_id, p_bid_id, p_action, v_reason, v_actor, v_result
  );

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
  ) values (
    p_edition_id,
    'rule.changed',
    v_actor,
    v_entity_type,
    v_entity_id,
    jsonb_build_object(
      'changeKind', 'host.' || p_action,
      'action', p_action,
      'executionId', p_execution_id,
      'bidId', p_bid_id,
      'reason', v_reason,
      'bidRevision', case when p_bid_id is not null then v_bid.revision else null end,
      'operationsRevision', case when v_ops.edition_id is not null then v_ops.revision else null end
    )
  );

  return v_result;
end
$$;

revoke all on function public.studio2_execute_host_operation(uuid, text, text, uuid, uuid, bigint, jsonb) from public, anon;
grant execute on function public.studio2_execute_host_operation(uuid, text, text, uuid, uuid, bigint, jsonb) to authenticated, service_role;

commit;
