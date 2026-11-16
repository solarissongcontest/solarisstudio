\set ON_ERROR_STOP on
-- S16 publication/Archive boundary. Disposable PG17 only; the caller
-- v3-s16-catalog-rehearsal.sh has already required loopback and exact migrations.
-- This fixture does not invoke hosted services and rolls back every data change.
begin;

do $preflight$
declare
  v_guard oid := to_regprocedure('private.v3_guard_archived_edition_workflow_write()');
begin
  if current_setting('server_version_num')::integer / 10000 <> 17
     or current_user <> 'postgres'
     or v_guard is null
     or not exists (
       select 1
       from pg_trigger t
       join pg_proc p on p.oid=t.tgfoid
       join pg_roles r on r.oid=p.proowner
       where t.tgrelid='public.studio2_show_publication_controls'::regclass
         and t.tgname='v3_guard_archived_edition_workflow_write'
         and t.tgenabled='O'
         and not t.tgisinternal
         and t.tgtype=31 -- BEFORE INSERT, UPDATE, DELETE, ROW
         and t.tgfoid=v_guard
         and p.prosecdef and r.rolname='postgres'
         and p.proconfig @> array['search_path=pg_catalog, public, private']
     )
     or exists (
       select 1 from pg_roles r
       where r.rolname in ('anon','authenticated','service_role')
         and has_function_privilege(r.oid,v_guard,'EXECUTE')
     )
  then
    raise exception 'Publication Archive guard identity, owner, grants or attachment drift'
      using errcode='55000';
  end if;
end
$preflight$;

-- Fixture setup only: strict-dual runtime authorization normally requires two
-- live approvals. The S16 probe supplies a synthetic terminal runtime row,
-- while leaving the one-shot Archive transition gate and publication guards ON.
-- This DDL is transaction-local and must be rolled back by the script.
alter table public.studio2_edition_runtime
  disable trigger studio2_edition_runtime_strict_dual_guard;

do $publication_guard$
declare
  v_edition uuid := gen_random_uuid();
  v_show uuid := gen_random_uuid();
  v_message text;
  v_subsystems jsonb := '{
    "confirmations":"not_started",
    "submissions":"not_started",
    "juryVoting":"not_started",
    "televoting":"not_started",
    "results":"not_started",
    "predictions":"not_started"
  }'::jsonb;
begin
  insert into public.editions(id,name,slug,status,published)
  values(v_edition,'S16 publication archive guard','s16-publication-'||v_edition,'draft',false);

  insert into public.studio2_edition_runtime(edition_id,state,subsystems)
  values(v_edition,'draft',v_subsystems)
  on conflict(edition_id) do nothing;

  insert into public.shows(id,edition_id,name,kind,published,publication_config)
  values(v_show,v_edition,'S16 publication guard local fixture','semi-final',false,'{}'::jsonb);

  if (select count(*) from public.studio2_show_publication_controls
      where show_id=v_show and edition_id=v_edition) <> 1 then
    raise exception 'Publication fixture failed to create its canonical control';
  end if;

  -- Use the genuine one-shot private Archive transition gate; never disable
  -- the Archive transition trigger or the publication trigger under test.
  perform private.v3_arm_archive_runtime_transition_gate(v_edition);
  update public.studio2_edition_runtime
     set state='archived',version=version+1
   where edition_id=v_edition;

  if (select state from public.studio2_edition_runtime
      where edition_id=v_edition) is distinct from 'archived' then
    raise exception 'Synthetic edition is not archived';
  end if;

  -- Actual table DML, not a mocked trigger call. Each operation must raise
  -- exactly the Archive guard's 42501, not a constraint/RLS/validator error.
  begin
    update public.studio2_show_publication_controls
       set updated_at=updated_at
     where show_id=v_show;
    raise exception 'Archived publication UPDATE unexpectedly succeeded';
  exception when insufficient_privilege then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'Archived edition workflow is read-only.' then
      raise exception 'UPDATE rejected at wrong authority boundary: %',v_message;
    end if;
  end;

  begin
    delete from public.studio2_show_publication_controls where show_id=v_show;
    raise exception 'Archived publication DELETE unexpectedly succeeded';
  exception when insufficient_privilege then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'Archived edition workflow is read-only.' then
      raise exception 'DELETE rejected at wrong authority boundary: %',v_message;
    end if;
  end;

  begin
    insert into public.studio2_show_publication_controls(
      show_id,edition_id,state,version,frozen_config,source_show_updated_at
    )
    select id,edition_id,'draft',1,'{}'::jsonb,updated_at
    from public.shows where id=v_show
    on conflict(show_id) do nothing;
    raise exception 'Archived publication INSERT unexpectedly succeeded';
  exception when insufficient_privilege then
    get stacked diagnostics v_message = message_text;
    if v_message <> 'Archived edition workflow is read-only.' then
      raise exception 'INSERT rejected at wrong authority boundary: %',v_message;
    end if;
  end;

  if (select count(*) from public.studio2_show_publication_controls
      where show_id=v_show and edition_id=v_edition) <> 1 then
    raise exception 'Publication history was modified by denied operation';
  end if;
  raise notice 'PASS: real publication Archive guard rejects INSERT/UPDATE/DELETE; canonical control remains intact';
end
$publication_guard$;

-- Restores the strict-dual trigger and all synthetic data, including any
-- archive-side effects, in the same local transaction.
rollback;
