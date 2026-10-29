\set ON_ERROR_STOP on
begin;
do $catalog$
declare t regclass; r text; c text;
begin
 foreach t in array array['public.studio2_confirmation_round_versions'::regclass,'private.v3_confirmation_operations'::regclass] loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(r,t,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Raw Confirmation runtime state privilege: % %',r,t; end if;
   for c in select attname from pg_attribute where attrelid=t and attnum>0 and not attisdropped loop
    if has_column_privilege(r,t,c,'INSERT,UPDATE') then raise exception 'Raw Confirmation column privilege: % %.%',r,t,c; end if;
   end loop;
  end loop;
 end loop;
 if has_function_privilege('service_role','public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)','EXECUTE') then raise exception 'Service role can impersonate round command authority'; end if;
end $catalog$;
insert into auth.users(id,aud,role,email) values('29112500-0000-4000-8000-000000000001','authenticated','authenticated','round-command@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values('29112500-0000-4000-8000-000000000011','29112500-0000-4000-8000-000000000001',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29112500-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,slug,edition_number,status) values('29112500-0000-4000-8000-000000000021','Round state authority','round-state-authority-29112500',29112500,'active');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29112500-0000-4000-8000-000000000001","session_id":"29112500-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $command$
declare first_result jsonb; replay jsonb; rid uuid; rev bigint;
begin
 first_result:=public.studio2_apply_confirmation_round_change(null,'create','{"editionId":"29112500-0000-4000-8000-000000000021","name":"Governed round"}','29112500-0000-4000-8000-000000000101','round-state:create',0);
 rid:=(first_result->>'roundId')::uuid; rev:=(first_result->>'version')::bigint;
 -- Retry after the response is discarded must read back one committed round.
 replay:=public.studio2_apply_confirmation_round_change(null,'create','{"name":"Governed round","editionId":"29112500-0000-4000-8000-000000000021"}','29112500-0000-4000-8000-000000000101','round-state:create',0);
 if replay<>first_result then raise exception 'Lost-response round retry did not read back'; end if;
 begin
  perform public.studio2_apply_confirmation_round_change(null,'create','{"editionId":"29112500-0000-4000-8000-000000000021","name":"Changed request"}','29112500-0000-4000-8000-000000000101','round-state:create',0);
  raise exception 'Changed round request accepted';
 exception when sqlstate 'P0001' then if position('IDEMPOTENCY_CONFLICT' in sqlerrm)=0 then raise; end if; end;
 first_result:=public.studio2_apply_confirmation_round_change(rid,'status','{"status":"open"}','29112500-0000-4000-8000-000000000102','round-state:open',rev);
 if (first_result->>'version')::bigint<=rev then raise exception 'Server version did not advance'; end if;
 begin
  perform public.studio2_apply_confirmation_round_change(rid,'status','{"status":"closed"}','29112500-0000-4000-8000-000000000103','round-state:stale',rev);
  raise exception 'Stale round request accepted';
 exception when sqlstate 'PT409' then null; end;
 begin
  perform public.studio2_apply_confirmation_round_change(rid,'status','{"status":"closed"}','29112500-0000-4000-8000-000000000102','round-state:open',rev);
  raise exception 'Changed status on exact round identity accepted';
 exception when sqlstate 'P0001' then if position('IDEMPOTENCY_CONFLICT' in sqlerrm)=0 then raise; end if; end;
end $command$;
reset role;
do $once$
begin
 if (select count(*) from public.submission_rounds where edition_id='29112500-0000-4000-8000-000000000021')<>1 then raise exception 'Retry duplicated round'; end if;
 if (select count(*) from public.admin_audit_log where actor_id='29112500-0000-4000-8000-000000000001' and action='create_confirmation_round')<>1 then raise exception 'Retry duplicated audit'; end if;
 if exists(select 1 from public.studio2_operation_receipts where operation_id='29112500-0000-4000-8000-000000000103') then raise exception 'Stale write left operation state'; end if;
end $once$;
delete from public.studio2_role_assignments where user_id='29112500-0000-4000-8000-000000000001';
set local role authenticated;
do $capability$
begin
 begin
  perform public.studio2_apply_confirmation_round_change(null,'create','{"editionId":"29112500-0000-4000-8000-000000000021","name":"Governed round"}','29112500-0000-4000-8000-000000000101','round-state:create',0);
  raise exception 'Missing capability replay accepted';
 exception when insufficient_privilege then null; end;
end $capability$;
reset role;
insert into public.studio2_role_assignments(user_id,role_key) values('29112500-0000-4000-8000-000000000001','organizer');
delete from auth.sessions where id='29112500-0000-4000-8000-000000000011';
set local role authenticated;
do $revoked$
begin
 begin
  perform public.studio2_apply_confirmation_round_change(null,'create','{"editionId":"29112500-0000-4000-8000-000000000021","name":"Governed round"}','29112500-0000-4000-8000-000000000101','round-state:create',0);
  raise exception 'Revoked session replay accepted';
 exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
end $revoked$;
set local role service_role;
do $raw$
begin
 begin update public.studio2_confirmation_round_versions set version=999; raise exception 'Raw revision accepted'; exception when insufficient_privilege then null; end;
 begin delete from private.v3_confirmation_operations; raise exception 'Raw operation deletion accepted'; exception when insufficient_privilege then null; end;
end $raw$;
rollback;
