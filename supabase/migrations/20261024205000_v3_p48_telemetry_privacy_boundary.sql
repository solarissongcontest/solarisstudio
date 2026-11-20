begin;

-- System V3 / P48: server-authoritative privacy minimisation for public telemetry.
-- New writes are normalized before privacy CHECKs run. Historical rows are moved
-- through the S13 resumable backfill contract instead of a deployment-time
-- full-table rewrite.
select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.p48.telemetry-privacy-boundary',
  1,
  'forward_fix_only',
  false,
  'v3.p48.telemetry-route-sanitization',
  'P48 server privacy boundary for public UX and Web Vitals route identity with resumable historical sanitization.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function public.studio2_telemetry_path_is_safe(
  p_value text,
  p_max_length integer default 512
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $safe$
  select
    p_max_length between 1 and 512
    and length(p_value) between 1 and p_max_length
    and left(p_value, 1) = '/'
    and p_value !~ '[?#%]'
    and p_value !~* '(^|/)[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}($|/)'
    and p_value !~ '(^|/)[A-Za-z0-9_-]{32,}($|/)'
    and p_value !~ '(^|/)[^/]*@[^/]*($|/)'
$safe$;

create or replace function public.studio2_telemetry_target_is_safe(
  p_value text
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $safe$
  select
    length(p_value) between 1 and 512
    and p_value !~* '^[a-z][a-z0-9+.-]*://'
    and position('%' in p_value) = 0
    and (
      (
        left(p_value, 1) = '/'
        and public.studio2_telemetry_path_is_safe(p_value, 512)
      )
      or (
        length(p_value) <= 120
        and p_value ~ '^[A-Za-z][A-Za-z0-9:_./-]{0,119}$'
        and p_value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        and p_value !~ '^[A-Za-z0-9_-]{32,}$'
      )
    )
$safe$;

revoke all on function public.studio2_telemetry_path_is_safe(text, integer)
  from public, anon, authenticated;
grant execute on function public.studio2_telemetry_path_is_safe(text, integer)
  to anon, authenticated, service_role;
revoke all on function public.studio2_telemetry_target_is_safe(text)
  from public, anon, authenticated;
grant execute on function public.studio2_telemetry_target_is_safe(text)
  to anon, authenticated, service_role;

create or replace function private.v3_p48_sanitize_telemetry_path(
  p_value text,
  p_max_length integer default 512
)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $sanitize$
declare
  v_path text := btrim(p_value);
  v_segment text;
  v_segments text[] := '{}'::text[];
  v_limit integer := greatest(1, least(coalesce(p_max_length, 512), 512));
begin
  if v_path = '' then
    return '/';
  end if;

  -- Path identity never retains query or fragment data.
  v_path := split_part(split_part(v_path, '#', 1), '?', 1);
  if v_path = '' then
    return '/';
  end if;
  if left(v_path, 1) <> '/' then
    return '/';
  end if;

  foreach v_segment in array string_to_array(v_path, '/') loop
    if v_segment = '' then
      v_segments := array_append(v_segments, v_segment);
    elsif position('%' in v_segment) > 0 then
      -- Do not attempt partial URL decoding in SQL. Any encoded segment is
      -- collapsed so encoded UUID/e-mail/token material cannot remain recoverable.
      v_segments := array_append(v_segments, ':value');
    elsif v_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_segments := array_append(v_segments, ':id');
    elsif v_segment ~ '^[A-Za-z0-9_-]{32,}$' then
      v_segments := array_append(v_segments, ':token');
    elsif position('@' in v_segment) > 0 then
      v_segments := array_append(v_segments, ':value');
    else
      v_segments := array_append(v_segments, v_segment);
    end if;
  end loop;

  v_path := array_to_string(v_segments, '/');
  if v_path = '' then
    v_path := '/';
  end if;

  v_path := left(v_path, v_limit);
  if not public.studio2_telemetry_path_is_safe(v_path, v_limit) then
    return '/';
  end if;
  return v_path;
end
$sanitize$;

create or replace function private.v3_p48_sanitize_telemetry_target(
  p_value text
)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = pg_catalog
as $sanitize$
declare
  v_target text := btrim(p_value);
  v_route text;
begin
  if v_target = '' then
    return null;
  end if;

  -- Absolute URLs are reduced to path identity only. Host/scheme never enter
  -- telemetry, and the resulting path receives the same identifier collapse.
  if v_target ~* '^[a-z][a-z0-9+.-]*://' then
    v_route := regexp_replace(v_target, '^[a-z][a-z0-9+.-]*://[^/]*', '', 'i');
    if v_route = '' then
      v_route := '/';
    end if;
    return private.v3_p48_sanitize_telemetry_path(v_route, 512);
  end if;

  if left(v_target, 1) = '/' then
    return private.v3_p48_sanitize_telemetry_path(v_target, 512);
  end if;

  if left(v_target, 2) = './' then
    return private.v3_p48_sanitize_telemetry_path(substr(v_target, 2), 512);
  end if;

  if left(v_target, 3) = '../' then
    return '/';
  end if;

  if length(v_target) <= 120
     and position('%' in v_target) = 0
     and v_target !~* '^[a-z][a-z0-9+.-]*://'
     and v_target ~ '^[A-Za-z][A-Za-z0-9:_./-]{0,119}$'
     and v_target !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and v_target !~ '^[A-Za-z0-9_-]{32,}$'
  then
    return v_target;
  end if;

  return null;
end
$sanitize$;

revoke all on function private.v3_p48_sanitize_telemetry_path(text, integer)
  from public, anon, authenticated;
revoke all on function private.v3_p48_sanitize_telemetry_target(text)
  from public, anon, authenticated;

create or replace function private.v3_p48_normalize_public_ux_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $normalize$
declare
  v_start_route text;
begin
  new.pathname := private.v3_p48_sanitize_telemetry_path(new.pathname, 512);
  if new.target is not null then
    new.target := private.v3_p48_sanitize_telemetry_target(new.target);
  end if;

  if new.metadata ? 'start_route' then
    if jsonb_typeof(new.metadata -> 'start_route') <> 'string' then
      new.metadata := new.metadata - 'start_route';
    else
      v_start_route := private.v3_p48_sanitize_telemetry_path(new.metadata ->> 'start_route', 120);
      new.metadata := jsonb_set(new.metadata, '{start_route}', to_jsonb(v_start_route), true);
    end if;
  end if;
  return new;
end
$normalize$;

create or replace function private.v3_p48_normalize_public_web_vital()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $normalize$
begin
  new.pathname := private.v3_p48_sanitize_telemetry_path(new.pathname, 512);
  return new;
end
$normalize$;

revoke all on function private.v3_p48_normalize_public_ux_event()
  from public, anon, authenticated;
revoke all on function private.v3_p48_normalize_public_web_vital()
  from public, anon, authenticated;

drop trigger if exists public_ux_events_p48_privacy_normalize on public.public_ux_events;
create trigger public_ux_events_p48_privacy_normalize
before insert or update of pathname, target, metadata on public.public_ux_events
for each row execute function private.v3_p48_normalize_public_ux_event();

drop trigger if exists public_web_vitals_p48_privacy_normalize on public.public_web_vitals;
create trigger public_web_vitals_p48_privacy_normalize
before insert or update of pathname on public.public_web_vitals
for each row execute function private.v3_p48_normalize_public_web_vital();

-- NOT VALID avoids a deployment-time historical table scan. PostgreSQL still
-- enforces these CHECKs for every new/updated row, after the normalization
-- triggers above. Historical rows are sanitized by the resumable S13 backfill.
alter table public.public_ux_events
  add constraint public_ux_events_path_privacy_check
  check (public.studio2_telemetry_path_is_safe(pathname, 512)) not valid;
alter table public.public_ux_events
  add constraint public_ux_events_target_privacy_check
  check (target is null or public.studio2_telemetry_target_is_safe(target)) not valid;
alter table public.public_ux_events
  add constraint public_ux_events_start_route_privacy_check
  check (
    not (metadata ? 'start_route')
    or (
      jsonb_typeof(metadata -> 'start_route') = 'string'
      and public.studio2_telemetry_path_is_safe(metadata ->> 'start_route', 120)
    )
  ) not valid;
alter table public.public_web_vitals
  add constraint public_web_vitals_path_privacy_check
  check (public.studio2_telemetry_path_is_safe(pathname, 512)) not valid;

create or replace function public.admin_run_p48_telemetry_privacy_backfill_batch(
  p_worker_id text,
  p_batch_size integer default 250
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $backfill$
declare
  v_claim jsonb;
  v_cursor jsonb;
  v_phase text;
  v_last_id uuid;
  v_ids uuid[];
  v_count integer := 0;
  v_next_id uuid;
  v_checkpoint jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_batch_size is null or p_batch_size not between 1 and 1000 then
    raise exception 'Backfill batch size must be between 1 and 1000' using errcode = '22023';
  end if;

  v_claim := public.v3_claim_backfill(
    'v3.p48.telemetry-route-sanitization',
    1,
    p_batch_size,
    p_worker_id,
    300,
    null
  );
  if v_claim ->> 'status' = 'completed' then
    return v_claim;
  end if;

  v_cursor := coalesce(v_claim -> 'cursor', '{}'::jsonb);
  v_phase := coalesce(v_cursor ->> 'phase', 'ux');
  if nullif(v_cursor ->> 'lastId', '') is not null then
    v_last_id := (v_cursor ->> 'lastId')::uuid;
  end if;

  if v_phase = 'ux' then
    select array_agg(id order by id)
    into v_ids
    from (
      select event_row.id
      from public.public_ux_events event_row
      where v_last_id is null or event_row.id > v_last_id
      order by event_row.id
      limit p_batch_size
    ) batch;

    v_count := coalesce(cardinality(v_ids), 0);
    if v_count = 0 then
      v_checkpoint := public.v3_checkpoint_backfill(
        'v3.p48.telemetry-route-sanitization', p_worker_id,
        jsonb_build_object('phase', 'vitals'), 0, 0, null, false
      );
      return jsonb_build_object('state', 'checkpointed', 'phase', 'vitals', 'processed', 0, 'job', v_checkpoint);
    end if;

    update public.public_ux_events event_row
    set pathname = private.v3_p48_sanitize_telemetry_path(event_row.pathname, 512),
        target = case when event_row.target is null then null else private.v3_p48_sanitize_telemetry_target(event_row.target) end,
        metadata = case
          when not (event_row.metadata ? 'start_route') then event_row.metadata
          when jsonb_typeof(event_row.metadata -> 'start_route') <> 'string' then event_row.metadata - 'start_route'
          else jsonb_set(
            event_row.metadata,
            '{start_route}',
            to_jsonb(private.v3_p48_sanitize_telemetry_path(event_row.metadata ->> 'start_route', 120)),
            true
          )
        end
    where event_row.id = any(v_ids);

    v_next_id := v_ids[v_count];
    v_checkpoint := public.v3_checkpoint_backfill(
      'v3.p48.telemetry-route-sanitization', p_worker_id,
      jsonb_build_object('phase', 'ux', 'lastId', v_next_id::text),
      v_count, 0, null, false
    );
    return jsonb_build_object('state', 'checkpointed', 'phase', 'ux', 'processed', v_count, 'job', v_checkpoint);
  end if;

  if v_phase = 'vitals' then
    select array_agg(id order by id)
    into v_ids
    from (
      select vital.id
      from public.public_web_vitals vital
      where v_last_id is null or vital.id > v_last_id
      order by vital.id
      limit p_batch_size
    ) batch;

    v_count := coalesce(cardinality(v_ids), 0);
    if v_count = 0 then
      v_checkpoint := public.v3_checkpoint_backfill(
        'v3.p48.telemetry-route-sanitization', p_worker_id,
        jsonb_build_object('phase', 'done'), 0, 0, null, true
      );
      return jsonb_build_object('state', 'completed', 'phase', 'done', 'processed', 0, 'job', v_checkpoint);
    end if;

    update public.public_web_vitals vital
    set pathname = private.v3_p48_sanitize_telemetry_path(vital.pathname, 512)
    where vital.id = any(v_ids);

    v_next_id := v_ids[v_count];
    v_checkpoint := public.v3_checkpoint_backfill(
      'v3.p48.telemetry-route-sanitization', p_worker_id,
      jsonb_build_object('phase', 'vitals', 'lastId', v_next_id::text),
      v_count, 0, null, false
    );
    return jsonb_build_object('state', 'checkpointed', 'phase', 'vitals', 'processed', v_count, 'job', v_checkpoint);
  end if;

  raise exception 'Unsupported telemetry privacy backfill cursor phase' using errcode = '22023';
end
$backfill$;

revoke all on function public.admin_run_p48_telemetry_privacy_backfill_batch(text, integer)
  from public, anon, authenticated;
grant execute on function public.admin_run_p48_telemetry_privacy_backfill_batch(text, integer)
  to service_role;

comment on function public.studio2_telemetry_path_is_safe(text, integer) is
  'P48 privacy-safe route invariant. Query/fragment/percent-encoded and raw UUID/token/e-mail route identity is forbidden after server normalization.';
comment on function public.studio2_telemetry_target_is_safe(text) is
  'P48 privacy-safe target invariant. Absolute URL schemes and encoded/raw identifiers are forbidden after server normalization.';
comment on function public.admin_run_p48_telemetry_privacy_backfill_batch(text, integer) is
  'S13 resumable P48 historical telemetry sanitizer. Processes at most the claimed batch size from one telemetry table per invocation.';

comment on table public.public_ux_events is
  'Privacy-minimised public UX telemetry. New route identity is normalized before constrained storage; historical identity is sanitized through the S13 resumable backfill.';
comment on table public.public_web_vitals is
  'Privacy-minimised public Web Vitals telemetry. New route identity is normalized before constrained storage; historical identity is sanitized through the S13 resumable backfill.';

notify pgrst, 'reload schema';
commit;
