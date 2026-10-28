begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('28175429-0000-4000-8000-000000000001','authenticated','authenticated','core-integrity-organizer@local.invalid',now(),now()),
 ('28175429-0000-4000-8000-000000000002','authenticated','authenticated','core-integrity-unprivileged@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('28175429-0000-4000-8000-000000000012','28175429-0000-4000-8000-000000000002',now(),now());
insert into public.studio2_role_assignments(user_id,role_key,edition_id)
 values('28175429-0000-4000-8000-000000000001','organizer',null);

-- This is a closed list, not a future-function allowlist. Every core mutation
-- must reject before NULL argument validation or receipt lookup, proving the
-- same boundary protects both new mutations and uncertain-outcome retries.
create temporary table integrity_actor_commands(signature text, capability text);
insert into integrity_actor_commands values
 ('public.studio2_integrity_add_case_note(uuid,text,uuid,text,bigint)', 'manage'),
 ('public.studio2_integrity_assign_case_reviewer(uuid,uuid,text,uuid,text,bigint)', 'manage'),
 ('public.studio2_integrity_case_transition(uuid,text,uuid,text,bigint,text)', 'manage'),
 ('public.studio2_integrity_link_cases(uuid,uuid,text,text,bigint,uuid,text,uuid,text)', 'manage'),
 ('public.studio2_integrity_record_finding(uuid,text,text,text,text[],boolean,uuid,text,bigint)', 'manage'),
 ('public.studio2_integrity_record_preclearance_ruling(uuid,text,text,text,text[],uuid,text,bigint)', 'manage'),
 ('public.studio2_integrity_record_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean,uuid,text,bigint)', 'sanction'),
 ('public.studio2_integrity_recuse_case_reviewer(uuid,text,uuid,text,bigint)', 'manage'),
 ('public.studio2_integrity_register_evidence(uuid,text,text,text,text,boolean,bigint,uuid,text)', 'manage'),
 ('public.studio2_integrity_reply_case(uuid,text,boolean,uuid,text,bigint)', 'manage'),
 ('public.studio2_integrity_set_case_priority(uuid,text,uuid,text,bigint)', 'manage'),
 ('public.studio2_integrity_set_case_retention(uuid,timestamptz,text,uuid,text,bigint)', 'manage'),
 ('public.studio2_integrity_assign_appeal_reviewer(uuid,uuid,uuid,text,bigint)', 'sanction'),
 ('public.studio2_integrity_resolve_appeal(uuid,text,text,integer,text[],text[],uuid,text,bigint)', 'sanction'),
 ('public.studio2_integrity_grant_appeal_extension(uuid,timestamptz,text,uuid,text,bigint)', 'sanction');
grant select on integrity_actor_commands to authenticated, service_role;

do $actor_boundary$
declare v_command record; v_call text; v_fn regprocedure;
begin
 for v_command in select * from integrity_actor_commands loop
  v_fn := v_command.signature::regprocedure;
  select 'select ' || p.pronamespace::regnamespace || '.' || p.proname || '(' ||
   (select string_agg('null::' || a.type::regtype, ', ' order by a.ordinality) from unnest(p.proargtypes) with ordinality a(type, ordinality)) || ')'
  into v_call from pg_proc p where p.oid=v_fn;
  perform set_config('request.jwt.claims','{"role":"authenticated","sub":"28175429-0000-4000-8000-000000000001","session_id":"28175429-0000-4000-8000-000000000011"}',true);
  set local role authenticated;
  begin
   execute v_call;
   raise exception 'Revoked actor reached Integrity command or receipt: %',v_command.signature;
  exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
  reset role;

  -- The service transport shortcut in studio2_access_allowed must not let an
  -- arbitrary live subject exercise Integrity management/sanction authority.
  perform set_config('request.jwt.claims','{"role":"service_role","sub":"28175429-0000-4000-8000-000000000002","session_id":"28175429-0000-4000-8000-000000000012"}',true);
  if has_function_privilege('service_role',v_fn,'EXECUTE') then set local role service_role; else set local role authenticated; end if;
  begin
   execute v_call;
   raise exception 'Service transport elevated arbitrary Integrity actor: %',v_command.signature;
  exception when insufficient_privilege then if sqlerrm<>'Missing Solaris capability: integrity.'||v_command.capability then raise; end if; end;
  reset role;
 end loop;
 if exists(select 1 from public.studio2_operation_receipts where actor_id in ('28175429-0000-4000-8000-000000000001','28175429-0000-4000-8000-000000000002')) then raise exception 'Denied Integrity actor acquired operation receipt'; end if;
end
$actor_boundary$;

do $component_authority$
declare v_table text; v_role text; v_column record; v_statement text;
begin
 foreach v_table in array array['integrity_case_access','integrity_case_internal_notes','integrity_case_messages','integrity_case_requests','integrity_case_reviewers'] loop
  if not exists(select 1 from pg_class c where c.oid=to_regclass('public.'||v_table) and c.relrowsecurity and c.relowner='postgres'::regrole) then raise exception 'Unsafe Integrity component owner/RLS: %',v_table; end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(v_role,'public.'||v_table,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Raw Integrity component table DML: %/%',v_table,v_role; end if;
   for v_column in select attname from pg_attribute where attrelid=to_regclass('public.'||v_table) and attnum>0 and not attisdropped loop
    if has_column_privilege(v_role,'public.'||v_table,v_column.attname,'INSERT,UPDATE') then raise exception 'Raw Integrity component column DML: %/%/%',v_table,v_column.attname,v_role; end if;
   end loop;
  end loop;
  -- Reach the real external service role, not just an ACL string check.
  foreach v_statement in array array[format('insert into public.%I default values',v_table),format('delete from public.%I where false',v_table),format('truncate table public.%I',v_table)] loop
   set local role service_role;
   begin
    execute v_statement;
    raise exception 'Service role directly mutated case component: %',v_table;
   exception when insufficient_privilege then
    if sqlerrm<>format('permission denied for table %s',v_table) then raise; end if;
   end;
   reset role;
  end loop;
 end loop;
end
$component_authority$;
rollback;
