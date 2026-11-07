-- S14 LOCAL REHEARSAL CANDIDATE ONLY. NOT DEPLOYABLE. DO NOT RUN ON HOSTED.
-- Scope: provenance source TABLE + vote ROW GUARD only. Does NOT apply / sync
-- published Televote projections or install round/aggregate publishing hooks.
-- Canonical sources: 20261017001000 and 20261017001010. Intentional forward
-- enhancement: guard UPDATE checks BOTH OLD and NEW show IDs, to prevent a
-- managed vote row being moved to an unmanaged show as a bypass.
-- Authorization is based on PostgreSQL's effective role, not caller-settable
-- request claims or custom transaction markers.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $s14_provenance_preflight$
begin
  if to_regclass('public.televote_votes') is null
     or to_regclass('public.editions') is null
     or to_regclass('public.shows') is null
     or to_regprocedure('private.studio2_request_is_service_role()') is null then
    raise exception 'S14 provenance blocked: canonical tables or authority helper absent';
  end if;
  if to_regclass('private.v3_televote_result_projection_sources') is not null
     or to_regclass('private.v3_televote_result_projection_sources_pkey') is not null
     or to_regprocedure('private.v3_guard_source_managed_televote_projection()') is not null
     or exists (
       select 1 from pg_trigger
       where tgrelid='public.televote_votes'::regclass
         and tgname='v3_guard_source_managed_televote_projection'
         and not tgisinternal
     ) then
    raise exception 'S14 provenance blocked: partial or preexisting guard artifacts; reconcile first';
  end if;
end
$s14_provenance_preflight$;

create table private.v3_televote_result_projection_sources (
  show_id uuid primary key references public.shows(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  source_type text not null check (source_type in ('round', 'combined')),
  source_id text not null check (length(btrim(source_id)) between 1 and 160),
  source_version integer not null check (source_version >= 1),
  source_published_at timestamptz not null,
  payload_fingerprint text not null check (payload_fingerprint ~ '^[0-9a-f]{64}$'),
  row_count integer not null check (row_count >= 1 and row_count <= 500),
  points_total bigint not null check (points_total >= 0),
  projection_revision bigint not null check (projection_revision >= 1),
  synced_at timestamptz not null default now()
);

revoke all on table private.v3_televote_result_projection_sources
  from public, anon, authenticated;

create or replace function private.v3_guard_source_managed_televote_projection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
declare
  v_show_id uuid;
  v_previous_show_id uuid;
begin
  if tg_op = 'DELETE' then
    v_show_id := old.show_id;
  else
    v_show_id := new.show_id;
    if tg_op = 'UPDATE' then
      v_previous_show_id := old.show_id;
    end if;
  end if;

  if coalesce(current_setting('role', true), '') = 'service_role' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Guard BOTH identities when an UPDATE moves a vote across show scopes.
  -- The historical hardening checks only NEW.show_id; that can miss a
  -- previously source-managed show when a vote is moved away.
  if exists (
       select 1
       from private.v3_televote_result_projection_sources source
       where (v_show_id is not null and source.show_id = v_show_id)
          or (tg_op = 'UPDATE' and v_previous_show_id is not null
              and source.show_id = v_previous_show_id)
     ) then
    raise exception 'Published Televote projection is server-managed for this show'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_source_managed_televote_projection()
  from public, anon, authenticated;

create trigger v3_guard_source_managed_televote_projection
before insert or update or delete on public.televote_votes
for each row execute function private.v3_guard_source_managed_televote_projection();

do $s14_provenance_postcheck$
begin
  if to_regclass('private.v3_televote_result_projection_sources') is null
     or to_regprocedure('private.v3_guard_source_managed_televote_projection()') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid='public.televote_votes'::regclass
         and tgname='v3_guard_source_managed_televote_projection'
         and tgenabled='O' and not tgisinternal
     ) then
    raise exception 'S14 provenance postcondition failed: missing table/guard/trigger';
  end if;
  if has_table_privilege('anon','private.v3_televote_result_projection_sources','SELECT')
     or has_table_privilege('authenticated','private.v3_televote_result_projection_sources','SELECT')
     or has_table_privilege('anon','private.v3_televote_result_projection_sources','INSERT')
     or has_table_privilege('authenticated','private.v3_televote_result_projection_sources','INSERT')
     or has_function_privilege('anon','private.v3_guard_source_managed_televote_projection()','EXECUTE')
     or has_function_privilege('authenticated','private.v3_guard_source_managed_televote_projection()','EXECUTE') then
    raise exception 'S14 provenance postcondition failed: unsafe direct client privileges';
  end if;
end
$s14_provenance_postcheck$;
commit;
