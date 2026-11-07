#!/usr/bin/env bash
set -euo pipefail

container="${V3_S14_PG_CONTAINER:-solaris-pg1711}"
database="${V3_S14_PG_DATABASE:-postgres}"
user="${V3_S14_PG_USER:-postgres}"
candidate="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/v3/recovery-candidates/forward-only-s14-televote-source-truth-local.sql"

docker rm -f "$container" >/dev/null 2>&1 || true
docker run --name "$container" -e POSTGRES_PASSWORD=postgres -d postgres:17.11-alpine >/dev/null
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT

until docker exec "$container" pg_isready -U "$user" -d "$database" >/dev/null 2>&1; do
  sleep 1
done

psql() {
  docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U "$user" -d "$database" "$@"
}

psql <<'SQL'
create extension if not exists pgcrypto;
create schema if not exists extensions;
create schema if not exists private;
create schema if not exists televoting;
create role authenticated nologin;
create role anon nologin;
create role service_role nologin;
create role service_worker nologin;
create role app_user nologin;
grant service_role to service_worker;
create schema if not exists public;
create table public.editions (id uuid primary key);
create table public.shows (
  id uuid primary key,
  edition_id uuid not null references public.editions(id)
);
create table public.participants (
  id uuid primary key default gen_random_uuid(),
  show_id uuid not null references public.shows(id),
  country_id uuid,
  contest_entity_id uuid,
  participation_status text default 'confirmed'
);
create table public.televote_votes (
  id bigint generated always as identity primary key,
  edition_id uuid not null references public.editions(id),
  show_id uuid not null references public.shows(id),
  country_id uuid,
  contest_entity_id uuid,
  points integer not null
);
create table public.countries (id uuid primary key, short_code text not null);
create table public.televoting_round_bindings (
  remote_round_id text primary key,
  edition_id uuid not null,
  show_id uuid not null
);
create table televoting.rounds (
  id uuid primary key,
  results_status text not null,
  results_outdated boolean not null default false,
  broadcast_display_mode text not null default 'round',
  calculation_version integer not null,
  calculated_at timestamptz,
  updated_at timestamptz default now()
);
create table televoting.round_results (
  round_id uuid not null,
  calculation_version integer not null,
  country_code text not null,
  final_points integer not null
);
create table televoting.televote_aggregations (
  id uuid primary key,
  status text not null,
  results_outdated boolean not null default false,
  calculation_version integer not null,
  calculated_at timestamptz,
  updated_at timestamptz default now(),
  published_at timestamptz
);
create table televoting.televote_aggregation_sources (
  aggregation_id uuid not null,
  source_round_id uuid,
  enabled boolean not null default true
);
create table televoting.combined_televote_results (
  aggregation_id uuid not null,
  calculation_version integer not null,
  country_code text not null,
  final_combined_points integer not null
);
create function extensions.digest(bytea, text) returns bytea
language sql immutable as $$ select public.digest($1, $2) $$;
create function private.studio2_request_is_service_role()
returns boolean language sql stable as $$ select current_user = 'postgres' $$;
create function public.studio2_access_allowed(text, uuid, boolean)
returns boolean language sql stable as $$ select current_user = 'postgres' $$;
create function public.sync_show_results_from_votes(uuid)
returns void language plpgsql as $$ begin return; end $$;
create function private.v3_security_definer_role_probe()
returns jsonb
language sql
security definer
set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'currentUser', current_user,
    'sessionUser', session_user,
    'effectiveRole', current_setting('role', true)
  )
$$;
create function extensions.v3_assert(boolean, text)
returns void language plpgsql as $$
begin if not $1 then raise exception '%', $2; end if; end $$;
grant usage on schema public, private, extensions to app_user;
grant insert, update, delete, select on public.televote_votes to app_user;
grant usage on schema public, private, televoting, extensions to service_role;
grant select, insert, update, delete on public.televote_votes to service_role;
insert into public.editions values ('00000000-0000-0000-0000-000000000001');
insert into public.shows values ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001');
insert into public.participants(show_id, country_id, contest_entity_id) values
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000011', null),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000012', null);
insert into public.countries values
  ('00000000-0000-0000-0000-000000000011', 'AA'),
  ('00000000-0000-0000-0000-000000000012', 'BB');
insert into public.televoting_round_bindings values
  ('00000000-0000-0000-0000-000000000003',
   '00000000-0000-0000-0000-000000000001',
   '00000000-0000-0000-0000-000000000002');
insert into televoting.rounds values
  ('00000000-0000-0000-0000-000000000003', 'published', false, 'round', 1,
   '2026-01-01T00:00:00Z', now());
insert into televoting.round_results values
  ('00000000-0000-0000-0000-000000000003', 1, 'AA', 12),
  ('00000000-0000-0000-0000-000000000003', 1, 'BB', 10);
insert into televoting.televote_aggregations values
  ('00000000-0000-0000-0000-000000000004', 'published', false, 1,
   '2026-01-03T00:00:00Z', now(), '2026-01-03T00:00:00Z');
insert into televoting.televote_aggregation_sources values
  ('00000000-0000-0000-0000-000000000004',
   '00000000-0000-0000-0000-000000000003', true);
insert into televoting.combined_televote_results values
  ('00000000-0000-0000-0000-000000000004', 1, 'AA', 24),
  ('00000000-0000-0000-0000-000000000004', 1, 'BB', 20);
SQL

guard="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/v3/recovery-candidates/forward-only-s14-televote-provenance-guard-local.sql"
docker cp "$guard" "$container:/tmp/s14-provenance-guard.sql"
docker cp "$candidate" "$container:/tmp/s14-source-truth.sql"
psql -f /tmp/s14-provenance-guard.sql
psql -f /tmp/s14-source-truth.sql

psql <<'SQL'
set role app_user;
select extensions.v3_assert(
  (private.v3_security_definer_role_probe()->>'currentUser') = 'postgres'
  and (private.v3_security_definer_role_probe()->>'sessionUser') = 'postgres'
  and (private.v3_security_definer_role_probe()->>'effectiveRole') = 'app_user',
  'SECURITY DEFINER role/session context was not preserved'
);
reset role;
set role service_worker;
select extensions.v3_assert(
  (private.v3_security_definer_role_probe()->>'effectiveRole') = 'service_worker',
  'role membership did not preserve the effective worker role'
);
set role service_role;
set role service_role;
select extensions.v3_assert(
  (private.v3_sync_published_televote_round(
    '00000000-0000-0000-0000-000000000003'
  )->>'ok')::boolean,
  'published official round did not reach canonical projection'
);
select extensions.v3_assert(
  (select source_type = 'round' and source_id = '00000000-0000-0000-0000-000000000003'
   from private.v3_televote_result_projection_sources
   where show_id = '00000000-0000-0000-0000-000000000002'),
  'round source provenance was not recorded'
);
select extensions.v3_assert(
  (private.v3_apply_published_televote_projection(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'round',
    '00000000-0000-0000-0000-000000000003',
    1,
    '2026-01-01T00:00:00Z',
    '[{"country_id":"00000000-0000-0000-0000-000000000011","points":12},{"country_id":"00000000-0000-0000-0000-000000000012","points":10}]'
  )->>'ok')::boolean,
  'initial publication failed'
);
select extensions.v3_assert(
  (select count(distinct country_id) = 2 from public.televote_votes
   where show_id = '00000000-0000-0000-0000-000000000002'),
  'canonical projection recipients were not materialized'
);
select extensions.v3_assert(
  (private.v3_apply_published_televote_projection(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'round',
    '00000000-0000-0000-0000-000000000003',
    1,
    '2026-01-01T00:00:00Z',
    '[{"country_id":"00000000-0000-0000-0000-000000000011","points":12},{"country_id":"00000000-0000-0000-0000-000000000012","points":10}]'
  )->>'replayed')::boolean,
  'same source version was not idempotent'
);
do $$ begin
  perform private.v3_apply_published_televote_projection(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'round', '00000000-0000-0000-0000-000000000003', 1, '2026-01-01T00:00:00Z',
    '[{"country_id":"00000000-0000-0000-0000-000000000011","points":9},{"country_id":"00000000-0000-0000-0000-000000000012","points":10}]'
  );
  raise exception 'idempotency conflict was accepted';
exception when sqlstate 'P0001' then null;
end $$;
do $$ begin
  perform private.v3_apply_published_televote_projection(
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000002',
    'round', '00000000-0000-0000-0000-000000000003', 0, '2026-01-01T00:00:00Z',
    '[{"country_id":"00000000-0000-0000-0000-000000000011","points":12},{"country_id":"00000000-0000-0000-0000-000000000012","points":10}]'
  );
  raise exception 'invalid version was accepted';
exception when sqlstate '22023' then null;
end $$;
set role app_user;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('solaris.v3_televote_projection_write', '1', true);
do $$ begin
  insert into public.televote_votes(edition_id, show_id, country_id, points)
  values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002',
          '00000000-0000-0000-0000-000000000011', 1);
  raise exception 'direct managed projection write was accepted';
exception when sqlstate '42501' then null;
end $$;
reset role;
select set_config('request.jwt.claim.role', '', true);
select set_config('solaris.v3_televote_projection_write', '', true);
set role service_role;
select extensions.v3_assert(
  (private.v3_sync_published_televote_aggregation(
    '00000000-0000-0000-0000-000000000004'
  )->>'ok')::boolean,
  'published combined result did not reach canonical projection'
);
select extensions.v3_assert(
  (select source_type = 'combined' and source_id = '00000000-0000-0000-0000-000000000004'
   from private.v3_televote_result_projection_sources
   where show_id = '00000000-0000-0000-0000-000000000002'),
  'combined source provenance was not recorded'
);
select extensions.v3_assert(
  (public.studio2_televote_projection_status('00000000-0000-0000-0000-000000000002')->>'managed')::boolean,
  'projection status did not report managed source truth'
);
SQL

echo "S14 source-truth recovery rehearsal passed"
