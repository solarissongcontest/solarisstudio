-- Synthetic S07 dependency fixture derived from #2404's rehearsal.
-- Not a hosted-equivalent reconstruction or a permission-engine implementation.
-- Actual canonical Results and ballot commands run in the separate Supabase job.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
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
-- The observed helper's implementation; no privileged-current_user stub.
create function private.studio2_request_is_service_role()
returns boolean language sql stable set search_path=pg_catalog
as $ select coalesce(current_setting('request.jwt.claim.role',true),'') = 'service_role' $;
revoke all on function private.studio2_request_is_service_role() from public,anon,authenticated,service_role;
create function public.studio2_access_allowed(text, uuid, boolean)
returns boolean language sql stable as $ select false $;
-- Dependency spy only: the separate full-source job exercises real Results.
create table private.s07_result_sync_calls(show_id uuid not null);
create function public.sync_show_results_from_votes(uuid)
returns void language plpgsql security definer set search_path=pg_catalog,public,private as $
begin
  if current_setting('solaris.s07_fail_results_sync',true)='1' then
    raise exception 'S07 injected Results failure' using errcode='P0001';
  end if;
  insert into private.s07_result_sync_calls values ($1);
end $;
create function public.sync_results_after_vote_change() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,private as $
begin
  perform public.sync_show_results_from_votes(coalesce(new.show_id,old.show_id));
  return coalesce(new,old);
end $;
create trigger s07_legacy_row_results_sync after insert or update or delete
on public.televote_votes for each row execute function public.sync_results_after_vote_change();
create function extensions.v3_assert(boolean, text)
returns void language plpgsql as $$
begin if $1 is distinct from true then raise exception '%', $2; end if; end $;
grant usage on schema public, private, extensions to app_user;
grant insert, update, delete, select on public.televote_votes to app_user;
grant usage on schema public, private, televoting, extensions to service_role;
grant select on public.televote_votes to service_role;
grant select on private.s07_result_sync_calls to service_role;
grant usage,select on all sequences in schema public to app_user;
grant usage on schema private,extensions to anon,authenticated;
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
-- Synthetic ledger sentinel: recovery must never mutate accepted ballot state.
create table televoting.vote_submissions(id integer primary key,status text not null);
insert into televoting.vote_submissions values (1,'accepted');


-- Canonical published-round metadata is owned by the server role in this fixture.
grant update on televoting.rounds to service_role;
