-- V3 System / issue #585
-- Replace Organizer's row-by-row browser writes for official aggregate Televote
-- totals with one server-authoritative, atomic, idempotent command.

create table if not exists public.studio2_televote_total_versions (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create index if not exists studio2_televote_total_versions_edition_idx
  on public.studio2_televote_total_versions (edition_id);

alter table public.studio2_televote_total_versions enable row level security;
revoke all on table public.studio2_televote_total_versions from public, anon, authenticated;
grant all on table public.studio2_televote_total_versions to service_role;

comment on table public.studio2_televote_total_versions is
  'CAS version authority for one show aggregate Televote totals snapshot. Official totals remain in public.televote_votes.';

create or replace function private.studio2_televote_totals_projection(
  p_show_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $projection$
declare
  v_edition_id uuid;
  v_version bigint := 0;
  v_locked boolean := false;
  v_results_public boolean := false;
  v_totals jsonb := '[]'::jsonb;
begin
  select s.edition_id
  into v_edition_id
  from public.shows s
  where s.id = p_show_id;

  if v_edition_id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  select coalesce(v.version, 0)
  into v_version
  from public.studio2_televote_total_versions v
  where v.show_id = p_show_id;
  v_version := coalesce(v_version, 0);

  select coalesce(r.locked_version is not null, false)
  into v_locked
  from public.studio2_result_operations r
  where r.show_id = p_show_id;
  v_locked := coalesce(v_locked, false);

  select coalesce(
    c.state = 'public'
    and coalesce((c.frozen_config ->> 'results')::boolean, false),
    false
  )
  into v_results_public
  from public.studio2_show_publication_controls c
  where c.show_id = p_show_id;
  v_results_public := coalesce(v_results_public, false);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'contestEntityId', rows.contest_entity_id,
        'countryId', rows.country_id,
        'points', rows.points
      )
      order by rows.sort_order, rows.participant_id
    ),
    '[]'::jsonb
  )
  into v_totals
  from (
    select
      p.id as participant_id,
      p.contest_entity_id,
      p.country_id,
      coalesce(p.running_order, 2147483647) as sort_order,
      coalesce(tv.points, 0) as points
    from public.participants p
    left join lateral (
      select existing.points
      from public.televote_votes existing
      where existing.show_id = p_show_id
        and (
          existing.contest_entity_id = p.contest_entity_id
          or (
            existing.contest_entity_id is null
            and p.country_id is not null
            and existing.country_id = p.country_id
          )
        )
      order by
        (existing.contest_entity_id = p.contest_entity_id) desc,
        existing.created_at desc,
        existing.id desc
      limit 1
    ) tv on true
    where p.show_id = p_show_id
  ) rows;

  return jsonb_build_object(
    'showId', p_show_id,
    'editionId', v_edition_id,
    'version', v_version,
    'locked', v_locked,
    'resultsPublished', v_results_public,
    'totals', v_totals,
    'serverTime', now()
  );
end
$projection$;

revoke all on function private.studio2_televote_totals_projection(uuid)
  from public, anon, authenticated;

create or replace function public.studio2_get_televote_totals_snapshot(
  p_show_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $read_snapshot$
declare
  v_snapshot jsonb;
  v_edition_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  v_snapshot := private.studio2_televote_totals_projection(p_show_id);
  v_edition_id := (v_snapshot ->> 'editionId')::uuid;

  if not public.studio2_access_allowed('voting.read', v_edition_id, false)
     and not public.studio2_access_allowed('voting.manage', v_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  return v_snapshot;
end
$read_snapshot$;

revoke all on function public.studio2_get_televote_totals_snapshot(uuid)
  from public, anon;
grant execute on function public.studio2_get_televote_totals_snapshot(uuid)
  to authenticated, service_role;

create or replace function public.studio2_replace_televote_totals(
  p_show_id uuid,
  p_expected_version bigint,
  p_totals jsonb,
  p_operation_id uuid,
  p_idempotency_key text,
  p_reason text default null,
  p_correlation_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $replace_totals$
declare
  v_actor uuid := auth.uid();
  v_show public.shows%rowtype;
  v_claim jsonb;
  v_item jsonb;
  v_entity_id uuid;
  v_country_id uuid;
  v_points_numeric numeric;
  v_points integer;
  v_seen uuid[] := array[]::uuid[];
  v_normalized jsonb := '[]'::jsonb;
  v_payload_count integer := 0;
  v_participant_count integer := 0;
  v_identified_count integer := 0;
  v_distinct_entity_count integer := 0;
  v_current_version bigint := 0;
  v_next_version bigint;
  v_results_locked boolean := false;
  v_results_public boolean := false;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;

  select s.*
  into v_show
  from public.shows s
  where s.id = p_show_id;

  if v_show.id is null then
    raise exception using errcode = 'P0002', message = 'SHOW_NOT_FOUND';
  end if;

  if not public.studio2_access_allowed('voting.manage', v_show.edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if p_expected_version is null or p_expected_version < 0 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if jsonb_typeof(coalesce(p_totals, 'null'::jsonb)) <> 'array' then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;
  if p_operation_id is null
     or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  select
    count(*),
    count(p.contest_entity_id),
    count(distinct p.contest_entity_id)
  into
    v_participant_count,
    v_identified_count,
    v_distinct_entity_count
  from public.participants p
  where p.show_id = p_show_id;

  if v_participant_count <> v_identified_count
     or v_identified_count <> v_distinct_entity_count then
    raise exception using
      errcode = '23514',
      message = 'TELEVOTE_PARTICIPANT_IDENTITY_INVALID',
      hint = 'Every show participant must have one distinct canonical contest_entity_id.';
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_totals)
  loop
    if jsonb_typeof(v_item) <> 'object'
       or nullif(btrim(coalesce(v_item ->> 'contestEntityId', '')), '') is null
       or not (v_item ? 'points')
       or jsonb_typeof(v_item -> 'points') <> 'number' then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    begin
      v_entity_id := (v_item ->> 'contestEntityId')::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;

    if v_entity_id = any(v_seen) then
      raise exception using
        errcode = '23505',
        message = 'DUPLICATE_TELEVOTE_ENTITY';
    end if;

    begin
      v_points_numeric := (v_item ->> 'points')::numeric;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end;

    if v_points_numeric <> trunc(v_points_numeric)
       or v_points_numeric < -2147483648
       or v_points_numeric > 2147483647 then
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;
    v_points := v_points_numeric::integer;

    select p.country_id
    into v_country_id
    from public.participants p
    where p.show_id = p_show_id
      and p.contest_entity_id = v_entity_id;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'TELEVOTE_ENTITY_NOT_IN_SHOW';
    end if;

    v_seen := array_append(v_seen, v_entity_id);
    v_payload_count := v_payload_count + 1;
    v_normalized := v_normalized || jsonb_build_array(
      jsonb_build_object(
        'contestEntityId', v_entity_id,
        'countryId', v_country_id,
        'points', v_points
      )
    );
  end loop;

  if v_payload_count <> v_participant_count then
    raise exception using
      errcode = '23514',
      message = 'TELEVOTE_TOTAL_SET_INCOMPLETE',
      hint = 'Aggregate replacement must include each current show participant exactly once.';
  end if;

  select coalesce(jsonb_agg(value order by value ->> 'contestEntityId'), '[]'::jsonb)
  into v_normalized
  from jsonb_array_elements(v_normalized);

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    coalesce(p_correlation_id, p_operation_id),
    'televote.totals.replace',
    'R2',
    jsonb_build_object(
      'editionId', v_show.edition_id,
      'showId', p_show_id
    ),
    jsonb_build_object(
      'showId', p_show_id,
      'expectedVersion', p_expected_version,
      'totals', v_normalized,
      'reason', v_reason
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;

    return jsonb_build_object(
      'ok', false,
      'operationId', (v_claim ->> 'operationId')::uuid,
      'receiptId', (v_claim ->> 'operationId')::uuid,
      'status', v_claim ->> 'status',
      'error', v_claim -> 'error',
      'replayed', true,
      'reconciliationRequired', true,
      'serverTime', now()
    );
  end if;

  insert into public.studio2_televote_total_versions (
    show_id,
    edition_id,
    version,
    updated_by
  ) values (
    p_show_id,
    v_show.edition_id,
    0,
    v_actor
  )
  on conflict (show_id) do nothing;

  select v.version
  into v_current_version
  from public.studio2_televote_total_versions v
  where v.show_id = p_show_id
  for update;

  if v_current_version is distinct from p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      hint = format('Expected Televote totals version %s but current version is %s.', p_expected_version, v_current_version);
  end if;

  select coalesce(r.locked_version is not null, false)
  into v_results_locked
  from public.studio2_result_operations r
  where r.show_id = p_show_id;
  v_results_locked := coalesce(v_results_locked, false);

  select coalesce(
    c.state = 'public'
    and coalesce((c.frozen_config ->> 'results')::boolean, false),
    false
  )
  into v_results_public
  from public.studio2_show_publication_controls c
  where c.show_id = p_show_id;
  v_results_public := coalesce(v_results_public, false);

  if v_results_locked then
    raise exception using
      errcode = '55000',
      message = 'RESULTS_LOCKED',
      hint = 'Unlock the canonical result version before changing aggregate Televote totals.';
  end if;

  if v_results_public then
    raise exception using
      errcode = '55000',
      message = 'RESULTS_PUBLISHED',
      hint = 'Hide/unpublish the result surface before changing aggregate Televote totals.';
  end if;

  v_before := private.studio2_televote_totals_projection(p_show_id);

  delete from public.televote_votes
  where show_id = p_show_id;

  insert into public.televote_votes (
    id,
    edition_id,
    country_id,
    points,
    created_at,
    show_id,
    contest_entity_id
  )
  select
    gen_random_uuid(),
    v_show.edition_id,
    nullif(value ->> 'countryId', '')::uuid,
    (value ->> 'points')::integer,
    now(),
    p_show_id,
    (value ->> 'contestEntityId')::uuid
  from jsonb_array_elements(v_normalized);

  v_next_version := v_current_version + 1;

  update public.studio2_televote_total_versions
  set version = v_next_version,
      edition_id = v_show.edition_id,
      updated_at = now(),
      updated_by = v_actor
  where show_id = p_show_id;

  v_after := private.studio2_televote_totals_projection(p_show_id);

  insert into public.admin_audit_log (
    actor_id,
    action,
    table_name,
    record_id,
    edition_id,
    before_data,
    after_data
  ) values (
    v_actor,
    'televote.totals.replace',
    'televote_votes',
    p_show_id::text,
    v_show.edition_id,
    jsonb_build_object(
      'operationId', p_operation_id,
      'reason', v_reason,
      'snapshot', v_before
    ),
    jsonb_build_object(
      'operationId', p_operation_id,
      'reason', v_reason,
      'snapshot', v_after
    )
  );

  perform private.v3_emit_domain_event(
    'televote.totals_replaced',
    'televote_totals',
    p_show_id::text,
    v_next_version,
    p_operation_id,
    v_show.edition_id,
    p_show_id,
    jsonb_build_object(
      'beforeVersion', v_current_version,
      'afterVersion', v_next_version,
      'affectedCount', v_payload_count,
      'contestEntityIds', to_jsonb(v_seen),
      'reason', v_reason
    ),
    1,
    array[]::text[]
  );

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'receiptId', p_operation_id,
    'editionId', v_show.edition_id,
    'showId', p_show_id,
    'stateVersion', v_next_version,
    'totals', v_after -> 'totals',
    'replayed', false,
    'serverTime', now()
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result;
end
$replace_totals$;

revoke all on function public.studio2_replace_televote_totals(
  uuid, bigint, jsonb, uuid, text, text, uuid
) from public, anon;
grant execute on function public.studio2_replace_televote_totals(
  uuid, bigint, jsonb, uuid, text, text, uuid
) to authenticated, service_role;

comment on function public.studio2_replace_televote_totals(
  uuid, bigint, jsonb, uuid, text, text, uuid
) is
  'Atomically replaces one show complete official aggregate Televote total set using CAS, S2 idempotency/receipts and an S4 domain event. Negative integer totals remain valid for sanctions.';
