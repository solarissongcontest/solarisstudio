-- S08 LOCAL/DISPOSABLE CANDIDATE ONLY. Not a hosted migration or rollout approval.
-- Promote S07's proven source-managed SHOW guard into a complete single-writer
-- boundary for ALL official public.televote_votes (including legacy/unmanaged
-- shows). Published source application remains the ONLY application writer.
-- Do not apply to production before migration-frontier and legacy compatibility
-- review. This deliberately retires direct Organizer/manual projection writes.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

do $s08_preflight$
declare
  v_guard pg_proc%rowtype;
begin
  select * into v_guard
  from pg_proc
  where oid=to_regprocedure('private.v3_guard_source_managed_televote_projection()');
  if v_guard.oid is null or not v_guard.prosecdef
     or pg_get_userbyid(v_guard.proowner) <> 'postgres'
     or v_guard.proconfig is distinct from
       array['search_path=pg_catalog, public, private']::text[]
     or strpos(v_guard.prosrc,'source.show_id=v_previous_show_id')=0
     or strpos(v_guard.prosrc,'writer.transaction_id=pg_current_xact_id()')=0
     or to_regclass('private.v3_televote_result_projection_sources') is null
     or to_regclass('private.v3_televote_projection_write_context') is null
     or to_regclass('public.televote_votes') is null
     or not exists(
       select 1 from pg_trigger
       where tgrelid='public.televote_votes'::regclass
         and tgname='v3_guard_source_managed_televote_projection'
         and not tgisinternal and tgenabled='O'
     ) then
    raise exception 'S08 requires exactly the active S07 owner-only writer boundary; reconcile source drift'
      using errcode='55000';
  end if;
  if exists(select 1 from private.v3_televote_projection_write_context) then
    raise exception 'S08 refuses outstanding projection writer context'
      using errcode='55000';
  end if;
end $s08_preflight$;

-- S07 already controls the creation and deletion of this private transaction
-- context INSIDE the owner-only canonical source materializer. Unlike the
-- earlier managed-show-only guard, S08 never exempts legacy/unmanaged shows.
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
  if tg_op='DELETE' then
    v_show_id:=old.show_id;
  else
    v_show_id:=new.show_id;
    if tg_op='UPDATE' then v_previous_show_id:=old.show_id; end if;
  end if;

  if v_show_id is null or not exists(
    select 1 from private.v3_televote_projection_write_context writer
    where writer.transaction_id=pg_current_xact_id()
      and writer.show_id=v_show_id
  ) or (
    tg_op='UPDATE' and v_previous_show_id is distinct from v_show_id
    and (
      v_previous_show_id is null or not exists(
        select 1 from private.v3_televote_projection_write_context writer
        where writer.transaction_id=pg_current_xact_id()
          and writer.show_id=v_previous_show_id
      )
    )
  ) then
    raise exception 'Official Televote totals are writable only by canonical source projection'
      using errcode='42501';
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end $guard$;

-- Retain SELECT/RLS policies. No public/anon/authenticated/service-role SQL
-- connection may independently INSERT/UPDATE/DELETE the official projection.
revoke insert, update, delete on public.televote_votes
  from public, anon, authenticated, service_role;
revoke all on function private.v3_guard_source_managed_televote_projection()
  from public, anon, authenticated, service_role;

do $s08_postcheck$
declare
  v_role text;
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(v_role,'public.televote_votes','INSERT')
       or has_table_privilege(v_role,'public.televote_votes','UPDATE')
       or has_table_privilege(v_role,'public.televote_votes','DELETE')
       or has_table_privilege(v_role,'private.v3_televote_projection_write_context','INSERT')
       or has_function_privilege(v_role,'private.v3_apply_published_televote_projection(uuid,uuid,text,text,integer,timestamptz,jsonb)','EXECUTE') then
      raise exception 'S08 unauthorized direct Televote writer remains: %',v_role
        using errcode='42501';
    end if;
  end loop;
end $s08_postcheck$;
commit;
