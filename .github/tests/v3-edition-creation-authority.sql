-- Disposable LOCAL Supabase proof only. The wrapper refuses hosted endpoints.
begin;

insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('27270000-0000-4000-8000-000000000001','authenticated','authenticated','edition-global@local.invalid',now(),now()),
 ('27270000-0000-4000-8000-000000000002','authenticated','authenticated','edition-scoped@local.invalid',now(),now()),
 ('27270000-0000-4000-8000-000000000003','authenticated','authenticated','edition-foreign@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('27270000-0000-4000-8000-000000000011','27270000-0000-4000-8000-000000000001',now(),now()),
 ('27270000-0000-4000-8000-000000000012','27270000-0000-4000-8000-000000000002',now(),now()),
 ('27270000-0000-4000-8000-000000000013','27270000-0000-4000-8000-000000000003',now(),now());
insert into public.user_roles(user_id,role) values
 ('27270000-0000-4000-8000-000000000001','organizer');

insert into public.editions(id,name,year,slug,edition_number,status,published,editing_enabled,data_revision)
values
 ('27270000-0000-4000-8000-000000000021','Scoped edition',2027,'ssc-272701',272701,'draft',false,true,1),
 ('27270000-0000-4000-8000-000000000022','Foreign edition',2027,'ssc-272702',272702,'draft',false,true,1);
insert into public.studio2_capability_grants(user_id,capability,edition_id,granted_by) values
 ('27270000-0000-4000-8000-000000000002','edition.manage','27270000-0000-4000-8000-000000000021','27270000-0000-4000-8000-000000000001');

-- Global organizer creation is atomic and an exact retry reads the same receipt.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27270000-0000-4000-8000-000000000001","session_id":"27270000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select public.v3_create_edition(272703,'Created through authority',2027,null,'Tetlehamn','Create canonical edition fixture');
select public.v3_create_edition(272703,'Created through authority',2027,null,'Tetlehamn','Create canonical edition fixture');
reset role;

do $test$
begin
  if (select count(*) from public.editions where edition_number=272703) <> 1 then
    raise exception 'Edition create retry duplicated canonical state';
  end if;
  if (select count(*) from public.studio2_operation_receipts where command='edition.create' and scope->>'editionNumber'='272703') <> 1 then
    raise exception 'Edition create retry duplicated operation receipt';
  end if;
  if (select count(*) from private.v3_domain_events where event_type='edition.changed' and edition_id=(select id from public.editions where edition_number=272703)) <> 1 then
    raise exception 'Edition create did not persist exactly one edition.changed event';
  end if;
end
$test$;


-- A capability on one existing Edition is not global creation authority.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27270000-0000-4000-8000-000000000002","session_id":"27270000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
do $test$ begin
 begin
  perform public.v3_create_edition(272704,'Unauthorized scoped create',2027,null,null,'Cannot create outside scope');
  raise exception 'Scoped role created a global Edition';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;

-- Compatibility may create only private drafts, with the same canonical receipt.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27270000-0000-4000-8000-000000000001","session_id":"27270000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select public.admin_confirmation_save_edition('{"edition_number":272705,"name":"Compatibility draft","description":"Retained description","editing_enabled":false,"status":"draft"}'::jsonb);
do $test$ begin
 begin
  perform public.admin_confirmation_save_edition('{"edition_number":272706,"name":"Unsafe legacy publication","status":"active"}'::jsonb);
  raise exception 'Legacy creation prematurely published an Edition';
 exception when invalid_parameter_value then null; end;
 begin
  perform public.v3_create_edition(272703,'Competing intent',2027,null,null,'Must not overwrite existing Edition');
  raise exception 'A competing creation overwrote the original Edition';
 exception when unique_violation then null; end;
end $test$;
reset role;

-- All API principals lose table and column INSERT privileges.
do $test$ declare r text; begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(r,'public.editions','INSERT') or has_any_column_privilege(r,'public.editions','INSERT') then
   raise exception 'Unexpected raw Edition INSERT grant: %',r;
  end if;
  if r in ('anon','service_role') and has_function_privilege(r,'public.v3_create_edition(integer,text,integer,uuid,text,text,text,boolean)','EXECUTE') then
   raise exception 'Anonymous principal can execute Edition creation';
  end if;
 end loop;
end $test$;
set local role anon;
do $test$ begin
 begin
  insert into public.editions(name,slug,edition_number) values('Raw anon','raw-anon',272707);
  raise exception 'Anonymous raw INSERT succeeded';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
set local role authenticated;
do $test$ begin
 begin
  insert into public.editions(name,slug,edition_number) values('Raw authenticated','raw-authenticated',272708);
  raise exception 'Authenticated raw INSERT succeeded';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;

-- Even privilege drift and a forged approval marker cannot authorize raw workers.
grant insert on public.editions to service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('solaris.edition_command','approved',true);
set local role service_role;
do $test$ begin
 begin
  insert into public.editions(name,slug,edition_number) values('Raw worker','raw-worker',272709);
  raise exception 'Worker bypassed effective-role Edition creation guard';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
revoke insert on public.editions from service_role;

-- Revocation is checked before replay of a previously successful operation.
delete from public.user_roles where user_id='27270000-0000-4000-8000-000000000001';
delete from public.studio2_role_assignments where user_id='27270000-0000-4000-8000-000000000001';
delete from public.studio2_capability_grants where user_id='27270000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27270000-0000-4000-8000-000000000001","session_id":"27270000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $test$ begin
 begin
  perform public.v3_create_edition(272703,'Created through authority',2027,null,'Tetlehamn','Create canonical edition fixture');
  raise exception 'Revoked actor replayed a governed Edition operation';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
do $test$ begin
 if (select count(*) from public.editions where edition_number=272703)<>1 or
    (select name from public.editions where edition_number=272703)<>'Created through authority' then
  raise exception 'Original Edition state was not preserved';
 end if;
 if not exists(select 1 from public.editions where edition_number=272705 and description='Retained description' and not editing_enabled and not published and status='draft') then
  raise exception 'Compatibility creation lost description/editing/private-state semantics';
 end if;
 if exists(select 1 from public.editions where edition_number in (272704,272706,272707,272708,272709)) then
  raise exception 'Rejected creation persisted canonical state';
 end if;
 if (select count(*) from public.studio2_operation_receipts where command='edition.create' and scope->>'editionNumber'='272703')<>1 then
  raise exception 'Rejected competing intent or replay duplicated creation receipts';
 end if;
end $test$;
rollback;
