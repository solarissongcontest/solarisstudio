begin;
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('28112308-0000-4000-8000-000000000001','authenticated','authenticated','publication-authority@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values ('28112308-0000-4000-8000-000000000011','28112308-0000-4000-8000-000000000001',now(),now());
insert into public.studio2_role_assignments(user_id,role_key,edition_id)
values ('28112308-0000-4000-8000-000000000001','organizer',null);
insert into public.editions(id,name,slug,edition_number,status,published)
values ('28112308-0000-4000-8000-000000000021','Publication authority','publication-authority-fixture',28112308,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config)
values ('28112308-0000-4000-8000-000000000031','28112308-0000-4000-8000-000000000021','Publication authority show','special',1,false,'{}');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28112308-0000-4000-8000-000000000001","session_id":"28112308-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $command$
declare v_first jsonb; v_retry jsonb;
begin
  v_first:=public.studio2_apply_show_publication_change('28112308-0000-4000-8000-000000000031','public','{"participants":true}',null,'28112308-0000-4000-8000-000000000101','publication-authority:publish',1);
  v_retry:=public.studio2_apply_show_publication_change('28112308-0000-4000-8000-000000000031','public','{"participants":true}',null,'28112308-0000-4000-8000-000000000101','publication-authority:publish',1);
  if v_first->>'state'<>'public' or v_first->>'version'<>'2' or v_retry is distinct from v_first then raise exception 'Canonical publication replay diverged after raw DML cutover'; end if;
end
$command$;
do $changed_request$
begin
  begin
    perform public.studio2_apply_show_publication_change('28112308-0000-4000-8000-000000000031','hidden','{"participants":true}',null,'28112308-0000-4000-8000-000000000101','publication-authority:publish',1);
    raise exception 'Changed publication request replayed';
  exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
end
$changed_request$;
reset role;
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('28112308-0000-4000-8000-000000000002','authenticated','authenticated','publication-foreign@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values ('28112308-0000-4000-8000-000000000012','28112308-0000-4000-8000-000000000002',now(),now());
insert into public.editions(id,name,slug,edition_number,status,published)
values ('28112308-0000-4000-8000-000000000022','Foreign publication','publication-foreign-fixture',28112309,'active',false);
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('28112308-0000-4000-8000-000000000002','edition.manage','28112308-0000-4000-8000-000000000022');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28112308-0000-4000-8000-000000000002","session_id":"28112308-0000-4000-8000-000000000012"}',true);
set local role authenticated;
do $foreign$
begin
  begin
    perform public.studio2_apply_show_publication_change('28112308-0000-4000-8000-000000000031','hidden','{"participants":true}',null,'28112308-0000-4000-8000-000000000102','publication-authority:foreign',2);
    raise exception 'Foreign edition publisher mutated show';
  exception when insufficient_privilege then null; end;
end
$foreign$;
reset role;
do $catalog$
declare v_role text; v_table text; v_privilege text;
begin
  foreach v_table in array array['public.studio2_show_publication_controls','public.studio2_show_publication_executions'] loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
        if has_table_privilege(v_role,v_table,v_privilege) then raise exception 'Raw publication authority remains: % % %',v_role,v_table,v_privilege; end if;
      end loop;
    end loop;
    if not has_table_privilege('service_role',v_table,'SELECT') then raise exception 'Publication operational read removed'; end if;
  end loop;
  if not exists(select 1 from pg_proc where oid='public.studio2_publish_due_show_publications()'::regprocedure and prosecdef and proowner='postgres'::regrole and array_to_string(proconfig,',') like '%search_path=pg_catalog,%') then raise exception 'Scheduler must retain pinned owner authority'; end if;
  if (select count(*) from private.v3_domain_events where operation_id='28112308-0000-4000-8000-000000000101' and event_type='publication.changed')<>1 then raise exception 'Publication event lost or duplicated'; end if;
  if (select count(*) from public.studio2_operation_receipts where operation_id='28112308-0000-4000-8000-000000000101' and status='succeeded')<>1 then raise exception 'Publication receipt lost or duplicated'; end if;
end
$catalog$;
set local role service_role;
do $denials$
begin
  begin
    update public.studio2_show_publication_controls set state='private' where show_id='28112308-0000-4000-8000-000000000031';
    raise exception 'Service raw publication control write accepted';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.studio2_show_publication_executions where show_id='28112308-0000-4000-8000-000000000031';
    raise exception 'Service raw publication execution delete accepted';
  exception when insufficient_privilege then null; end;
end
$denials$;
rollback;
