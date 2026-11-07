-- S14 synthetic fixture. Catalog-informed, NOT a production export. No real votes.
-- Observed hosted PostgreSQL 17.11: public.televote_votes exists and has RLS,
-- live studio2_platform_direct_write_guard BEFORE STATEMENT, and AFTER ROW
-- televote_votes_sync_results. Managed S14 source table and trigger are absent.
-- These are fixture-only simplifications:
-- editions/shows omit unrelated columns/triggers; RLS policy intentionally ALLOWS
-- authenticated direct writes to stress the S14 trigger, NOT actual hosted RLS.
-- existing platform guard is mirrored from a read-only pg_get_functiondef;
-- AFTER ROW result sync is a synthetic counter, NOT actual results logic.
begin;
create schema private authorization postgres;
grant usage on schema private to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

create table public.editions(id uuid primary key);
create table public.shows(
  id uuid primary key,
  edition_id uuid not null references public.editions(id)
);
create table public.televote_votes(
  id uuid primary key default gen_random_uuid(),
  edition_id uuid not null references public.editions(id),
  country_id uuid,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  show_id uuid references public.shows(id),
  contest_entity_id uuid
);
alter table public.televote_votes enable row level security;
create policy local_worst_case_authenticated_vote_write
on public.televote_votes for all to authenticated
using (true) with check (true);
create policy local_service_vote_write
on public.televote_votes for all to service_role
using (true) with check (true);
grant all on table public.televote_votes to authenticated, service_role;
grant select on table public.televote_votes to anon;

-- Replicate *observed* private request-role helper.
create or replace function private.studio2_request_is_service_role()
returns boolean language sql stable set search_path=pg_catalog as $role$
  select coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
$role$;
revoke all on function private.studio2_request_is_service_role()
  from public, anon, authenticated, service_role;

create table public.studio2_platform_operational_state(
  singleton boolean primary key default true,
  mode text not null
);
insert into public.studio2_platform_operational_state(singleton,mode)
values (true,'normal');

-- From the live read-only PostgreSQL catalog 2026-11-07; note session_user
-- bypass remains in the EXISTING platform guard (not a change by S14 candidate).
create or replace function private.studio2_guard_direct_client_write()
returns trigger
language plpgsql security definer
set search_path=pg_catalog, public, private
as $platform$
declare
 v_mode text;
begin
 if session_user in ('postgres','supabase_admin')
    or pg_has_role(session_user,'postgres','member') then
   return null;
 end if;
 if coalesce(current_setting('studio2.platform_recovery_write',true),'')='on' then
   return null;
 end if;
 select state.mode into v_mode from public.studio2_platform_operational_state state
 where state.singleton=true;
 if v_mode='read_only' and
   coalesce(current_setting('studio2.confirmation_maintenance_write',true),'')='on' then
   return null;
 end if;
 if v_mode in ('read_only','maintenance') then
   raise exception 'Solaris is currently %, so this write is unavailable',v_mode
     using errcode='25006';
 end if;
 if v_mode is null then
   raise exception 'Solaris platform operational state is unavailable'
     using errcode='25006';
 end if;
 return null;
end
$platform$;

create trigger studio2_platform_direct_write_guard
before insert or delete or update on public.televote_votes
for each statement execute function private.studio2_guard_direct_client_write();

-- Read-only synthetic downstream sync COUNTER for verifying trigger ordering.
create table private.local_vote_sync_counter(id bigint generated always as identity);
create or replace function public.sync_results_after_vote_change()
returns trigger language plpgsql security definer
set search_path=pg_catalog,public,private
as $local_sync$
begin
 insert into private.local_vote_sync_counter default values;
 return coalesce(new,old);
end
$local_sync$;
create trigger televote_votes_sync_results
after insert or delete or update on public.televote_votes
for each row execute function public.sync_results_after_vote_change();

insert into public.editions(id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
insert into public.shows(id,edition_id) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

insert into public.televote_votes(id,edition_id,show_id,country_id,points) values
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111',12),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','22222222-2222-4222-8222-222222222222',7);
commit;
