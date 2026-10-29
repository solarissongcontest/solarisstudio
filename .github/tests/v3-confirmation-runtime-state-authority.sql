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

-- Governed permanent response deletion, including recovery without a live row.
begin;
insert into auth.users(id,aud,role,email) values
 ('29133000-0000-4000-8000-000000000001','authenticated','authenticated','delete-authority@local.invalid'),
 ('29133000-0000-4000-8000-000000000002','authenticated','authenticated','delete-denied@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('29133000-0000-4000-8000-000000000011','29133000-0000-4000-8000-000000000001',now(),now()),
 ('29133000-0000-4000-8000-000000000012','29133000-0000-4000-8000-000000000002',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29133000-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,slug,edition_number,status) values('29133000-0000-4000-8000-000000000021','Delete authority','delete-authority-29133000',29133000,'active');
insert into public.submission_rounds(id,edition_id,name,status) values('29133000-0000-4000-8000-000000000031','29133000-0000-4000-8000-000000000021','Delete authority','open');
insert into public.countries(id,name,short_code) values
 ('29133000-0000-4000-8000-000000000041','Delete A','D3A'),('29133000-0000-4000-8000-000000000042','Delete B','D3B'),('29133000-0000-4000-8000-000000000043','Delete C','D3C');
insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,selection_method) values
 ('29133000-0000-4000-8000-000000000061','29133000-0000-4000-8000-000000000021','29133000-0000-4000-8000-000000000031','delete_a','Delete A',true,'internal'),
 ('29133000-0000-4000-8000-000000000062','29133000-0000-4000-8000-000000000021','29133000-0000-4000-8000-000000000031','delete_b','Delete B',true,'internal'),
 ('29133000-0000-4000-8000-000000000063','29133000-0000-4000-8000-000000000021','29133000-0000-4000-8000-000000000031','delete_c','Delete C',true,'internal');
insert into public.internal_entries(submission_id,artist,song_title) select id,'Delete artist','Delete song' from public.submissions where edition_id='29133000-0000-4000-8000-000000000021';
delete from public.internal_entries where submission_id='29133000-0000-4000-8000-000000000063';
update public.submissions set selection_method='national_final' where id='29133000-0000-4000-8000-000000000063';
insert into public.national_finals(id,submission_id,nf_name,expected_entry_count) values('29133000-0000-4000-8000-000000000081','29133000-0000-4000-8000-000000000063','Delete NF',1);
insert into public.national_final_entries(national_final_id,position,artist,song_title) values('29133000-0000-4000-8000-000000000081',1,'NF artist','NF song');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29133000-0000-4000-8000-000000000001","session_id":"29133000-0000-4000-8000-000000000011"}',true);
select set_config('test.delete.stale',public.admin_confirmation_response('29133000-0000-4000-8000-000000000061')->>'delete_revision',true);
-- A selection edit invalidates deletion even without changing parent updated_at.
update public.internal_entries set song_title='Changed after preview' where submission_id='29133000-0000-4000-8000-000000000061';
select set_config('test.delete.current',public.admin_confirmation_response('29133000-0000-4000-8000-000000000061')->>'delete_revision',true);
select set_config('test.delete.rollback',public.admin_confirmation_response('29133000-0000-4000-8000-000000000062')->>'delete_revision',true);
set local role authenticated;
do $delete_cases$
declare first_result jsonb; retry jsonb; recovered jsonb;
begin
 begin
  perform public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000061',current_setting('test.delete.stale'),'29133000-0000-4000-8000-000000000101','delete:stale');
  raise exception 'Stale deletion accepted';
 exception when sqlstate 'PT409' then if sqlerrm<>'VERSION_CONFLICT' then raise; end if; end;
 first_result:=public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000061',current_setting('test.delete.current'),'29133000-0000-4000-8000-000000000102','delete:success');
 if not (first_result->>'deleted')::boolean then raise exception 'Authorized delete did not commit'; end if;
 -- Discard the response, then retry the exact request after row removal.
 retry:=public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000061',current_setting('test.delete.current'),'29133000-0000-4000-8000-000000000102','delete:success');
 if retry-'replayed'<>first_result-'replayed' or not (retry->>'replayed')::boolean then raise exception 'Lost-response retry did not read back committed deletion'; end if;
 begin
  perform public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000061',current_setting('test.delete.current'),'29133000-0000-4000-8000-000000000112','delete:already-gone-new-identity');
  raise exception 'Missing response accepted with new operation';
 exception when sqlstate 'PT409' then if sqlerrm<>'VERSION_CONFLICT' then raise; end if; end;
 recovered:=public.studio2_reconcile_operation('29133000-0000-4000-8000-000000000102');
 if recovered->>'status'<>'succeeded' or not (recovered#>>'{result,deleted}')::boolean then raise exception 'Receipt readback failed after deletion'; end if;
 begin
  perform public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000061',repeat('f',64),'29133000-0000-4000-8000-000000000102','delete:success');
  raise exception 'Changed revision on committed operation accepted';
 exception when sqlstate 'P0001' then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin
  perform public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000063',current_setting('test.delete.current'),'29133000-0000-4000-8000-000000000102','delete:success');
  raise exception 'Changed target on committed operation accepted';
 exception when sqlstate 'P0001' then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
end $delete_cases$;
reset role;
do $once$
begin
 if exists(select 1 from public.submissions where id='29133000-0000-4000-8000-000000000061') or exists(select 1 from public.internal_entries where submission_id='29133000-0000-4000-8000-000000000061') then raise exception 'Response cascade incomplete'; end if;
 if (select count(*) from public.admin_audit_log where action='confirmation_response_deleted' and record_id='29133000-0000-4000-8000-000000000061')<>1 then raise exception 'Duplicate/missing delete audit'; end if;
 if (select count(*) from public.studio2_operation_receipts where actor_id='29133000-0000-4000-8000-000000000001' and command='confirmation.response.delete')<>1 then raise exception 'Duplicate receipt or stale receipt retained'; end if;
 if not exists(select 1 from public.studio2_confirmation_requirements where edition_id='29133000-0000-4000-8000-000000000021' and country_id='29133000-0000-4000-8000-000000000041' and status='required' and resolved_by_submission_id is null) then raise exception 'Delete requirement consequence incoherent'; end if;
 if to_regprocedure('public.admin_confirmation_delete_response(uuid)') is not null then raise exception 'Unversioned delete peer remains'; end if;
 if has_function_privilege('service_role','public.admin_confirmation_delete_response(uuid,text,uuid,text)','EXECUTE') or has_function_privilege('anon','public.admin_confirmation_delete_response(uuid,text,uuid,text)','EXECUTE') then raise exception 'Ungoverned actor execution remains'; end if;
end $once$;
select public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000063',public.admin_confirmation_response('29133000-0000-4000-8000-000000000063')->>'delete_revision','29133000-0000-4000-8000-000000000109','delete:national-final');
do $nf_cascade$ begin
 if exists(select 1 from public.national_finals where id='29133000-0000-4000-8000-000000000081') or exists(select 1 from public.national_final_entries where national_final_id='29133000-0000-4000-8000-000000000081') then raise exception 'National Final cascade incomplete'; end if;
end $nf_cascade$;
set local role service_role;
do $receipt_forgery$ begin
 begin insert into public.studio2_operation_receipts(operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,command,risk_class,scope,status,result,completed_at)
 values('29133000-0000-4000-8000-000000000108','29133000-0000-4000-8000-000000000001','delete:forged','29133000-0000-4000-8000-000000000108',repeat('a',64),'confirmation.response.delete','R2','{}','succeeded','{"deleted":true}',now()); raise exception 'Service forged committed delete proof'; exception when insufficient_privilege then if sqlerrm<>'Confirmation delete receipts are command-owned' then raise; end if; end;
 begin update public.studio2_operation_receipts set command='forged-other-command' where operation_id='29133000-0000-4000-8000-000000000102'; raise exception 'Service changed committed delete proof'; exception when insufficient_privilege then if sqlerrm<>'Confirmation delete receipts are command-owned' then raise; end if; end;
 begin delete from public.studio2_operation_receipts where operation_id='29133000-0000-4000-8000-000000000102'; raise exception 'Service removed delete recovery'; exception when insufficient_privilege then if sqlerrm<>'Confirmation delete receipts are command-owned' then raise; end if; end;
 begin truncate public.studio2_operation_receipts cascade; raise exception 'Service truncated recovery history'; exception when insufficient_privilege then null; end;
end $receipt_forgery$;
reset role;
-- Audit failure must roll back the response, children, requirement and claim.
create function pg_temp.v3_fail_confirmation_delete() returns trigger language plpgsql as $failure$
begin if new.action='confirmation_response_deleted' then raise exception 'fixture audit failure'; end if; return new; end $failure$;
create trigger v3_test_delete_audit_failure before insert on public.admin_audit_log for each row execute function pg_temp.v3_fail_confirmation_delete();
set local role authenticated;
do $audit_failure$ begin
 begin perform public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000062',current_setting('test.delete.rollback'),'29133000-0000-4000-8000-000000000105','delete:audit-failure'); raise exception 'Audit failure ignored'; exception when sqlstate 'P0001' then if sqlerrm<>'fixture audit failure' then raise; end if; end;
end $audit_failure$;
reset role;
drop trigger v3_test_delete_audit_failure on public.admin_audit_log;
create function pg_temp.v3_fail_confirmation_delete_receipt() returns trigger language plpgsql as $failure$
begin if new.command='confirmation.response.delete' and new.status='succeeded' then raise exception 'fixture receipt failure'; end if; return new; end $failure$;
create trigger v3_test_delete_receipt_failure before update on public.studio2_operation_receipts for each row execute function pg_temp.v3_fail_confirmation_delete_receipt();
set local role authenticated;
do $receipt_failure$ begin
 begin perform public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000062',current_setting('test.delete.rollback'),'29133000-0000-4000-8000-000000000106','delete:receipt-failure'); raise exception 'Receipt failure ignored'; exception when sqlstate 'P0001' then if sqlerrm<>'fixture receipt failure' then raise; end if; end;
end $receipt_failure$;
reset role;
drop trigger v3_test_delete_receipt_failure on public.studio2_operation_receipts;
do $intact$ begin
 if not exists(select 1 from public.submissions where id='29133000-0000-4000-8000-000000000062') or not exists(select 1 from public.internal_entries where submission_id='29133000-0000-4000-8000-000000000062') then raise exception 'Failed deletion lost response or content'; end if;
 if not exists(select 1 from public.studio2_confirmation_requirements where resolved_by_submission_id='29133000-0000-4000-8000-000000000062' and status='satisfied') then raise exception 'Failed deletion changed requirement'; end if;
 if exists(select 1 from public.studio2_operation_receipts where operation_id in ('29133000-0000-4000-8000-000000000105','29133000-0000-4000-8000-000000000106')) or exists(select 1 from public.admin_audit_log where action='confirmation_response_deleted' and record_id='29133000-0000-4000-8000-000000000062') then raise exception 'Failed deletion left receipt/audit'; end if;
end $intact$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29133000-0000-4000-8000-000000000002","session_id":"29133000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
do $unauthorized$ begin
 begin perform public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000062',current_setting('test.delete.rollback'),'29133000-0000-4000-8000-000000000104','delete:unauthorized'); raise exception 'Unauthorized deletion accepted'; exception when insufficient_privilege then null; end;
end $unauthorized$;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29133000-0000-4000-8000-000000000001","session_id":"29133000-0000-4000-8000-000000000011"}',true);
delete from auth.sessions where id='29133000-0000-4000-8000-000000000011';
set local role authenticated;
do $revoked$ begin
 begin perform public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000062',current_setting('test.delete.rollback'),'29133000-0000-4000-8000-000000000107','delete:revoked'); raise exception 'Revoked deletion accepted'; exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
 begin perform public.admin_confirmation_delete_response('29133000-0000-4000-8000-000000000061',current_setting('test.delete.current'),'29133000-0000-4000-8000-000000000102','delete:success'); raise exception 'Revoked receipt replay accepted'; exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
end $revoked$;
rollback;
