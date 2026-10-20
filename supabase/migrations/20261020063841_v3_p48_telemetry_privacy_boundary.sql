begin;

-- System V3 / P48: make the database, not the browser, authoritative for
-- privacy-minimised public telemetry route identity.
--
-- The existing client sanitizers remain defense in depth. These constraints
-- protect direct/handcrafted inserts made through the public Data API too.
select public.v3_register_migration_contract(
  '20261020063841_v3_p48_telemetry_privacy_boundary',
  1,
  'forward_fix_only',
  false,
  null,
  'P48 privacy boundary for public UX and Web Vitals route identity'
);

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
    and p_value !~ '[?#]'
    and p_value !~* '(^|/)[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}($|/)'
    and p_value !~ '(^|/)[A-Za-z0-9_-]{32,}($|/)'
    and p_value !~ '(^|/)[^/]*@[^/]*($|/)'
    and lower(p_value) !~ '(^|/)[^/]*%40[^/]*($|/)'
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

comment on function public.studio2_telemetry_path_is_safe(text, integer) is
  'P48 server-owned telemetry route invariant: bounded route family only; no query/fragment, UUID, long secret-shaped or e-mail-shaped route segments.';
comment on function public.studio2_telemetry_target_is_safe(text) is
  'P48 server-owned telemetry target invariant: privacy-safe route family or bounded stable diagnostic token.';

-- Migration-only sanitizers let existing telemetry become valid without keeping
-- historical identifiers merely because they predate the server boundary.
create or replace function private.v3_p48_sanitize_telemetry_path(
  p_value text,
  p_max_length integer default 512
)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $sanitize$
declare
  v_path text := btrim(p_value);
  v_segment text;
  v_segments text[] := '{}'::text[];
begin
  if v_path = '' then
    return '/';
  end if;

  v_path := split_part(split_part(v_path, '#', 1), '?', 1);
  if v_path = '' then
    return '/';
  end if;
  if left(v_path, 1) <> '/' then
    return null;
  end if;

  foreach v_segment in array string_to_array(v_path, '/') loop
    if v_segment ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      v_segment := ':id';
    elsif v_segment ~ '^[A-Za-z0-9_-]{32,}$' then
      v_segment := ':token';
    elsif position('@' in v_segment) > 0 or lower(v_segment) like '%\%40%' escape '\' then
      v_segment := ':value';
    end if;
    v_segments := array_append(v_segments, v_segment);
  end loop;

  v_path := array_to_string(v_segments, '/');
  if v_path = '' then
    v_path := '/';
  end if;
  return left(v_path, greatest(1, least(coalesce(p_max_length, 512), 512)));
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
set search_path = ''
as $sanitize$
declare
  v_target text := btrim(p_value);
  v_route text;
begin
  if v_target = '' then
    return null;
  end if;

  if v_target ~* '^https?://' then
    v_route := regexp_replace(v_target, '^https?://[^/]*', '', 'i');
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
     and v_target ~ '^[A-Za-z][A-Za-z0-9:_./-]{0,119}$'
     and v_target !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     and v_target !~ '^[A-Za-z0-9_-]{32,}$'
  then
    return v_target;
  end if;

  return null;
end
$sanitize$;

update public.public_ux_events
set pathname = private.v3_p48_sanitize_telemetry_path(pathname, 512)
where pathname is distinct from private.v3_p48_sanitize_telemetry_path(pathname, 512);

update public.public_ux_events
set target = private.v3_p48_sanitize_telemetry_target(target)
where target is not null
  and target is distinct from private.v3_p48_sanitize_telemetry_target(target);

update public.public_ux_events
set metadata = case
  when private.v3_p48_sanitize_telemetry_path(metadata ->> 'start_route', 120) is null
    then metadata - 'start_route'
  else jsonb_set(
    metadata,
    '{start_route}',
    to_jsonb(private.v3_p48_sanitize_telemetry_path(metadata ->> 'start_route', 120)),
    true
  )
end
where metadata ? 'start_route'
  and (
    jsonb_typeof(metadata -> 'start_route') <> 'string'
    or metadata ->> 'start_route' is distinct from
      private.v3_p48_sanitize_telemetry_path(metadata ->> 'start_route', 120)
  );

update public.public_web_vitals
set pathname = private.v3_p48_sanitize_telemetry_path(pathname, 512)
where pathname is distinct from private.v3_p48_sanitize_telemetry_path(pathname, 512);

alter table public.public_ux_events
  add constraint public_ux_events_path_privacy_check
  check (public.studio2_telemetry_path_is_safe(pathname, 512))
  not valid;

alter table public.public_ux_events
  add constraint public_ux_events_target_privacy_check
  check (target is null or public.studio2_telemetry_target_is_safe(target))
  not valid;

alter table public.public_ux_events
  add constraint public_ux_events_start_route_privacy_check
  check (
    not (metadata ? 'start_route')
    or (
      jsonb_typeof(metadata -> 'start_route') = 'string'
      and public.studio2_telemetry_path_is_safe(metadata ->> 'start_route', 120)
    )
  )
  not valid;

alter table public.public_web_vitals
  add constraint public_web_vitals_path_privacy_check
  check (public.studio2_telemetry_path_is_safe(pathname, 512))
  not valid;

alter table public.public_ux_events
  validate constraint public_ux_events_path_privacy_check;
alter table public.public_ux_events
  validate constraint public_ux_events_target_privacy_check;
alter table public.public_ux_events
  validate constraint public_ux_events_start_route_privacy_check;
alter table public.public_web_vitals
  validate constraint public_web_vitals_path_privacy_check;

drop function private.v3_p48_sanitize_telemetry_target(text);
drop function private.v3_p48_sanitize_telemetry_path(text, integer);

comment on table public.public_ux_events is
  'Privacy-minimised public UX telemetry. Database constraints reject raw route identifiers, query/fragment data, vote contents, integrity evidence, personal messages, form contents, raw search queries and other direct route identity.';
comment on table public.public_web_vitals is
  'Privacy-minimised public Web Vitals telemetry. Database constraints permit only sanitized route-family identity.';

notify pgrst, 'reload schema';

commit;
