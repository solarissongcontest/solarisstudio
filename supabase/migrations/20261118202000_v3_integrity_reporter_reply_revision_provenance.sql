begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Preserve the existing four case/appeal triggers and their event history.
-- Reporter replies are an actual aggregate mutation even when case.status is
-- already under_review; their version must change so caller CAS cannot remain
-- artificially valid following a newly inserted reporter message.
select public.v3_register_migration_contract(
  'v3.integrity.reporter-reply-revision-provenance', 1, 'forward_fix_only', false, null,
  'Track authorized registered/anonymous reporter replies in server-managed case revision and immutable case_changed history even when no status transition is needed'
);

do $preflight$
declare v text; p oid; def text; trg record; v_role text;
begin
  foreach v in array array[
    'private.v3_integrity_case_before_update()',
    'private.v3_integrity_case_changed_event()'
  ] loop
    p := to_regprocedure(v);
    select pg_get_functiondef(f.oid) into def
      from pg_proc f
      where f.oid=p and f.prosecdef and pg_get_userbyid(f.proowner)='postgres'
        and coalesce(array_to_string(f.proconfig,','),'') like '%search_path=pg_catalog%';
    if def is null or strpos(def,'retention_until')=0
       or strpos(def,'new.version')=0 and strpos(def,'new.version')=0
    then raise exception 'Unexpected canonical Integrity revision writer: %',v using errcode='55000'; end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,p,'EXECUTE') then
        raise exception 'Revision trigger function exposed to API role: %, %',v,v_role using errcode='55000';
      end if;
    end loop;
  end loop;
  for trg in
    select t.tgname,t.tgenabled,c.relname,n.nspname from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where not t.tgisinternal and t.tgname in (
      'v3_integrity_case_before_update','v3_integrity_case_changed_event'
    )
  loop
    if trg.tgenabled <> 'O' or trg.nspname <> 'public' or trg.relname <> 'integrity_cases' then
      raise exception 'Integrity revision/event trigger attachment drift %',trg.tgname using errcode='55000';
    end if;
  end loop;
  if (select count(*) from pg_trigger where tgname in ('v3_integrity_case_before_update','v3_integrity_case_changed_event') and not tgisinternal)<>2 then
    raise exception 'Both case revision and changed-event triggers must remain attached' using errcode='55000';
  end if;
end $preflight$;

create or replace function private.v3_integrity_case_before_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  -- Only a validated case/reporter reply may increment the aggregate revision
  -- without a lifecycle status change. API-role raw table writes are denied.
  v_reporter_reply boolean := current_setting('app.integrity_command', true)
    in ('integrity.case.reporter_reply', 'integrity.case.reporter_reply.anonymous');
begin
  if old.status is distinct from new.status
     and not private.v3_integrity_case_transition_allowed(old.status, new.status) then
    raise exception 'Illegal Integrity case transition: % -> %', old.status, new.status using errcode = '23514';
  end if;

  if old.status is distinct from new.status
     or old.assigned_to is distinct from new.assigned_to
     or old.priority is distinct from new.priority
     or old.retention_until is distinct from new.retention_until
     or v_reporter_reply then
    new.version := old.version + 1;
    new.updated_at := now();
  elsif new.version is distinct from old.version then
    raise exception 'Integrity case version is server-managed' using errcode = '42501';
  end if;
  return new;
end
$body$;



create or replace function private.v3_integrity_case_changed_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_operation uuid := private.v3_integrity_operation_id();
  v_previous jsonb;
  v_next jsonb;
  v_rationale text := nullif(current_setting('app.integrity_rationale', true), '');
  v_reporter_reply boolean := current_setting('app.integrity_command', true)
    in ('integrity.case.reporter_reply', 'integrity.case.reporter_reply.anonymous');
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.assigned_to is not distinct from new.assigned_to
     and old.priority is not distinct from new.priority
     and old.retention_until is not distinct from new.retention_until
     and not v_reporter_reply then
    return new;
  end if;

  v_previous := case when tg_op = 'INSERT' then null else jsonb_build_object(
    'status', old.status,
    'priority', old.priority,
    'assignedTo', old.assigned_to,
    'retentionUntil', old.retention_until,
    'version', old.version
  ) end;
  v_next := jsonb_build_object(
    'status', new.status,
    'priority', new.priority,
    'assignedTo', new.assigned_to,
    'retentionUntil', new.retention_until,
    'version', new.version
  );

  insert into public.integrity_adjudication_history(
    aggregate_type, aggregate_id, case_id, revision, operation_id, event_type,
    actor_user_id, previous_state, next_state, rationale, metadata
  ) values (
    'case', new.id, new.id, new.version, v_operation, 'integrity.case_changed',
    auth.uid(), v_previous, v_next, v_rationale,
    jsonb_build_object('source', coalesce(nullif(current_setting('app.integrity_command', true), ''), 'sanctioned_compatibility'))
  );

  insert into public.integrity_case_events(
    case_id, event_type, detail, visible_to_reporter, actor_user_id,
    operation_id, aggregate_version, event_metadata
  ) values (
    new.id,
    'integrity.case_changed',
    case when tg_op = 'INSERT' then 'Canonical case created' else case when v_reporter_reply then 'Canonical reporter response changed case revision'
               else 'Canonical case adjudication state changed' end end,
    false,
    auth.uid(),
    v_operation,
    new.version,
    jsonb_build_object('previous', v_previous, 'next', v_next)
  );
  return new;
end
$body$;



do $postflight$
declare v text; def text;
begin
  foreach v in array array[
    'private.v3_integrity_case_before_update()',
    'private.v3_integrity_case_changed_event()'
  ] loop
    select pg_get_functiondef(to_regprocedure(v)) into def;
    if def is null
       or strpos(def,'integrity.case.reporter_reply.anonymous')=0
       or strpos(def,'v_reporter_reply')=0 then
      raise exception 'Reporter reply revision provenance not installed: %',v using errcode='55000';
    end if;
  end loop;
end $postflight$;
commit;
