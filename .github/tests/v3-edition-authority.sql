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
insert into public.studio2_role_assignments(user_id,role_key,edition_id) values
 ('27270000-0000-4000-8000-000000000001','organizer',null);

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

-- A scoped organizer may mutate only the edition named by its capability.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27270000-0000-4000-8000-000000000002","session_id":"27270000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
select public.v3_apply_edition_metadata_change(
 '27270000-0000-4000-8000-000000000021',1,
 '{"name":"Scoped edition revised"}',
 'Apply reviewed scoped edition name'
);
-- Exact retry returns the existing operation before evaluating the now-stale row revision.
select public.v3_apply_edition_metadata_change(
 '27270000-0000-4000-8000-000000000021',1,
 '{"name":"Scoped edition revised"}',
 'Apply reviewed scoped edition name'
);

do $test$
begin
  begin
    perform public.v3_apply_edition_metadata_change(
      '27270000-0000-4000-8000-000000000021',1,
      '{"description":"stale overwrite"}',
      'Attempt stale edition overwrite'
    );
    raise exception 'Stale edition metadata CAS unexpectedly succeeded';
  exception when sqlstate 'PT409' then null; end;

  begin
    perform public.v3_apply_edition_metadata_change(
      '27270000-0000-4000-8000-000000000022',1,
      '{"name":"cross edition"}',
      'Attempt foreign edition mutation'
    );
    raise exception 'Foreign edition mutation unexpectedly succeeded';
  exception when insufficient_privilege then null; end;

  begin
    update public.editions set name='raw browser bypass' where id='27270000-0000-4000-8000-000000000021';
    raise exception 'Authenticated raw edition DML unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end
$test$;
reset role;

-- An authenticated user without edition.manage has no edition authority.
select set_config('request.jwt.claims','{"role":"authenticated","sub":"27270000-0000-4000-8000-000000000003","session_id":"27270000-0000-4000-8000-000000000013"}',true);
set local role authenticated;
do $test$
begin
  begin
    perform public.v3_apply_edition_editing_change(
      '27270000-0000-4000-8000-000000000021',true,false,
      'Unauthorized edition editing attempt'
    );
    raise exception 'Unauthorized edition editing unexpectedly succeeded';
  exception when insufficient_privilege then null; end;
end
$test$;
reset role;

do $test$
declare
  v_role text;
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(v_role,'public.editions','INSERT')
       or has_table_privilege(v_role,'public.editions','UPDATE')
       or has_table_privilege(v_role,'public.editions','DELETE')
       or has_table_privilege(v_role,'public.editions','TRUNCATE') then
      raise exception 'Raw edition DML remains granted to %', v_role;
    end if;
  end loop;

  if has_function_privilege('anon','public.v3_apply_edition_metadata_change(uuid,bigint,jsonb,text)','EXECUTE') then
    raise exception 'Anonymous metadata command execution remains';
  end if;
  if has_function_privilege('service_role','public.v3_apply_edition_metadata_change(uuid,bigint,jsonb,text)','EXECUTE') then
    raise exception 'Unbound service-role metadata command execution remains';
  end if;
  if has_function_privilege('service_role','public.v3_apply_edition_theme_change(uuid,uuid,uuid,text)','EXECUTE') then
    raise exception 'Unbound service-role theme command execution remains';
  end if;
  if has_function_privilege('service_role','public.admin_confirmation_save_round(jsonb)','EXECUTE')
     or has_function_privilege('service_role','public.admin_confirmation_delete_round(uuid)','EXECUTE')
     or has_function_privilege('service_role','public.admin_confirmation_set_round_status(uuid,text)','EXECUTE')
     or has_function_privilege('service_role','public.admin_confirmation_set_round_editing(uuid,boolean)','EXECUTE')
     or has_function_privilege('service_role','public.admin_confirmation_set_edition_editing(uuid,boolean)','EXECUTE')
     or has_function_privilege('service_role','public.admin_confirmation_delete_edition(uuid)','EXECUTE') then
    raise exception 'Legacy Confirmation writer is still executable by service_role';
  end if;

  if (select data_revision from public.editions where id='27270000-0000-4000-8000-000000000021') <> 2 then
    raise exception 'Edition metadata retry did not preserve one revision increment';
  end if;
  if (select count(*) from public.studio2_operation_receipts where command='edition.metadata.change' and scope->>'editionId'='27270000-0000-4000-8000-000000000021') <> 1 then
    raise exception 'Edition metadata retry duplicated its receipt';
  end if;
  if (select count(*) from private.v3_domain_events where event_type='edition.changed' and edition_id='27270000-0000-4000-8000-000000000021') <> 1 then
    raise exception 'Edition metadata retry duplicated its event';
  end if;
end
$test$;

rollback;
