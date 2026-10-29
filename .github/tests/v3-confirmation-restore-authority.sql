\set ON_ERROR_STOP on
begin;
insert into auth.users(id,aud,role,email) values('29173000-0000-4000-8000-000000000001','authenticated','authenticated','restore-authority@local.invalid'),('29173000-0000-4000-8000-000000000002','authenticated','authenticated','restore-denied@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values('29173000-0000-4000-8000-000000000011','29173000-0000-4000-8000-000000000001',now(),now()),('29173000-0000-4000-8000-000000000012','29173000-0000-4000-8000-000000000002',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29173000-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,slug,edition_number,status) values('29173000-0000-4000-8000-000000000021','Restore authority','restore-authority-29173000',29173000,'active');
insert into public.submission_rounds(id,name,edition_id,status) values('29173000-0000-4000-8000-000000000031','Restore round','29173000-0000-4000-8000-000000000021','open');
insert into public.submissions(id,round_id,edition_id,instagram_username,country,participating,selection_method,edit_count) values('29173000-0000-4000-8000-000000000041','29173000-0000-4000-8000-000000000031','29173000-0000-4000-8000-000000000021','restore-authority','Restoreland',true,'internal',1);
insert into public.internal_entries(id,submission_id,artist,song_title,song_url) values('29173000-0000-4000-8000-000000000051','29173000-0000-4000-8000-000000000041','Historical artist','Historical song','https://youtu.be/historical');
insert into public.submission_versions(id,submission_id,version,snapshot) select '29173000-0000-4000-8000-000000000061',s.id,1,jsonb_build_object('submission',to_jsonb(s),'internal',to_jsonb(i),'national_final',null,'nf_entries','[]'::jsonb) from public.submissions s join public.internal_entries i on i.submission_id=s.id where s.id='29173000-0000-4000-8000-000000000041';
update public.internal_entries set song_title='Current song' where id='29173000-0000-4000-8000-000000000051';
select set_config('test.restore.rev',private.v3_confirmation_response_delete_revision('29173000-0000-4000-8000-000000000041'),true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29173000-0000-4000-8000-000000000001","session_id":"29173000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $restore$
declare result jsonb; replay jsonb;
begin
 begin perform public.admin_restore_confirmation_version('29173000-0000-4000-8000-000000000041','29173000-0000-4000-8000-000000000061','Reviewed restore',repeat('0',64),'29173000-0000-4000-8000-000000000101','restore:one'); raise exception 'Stale restore accepted'; exception when sqlstate 'PT409' then null; end;
 result:=public.admin_restore_confirmation_version('29173000-0000-4000-8000-000000000041','29173000-0000-4000-8000-000000000061','Reviewed restore',current_setting('test.restore.rev'),'29173000-0000-4000-8000-000000000101','restore:one');
 replay:=public.admin_restore_confirmation_version('29173000-0000-4000-8000-000000000041','29173000-0000-4000-8000-000000000061','Reviewed restore',current_setting('test.restore.rev'),'29173000-0000-4000-8000-000000000101','restore:one');
 if result->>'ok'<>'true' or replay->>'replayed'<>'true' or result->>'captured_version'<>replay->>'captured_version' then raise exception 'Restore receipt readback failed'; end if;
 begin perform public.admin_restore_confirmation_version('29173000-0000-4000-8000-000000000041','29173000-0000-4000-8000-000000000061','Changed restore reason',current_setting('test.restore.rev'),'29173000-0000-4000-8000-000000000101','restore:one'); raise exception 'Changed restore accepted'; exception when raise_exception then if position('IDEMPOTENCY_CONFLICT' in sqlerrm)=0 then raise; end if; end;
 begin perform public.admin_restore_confirmation_version('29173000-0000-4000-8000-000000000041','29173000-0000-4000-8000-000000000061','Another restore',current_setting('test.restore.rev'),'29173000-0000-4000-8000-000000000102','restore:stale'); raise exception 'Stale restore accepted'; exception when sqlstate 'PT409' then null; end;
end $restore$;
reset role;
do $once$
begin
 if (select song_title from public.internal_entries where submission_id='29173000-0000-4000-8000-000000000041')<>'Historical song' then raise exception 'Historical content not restored'; end if;
 if (select count(*) from public.submission_versions where submission_id='29173000-0000-4000-8000-000000000041')<>2 then raise exception 'Restore retry duplicated history'; end if;
 if (select count(*) from public.admin_audit_log where action='confirmation_response_restored' and record_id='29173000-0000-4000-8000-000000000041')<>1 then raise exception 'Restore retry duplicated audit'; end if;
 if (select count(*) from private.v3_domain_events where operation_id='29173000-0000-4000-8000-000000000101')<>1 then raise exception 'Restore event missing/duplicate'; end if;
 if (select count(*) from private.v3_domain_event_outbox where event_id in (select id from private.v3_domain_events where operation_id='29173000-0000-4000-8000-000000000101'))<>2 then raise exception 'Restore durable deliveries missing/duplicate'; end if;
 if not exists(select 1 from public.submission_versions where submission_id='29173000-0000-4000-8000-000000000041' and actor_user_id='29173000-0000-4000-8000-000000000001' and change_source='organizer_restore') then raise exception 'Restore actor provenance missing'; end if;
 if to_regprocedure('public.admin_restore_confirmation_version(uuid,uuid,text)') is not null then raise exception 'Unversioned restore peer remains'; end if;
 if has_function_privilege('authenticated','public.admin_restore_confirmation_version_apply(uuid,uuid,text)','EXECUTE') or has_function_privilege('service_role','private.v3_restore_confirmation_version_core(uuid,uuid,text)','EXECUTE') then raise exception 'Restore implementation exposed'; end if;
end $once$;
-- An event failure cannot leave a committed restore without recoverable state.
update public.internal_entries set song_title='New current song' where submission_id='29173000-0000-4000-8000-000000000041';
select set_config('test.restore.next',private.v3_confirmation_response_delete_revision('29173000-0000-4000-8000-000000000041'),true);
create function pg_temp.fail_restore_event() returns trigger language plpgsql as $$begin if new.event_type='confirmation.submitted' then raise exception 'injected restore event failure'; end if; return new; end$$;
create trigger v3_test_restore_event_failure before insert on private.v3_domain_events for each row execute function pg_temp.fail_restore_event();
set local role authenticated;
do $rollback$ begin
 begin perform public.admin_restore_confirmation_version('29173000-0000-4000-8000-000000000041','29173000-0000-4000-8000-000000000061','Rollback restore',current_setting('test.restore.next'),'29173000-0000-4000-8000-000000000103','restore:rollback'); raise exception 'Event failure accepted'; exception when raise_exception then if sqlerrm<>'injected restore event failure' then raise; end if; end;
end $rollback$;
reset role;
do $intact$ begin
 if (select song_title from public.internal_entries where submission_id='29173000-0000-4000-8000-000000000041')<>'New current song' or (select count(*) from public.submission_versions where submission_id='29173000-0000-4000-8000-000000000041')<>2 or exists(select 1 from public.studio2_operation_receipts where operation_id='29173000-0000-4000-8000-000000000103') then raise exception 'Event failure partially committed restoration'; end if;
end $intact$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29173000-0000-4000-8000-000000000002","session_id":"29173000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
do $denied$ begin
 begin perform public.admin_restore_confirmation_version('29173000-0000-4000-8000-000000000041','29173000-0000-4000-8000-000000000061','Denied restore',current_setting('test.restore.next'),'29173000-0000-4000-8000-000000000104','restore:denied'); raise exception 'Unauthorized restore accepted'; exception when insufficient_privilege then null; end;
end $denied$;
reset role;
delete from auth.sessions where id='29173000-0000-4000-8000-000000000011';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29173000-0000-4000-8000-000000000001","session_id":"29173000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $revoked$ begin
 begin perform public.admin_restore_confirmation_version('29173000-0000-4000-8000-000000000041','29173000-0000-4000-8000-000000000061','Reviewed restore',current_setting('test.restore.rev'),'29173000-0000-4000-8000-000000000101','restore:one'); raise exception 'Revoked restore retry accepted'; exception when insufficient_privilege then null; end;
end $revoked$;
rollback;
