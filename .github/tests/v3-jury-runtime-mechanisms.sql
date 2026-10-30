\set ON_ERROR_STOP on
begin;
-- CONTRACTS
do $catalog$
declare c jsonb; a jsonb; f record; t text; role_name text; col text; actual text[]; expected text[];
begin
 if jsonb_array_length(current_setting('test.internal_mechanisms')::jsonb)<>6 then raise exception 'Missing Jury mechanism proofs'; end if;
 for c in select value from jsonb_array_elements(current_setting('test.internal_mechanisms')::jsonb || current_setting('test.internal_callers')::jsonb) loop
  select p.*,pg_get_userbyid(p.proowner) owner_name into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'=c->>'signature';
  if f.oid is null or f.owner_name<>'postgres' or md5(pg_get_functiondef(f.oid))<>c->>'definitionHash' or f.prosecdef<>(c->>'securityDefiner')::boolean or not exists(select 1 from unnest(f.proconfig) x where x like 'search_path=pg_catalog,%pg_temp') then raise exception 'Jury implementation/path drift: %',c->>'signature'; end if;
  select array_agg(x order by x) into expected from jsonb_array_elements_text(coalesce(c->'executeRoles','["postgres"]'::jsonb)) x;
  select array_agg(case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end order by case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end) into actual from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) acl where acl.privilege_type='EXECUTE';
  if actual is distinct from expected then raise exception 'Jury execution exposure drift: %',c->>'signature'; end if;
  select coalesce(array_agg(x order by x),array[]::text[]) into expected from jsonb_array_elements_text(c->'callerSignatures') x;
  select coalesce(array_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' order by n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'),array[]::text[]) into actual from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','televoting') and p.prokind='f' and p.prosrc ~ ('\m'||f.proname||'[\"]?[[:space:]]*\(');
  if actual is distinct from expected then raise exception 'Jury caller graph drift: %',c->>'signature'; end if;
  for a in select value from jsonb_array_elements(c->'attachments') loop
   if not exists(select 1 from pg_trigger where tgrelid=(a->>'table')::regclass and tgfoid=f.oid and tgtype=(a->>'type')::int and tgenabled='O' and md5(pg_get_triggerdef(oid))=a->>'definitionHash') then raise exception 'Jury trigger attachment drift: %',c->>'signature'; end if;
  end loop;
  for t in select jsonb_array_elements_text(c->'inputTables') loop
   foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name,t,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Raw Jury source DML: %',t; end if;
    for col in select attname from pg_attribute where attrelid=t::regclass and attnum>0 and not attisdropped loop
     if has_column_privilege(role_name,t,col,'INSERT,UPDATE') then raise exception 'Raw Jury source column DML: %.%',t,col; end if;
    end loop;
   end loop;
  end loop;
 end loop;
end $catalog$;
insert into auth.users(id,aud,role,email) values
 ('29234500-0000-4000-8000-000000000001','authenticated','authenticated','jury-authority@local.invalid'),
 ('29234500-0000-4000-8000-000000000002','authenticated','authenticated','jury-denied@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('29234500-0000-4000-8000-000000000011','29234500-0000-4000-8000-000000000001',now(),now()),
 ('29234500-0000-4000-8000-000000000012','29234500-0000-4000-8000-000000000002',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29234500-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,slug,edition_number,status) values('29234500-0000-4000-8000-000000000021','Jury authority','jury-authority-29234500',29234500,'active');
insert into public.countries(id,name,short_code) values
 ('29234500-0000-4000-8000-000000000041','Jury voter','JRV'),
 ('29234500-0000-4000-8000-000000000042','Jury recipient A','JRA'),
 ('29234500-0000-4000-8000-000000000043','Jury recipient B','JRB'),
 ('29234500-0000-4000-8000-000000000044','Not in this show','JRX');
insert into public.shows(id,edition_id,name,kind,sort_order,voting_config) values('29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000021','Jury final','final',1,'{"juryEnabled":true,"televoteEnabled":false,"juryPoints":[12],"allowSelfVote":false}');
insert into public.participants(edition_id,show_id,country_id,running_order) values
 ('29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000042',1),
 ('29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000043',2);
insert into public.voters(id,edition_id,show_id,country_id,name,kind) values('29234500-0000-4000-8000-000000000051','29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000041','Jury voter','country');
create function pg_temp.score(op integer,revision bigint,action text default 'assign',points integer default 12,recipient uuid default '29234500-0000-4000-8000-000000000042') returns jsonb language sql as $$
 select public.studio2_apply_jury_vote_change('29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000051','29234500-0000-4000-8000-000000000041',null,case when action='assign' then recipient else null end,null,points,action,('29234500-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid,'jury:score:'||op,revision)
$$;
create function pg_temp.review(op integer,revision bigint,target text default 'valid',reason text default 'Reviewed ballot') returns jsonb language sql as $$
 select public.studio2_apply_jury_ballot_review('29234500-0000-4000-8000-000000000061',target,reason,('29234500-0000-4000-8000-'||lpad(op::text,12,'0'))::uuid,'jury:review:'||op,revision)
$$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29234500-0000-4000-8000-000000000001","session_id":"29234500-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $manual$
declare result jsonb; replay jsonb;
begin
 result:=pg_temp.score(101,0); replay:=pg_temp.score(101,0);
 if result->'result' is distinct from replay->'result' or replay->>'replayed'<>'true' or result#>>'{result,version}'<>'1' then raise exception 'Manual CAS/retry/readback failed'; end if;
 begin perform pg_temp.score(101,0,'assign',10); raise exception 'Changed request accepted'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin perform pg_temp.score(102,0); raise exception 'Stale score accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform pg_temp.score(104,1,'assign',13); raise exception 'Unconfigured points accepted'; exception when invalid_parameter_value then null; end;
 begin perform pg_temp.score(105,1,'assign',12,'29234500-0000-4000-8000-000000000044'); raise exception 'Unrelated recipient accepted'; exception when check_violation then null; when insufficient_privilege then null; end;
 begin perform public.studio2_apply_jury_vote_change('29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031',null,'29234500-0000-4000-8000-000000000042',null,'29234500-0000-4000-8000-000000000042',null,12,'assign','29234500-0000-4000-8000-000000000106','jury:self',1); raise exception 'Self vote accepted'; exception when check_violation then null; end;
 result:=pg_temp.score(103,1,'clear'); replay:=pg_temp.score(103,1,'clear');
 if result->'result' is distinct from replay->'result' or result#>>'{result,version}'<>'2' or result#>>'{result,deletedRows}'<>'1' then raise exception 'Deleted manual score readback failed'; end if;
end $manual$;
reset role;
do $once$ begin
 if exists(select 1 from public.jury_votes where show_id='29234500-0000-4000-8000-000000000031') or (select version from public.studio2_jury_vote_versions where show_id='29234500-0000-4000-8000-000000000031')<>2 then raise exception 'Manual score/counter escaped scope'; end if;
 if (select count(*) from public.admin_audit_log where actor_id='29234500-0000-4000-8000-000000000001' and action like 'jury_vote_%')<>2 or (select count(*) from public.studio2_operation_receipts where actor_id='29234500-0000-4000-8000-000000000001')<>2 then raise exception 'Retry or rejection duplicated score audit/receipt'; end if;
end $once$;
insert into public.jury_ballot_statuses(edition_id,show_id,voter_id,voter_country_id,status,note) values('29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000051','29234500-0000-4000-8000-000000000041','did_not_vote','Authorized absence fixture');
set local role authenticated;
do $dnv$ begin
 begin perform pg_temp.score(107,2); raise exception 'DNV point assignment accepted'; exception when object_not_in_prerequisite_state then null; end;
end $dnv$;
reset role;
delete from public.jury_ballot_statuses where show_id='29234500-0000-4000-8000-000000000031';
-- Independently fail both audit and receipt after row persistence/projection.
create function pg_temp.fail_jury_evidence() returns trigger language plpgsql as $$begin
 if tg_table_name='admin_audit_log' then
  if new.after_data->>'operationId' in ('29234500-0000-4000-8000-000000000108','29234500-0000-4000-8000-000000000118') then raise exception 'injected jury audit failure'; end if;
 elsif new.status='succeeded' and new.operation_id in ('29234500-0000-4000-8000-000000000109','29234500-0000-4000-8000-000000000119') then raise exception 'injected jury receipt failure'; end if;
 return new;
end$$;
create trigger v3_test_jury_audit before insert on public.admin_audit_log for each row execute function pg_temp.fail_jury_evidence();
create trigger v3_test_jury_receipt before update on public.studio2_operation_receipts for each row execute function pg_temp.fail_jury_evidence();
select set_config('test.jury.results',(select jsonb_agg(to_jsonb(r) order by r.id)::text from public.results r where show_id='29234500-0000-4000-8000-000000000031'),true);
set local role authenticated;
do $rollback$ declare op integer; begin
 foreach op in array array[108,109] loop
  begin perform pg_temp.score(op,2); raise exception 'Failed score committed'; exception when raise_exception then if sqlerrm not in ('injected jury audit failure','injected jury receipt failure') then raise; end if; end;
 end loop;
end $rollback$;
reset role;
do $intact$ begin
 if exists(select 1 from public.jury_votes where show_id='29234500-0000-4000-8000-000000000031') or (select version from public.studio2_jury_vote_versions where show_id='29234500-0000-4000-8000-000000000031')<>2 or (select jsonb_agg(to_jsonb(r) order by r.id) from public.results r where show_id='29234500-0000-4000-8000-000000000031') is distinct from current_setting('test.jury.results')::jsonb or exists(select 1 from public.studio2_operation_receipts where operation_id in ('29234500-0000-4000-8000-000000000108','29234500-0000-4000-8000-000000000109')) then raise exception 'Failed score left partial canonical/projection state'; end if;
end $intact$;
-- Participant submission is immutable evidence; review changes its lifecycle,
-- never its score rows. Deferred scope/FK guards are forced before continuing.
insert into televoting.vote_preflight_checks(id,username_normalized,country_code,channel,canonical_edition_id,show_id,account_user_id) values('29234500-0000-4000-8000-000000000071','jury_authority','JRA','jury','29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000002');
insert into public.jury_ballot_submissions(id,edition_id,show_id,user_id,voter_country_id,preflight_id) values('29234500-0000-4000-8000-000000000061','29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000002','29234500-0000-4000-8000-000000000042','29234500-0000-4000-8000-000000000071');
insert into public.jury_votes(id,edition_id,show_id,voter_country_id,receiving_country_id,points,ballot_submission_id) values('29234500-0000-4000-8000-000000000081','29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000042','29234500-0000-4000-8000-000000000043',12,'29234500-0000-4000-8000-000000000061');
update televoting.vote_preflight_checks set jury_ballot_submission_id='29234500-0000-4000-8000-000000000061',submitted_at=now() where id='29234500-0000-4000-8000-000000000071';
set constraints all immediate;
set constraints all deferred;
select set_config('test.jury.notification_ops',(select coalesce(jsonb_agg(operation_id order by operation_id),'[]')::text from public.studio2_operation_receipts where actor_id='29234500-0000-4000-8000-000000000001' and command='notification.queue'),true);
select set_config('test.jury.vote',(select to_jsonb(v)::text from public.jury_votes v where id='29234500-0000-4000-8000-000000000081'),true);
select set_config('test.jury.operation',coalesce((select to_jsonb(r)::text from public.studio2_result_operations r where show_id='29234500-0000-4000-8000-000000000031'),'null'),true);
select set_config('test.jury.tasks',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]')::text from public.studio2_organizer_tasks t where edition_id='29234500-0000-4000-8000-000000000021'),true);
set local role authenticated;
do $review_rollback$ declare op integer; begin
 foreach op in array array[118,119] loop
  begin perform pg_temp.review(op,1); raise exception 'Failed review committed'; exception when raise_exception then if sqlerrm not in ('injected jury audit failure','injected jury receipt failure') then raise; end if; end;
 end loop;
end $review_rollback$;
reset role;
do $review_intact$ begin
 if (select status from public.jury_ballot_submissions where id='29234500-0000-4000-8000-000000000061')<>'submitted' or (select review_version from public.jury_ballot_submissions where id='29234500-0000-4000-8000-000000000061')<>1 or coalesce((select to_jsonb(r) from public.studio2_result_operations r where show_id='29234500-0000-4000-8000-000000000031'),'null'::jsonb) is distinct from current_setting('test.jury.operation')::jsonb or (select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]') from public.studio2_organizer_tasks t where edition_id='29234500-0000-4000-8000-000000000021') is distinct from current_setting('test.jury.tasks')::jsonb then raise exception 'Failed review left a consequence or semantic change'; end if;
end $review_intact$;
set local role authenticated;
do $review$ declare result jsonb; replay jsonb; begin
 result:=pg_temp.review(111,1); replay:=pg_temp.review(111,1);
 if replay->>'replayed'<>'true' or result-'replayed' is distinct from replay-'replayed' then raise exception 'Review exact retry failed after version/status changed'; end if;
 begin perform pg_temp.review(111,1,'valid','Changed note'); raise exception 'Changed review accepted'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin perform pg_temp.review(112,1,'needs_review','Stale review'); raise exception 'Stale review accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.studio2_apply_jury_vote_change('29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031',null,'29234500-0000-4000-8000-000000000042',null,'29234500-0000-4000-8000-000000000043',null,12,'assign','29234500-0000-4000-8000-000000000113','jury:evidence',3); raise exception 'Immutable submitted evidence overwritten'; exception when object_not_in_prerequisite_state then null; end;
end $review$;
reset role;
do $review_once$ begin
 if (select count(*) from public.admin_audit_log where actor_id='29234500-0000-4000-8000-000000000001' and action='jury_ballot_review_transition')<>1 or (select count(*) from public.studio2_operation_receipts where actor_id='29234500-0000-4000-8000-000000000001' and command like 'jury.%')<>3 then raise exception 'Review retry/rejection duplicated audit/receipt: audits %, operations %',(select count(*) from public.admin_audit_log where actor_id='29234500-0000-4000-8000-000000000001' and action='jury_ballot_review_transition'),(select jsonb_agg(jsonb_build_object('command',command,'operation',operation_id)) from public.studio2_operation_receipts where actor_id='29234500-0000-4000-8000-000000000001'); end if;
 if (select to_jsonb(v) from public.jury_votes v where id='29234500-0000-4000-8000-000000000081') is distinct from current_setting('test.jury.vote')::jsonb then raise exception 'Review rewrote immutable vote evidence'; end if;
 if (select calculation_version from public.studio2_result_operations where show_id='29234500-0000-4000-8000-000000000031')<>1 or (select coalesce(jsonb_agg(operation_id order by operation_id),'[]') from public.studio2_operation_receipts where actor_id='29234500-0000-4000-8000-000000000001' and command='notification.queue') is distinct from current_setting('test.jury.notification_ops')::jsonb then raise exception 'Review retry duplicated provisional invalidation or durable notification identity'; end if;
 if (select jury_points from public.results where show_id='29234500-0000-4000-8000-000000000031' and country_id='29234500-0000-4000-8000-000000000043')<>12 then raise exception 'Canonical review did not apply its provisional projection'; end if;
 if (select count(*) from private.v3_domain_events where operation_id='29234500-0000-4000-8000-000000000111' and event_type='jury.ballot_changed' and payload->>'fromStatus'='submitted')<>1 or (select count(*) from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id where e.operation_id='29234500-0000-4000-8000-000000000111' and o.consumer_key='jury.tasks')<>1 then raise exception 'Review retry duplicated or lost durable event identity'; end if;
end $review_once$;
-- Projection or task failure must roll back review and its receipt, rather
-- than leaving an unofficial cache or responsibility ahead of canonical truth.
create function pg_temp.fail_jury_consequence() returns trigger language plpgsql as $$begin
 if current_setting('test.jury.fail_consequence',true)=tg_table_name and new.edition_id='29234500-0000-4000-8000-000000000021' then raise exception 'injected jury consequence failure'; end if;
 return new;
end$$;
create trigger v3_test_jury_projection before insert or update on public.results for each row execute function pg_temp.fail_jury_consequence();
create trigger v3_test_jury_tasks before insert or update on public.studio2_organizer_tasks for each row execute function pg_temp.fail_jury_consequence();
select set_config('test.jury.fail_consequence','results',true);
set local role authenticated;
do $projection$ begin
 begin perform pg_temp.review(116,2,'needs_review','Review consequence rollback'); raise exception 'Failed projection committed'; exception when raise_exception then if sqlerrm<>'injected jury consequence failure' then raise; end if; end;
end $projection$;
reset role;
select set_config('test.jury.fail_consequence','studio2_organizer_tasks',true);
set local role authenticated;
do $tasks$ begin
 begin perform pg_temp.review(117,2,'needs_review','Review task rollback'); raise exception 'Failed task consequence committed'; exception when raise_exception then if sqlerrm<>'injected jury consequence failure' then raise; end if; end;
end $tasks$;
reset role;
select set_config('test.jury.fail_consequence','',true);
drop trigger v3_test_jury_projection on public.results;
drop trigger v3_test_jury_tasks on public.studio2_organizer_tasks;
do $consequence_intact$ begin
 if (select review_version from public.jury_ballot_submissions where id='29234500-0000-4000-8000-000000000061')<>2 or (select calculation_version from public.studio2_result_operations where show_id='29234500-0000-4000-8000-000000000031')<>1 or (select jury_points from public.results where show_id='29234500-0000-4000-8000-000000000031' and country_id='29234500-0000-4000-8000-000000000043')<>12 or exists(select 1 from public.studio2_operation_receipts where operation_id in ('29234500-0000-4000-8000-000000000116','29234500-0000-4000-8000-000000000117')) then raise exception 'Failed derived consequence left partial truth'; end if;
end $consequence_intact$;
create function pg_temp.fail_jury_event() returns trigger language plpgsql as $$begin
 if new.operation_id='29234500-0000-4000-8000-000000000120' then raise exception 'injected jury event failure'; end if;
 return new;
end$$;
create trigger v3_test_jury_event before insert on private.v3_domain_events for each row execute function pg_temp.fail_jury_event();
set local role authenticated;
do $event$ begin
 begin perform pg_temp.review(120,2,'needs_review','Review event rollback'); raise exception 'Failed event committed'; exception when raise_exception then if sqlerrm<>'injected jury event failure' then raise; end if; end;
end $event$;
reset role;
drop trigger v3_test_jury_event on private.v3_domain_events;
do $event_atomic$ begin
 if (select review_version from public.jury_ballot_submissions where id='29234500-0000-4000-8000-000000000061')<>2 or exists(select 1 from public.studio2_operation_receipts where operation_id='29234500-0000-4000-8000-000000000120') or exists(select 1 from public.admin_audit_log where after_data->>'operationId'='29234500-0000-4000-8000-000000000120') then raise exception 'Failed durable event left partial mutation/audit/receipt'; end if;
end $event_atomic$;
-- A result version lock protects Jury inputs. Existing successful commands still
-- recover even after finalization. This is fixture setup, not Results certification.
update public.studio2_result_operations set reviewed_version=calculation_version,reviewed_at=now(),locked_version=calculation_version,locked_at=now(),reveal_ready_version=calculation_version,reveal_ready_at=now() where show_id='29234500-0000-4000-8000-000000000031';
set local role authenticated;
do $locked$ begin
 perform pg_temp.score(101,0); perform pg_temp.review(111,1);
 begin perform pg_temp.score(121,3); raise exception 'Locked score changed'; exception when object_not_in_prerequisite_state then null; end;
 begin perform pg_temp.review(122,2,'needs_review','Locked review'); raise exception 'Locked review changed'; exception when object_not_in_prerequisite_state then null; end;
end $locked$;
reset role;
-- Validate the actual publication boundary in a subtransaction. The test
-- rolls this fixture state back instead of repairing publication afterward.
reset role;
do $publication$
begin
 begin
  update public.studio2_show_publication_controls set state='public',version=version+1,frozen_config='{"results":true}',source_result_version=1 where show_id='29234500-0000-4000-8000-000000000031';
  update public.shows set published=true,publication_config='{"results":true}' where id='29234500-0000-4000-8000-000000000031';
  begin perform pg_temp.score(123,3); raise exception 'Published Jury input mutated'; exception when object_not_in_prerequisite_state then null; end;
  begin perform pg_temp.review(124,2,'needs_review','Published review'); raise exception 'Published Jury review mutated'; exception when object_not_in_prerequisite_state then null; end;
  perform pg_temp.score(101,0); perform pg_temp.review(111,1);
  raise exception 'discard publication fixture' using errcode='ZP001';
 exception when sqlstate 'ZP001' then null;
 end;
end $publication$;
set constraints all immediate;
set constraints all deferred;
-- Scope survives source disappearance. Neither recovery path consults the
-- current ballot, vote row, result state or replacement preview after commit.
update public.studio2_result_operations set reviewed_version=null,locked_version=null,reveal_ready_version=null where show_id='29234500-0000-4000-8000-000000000031';
delete from public.jury_votes where id='29234500-0000-4000-8000-000000000081';
delete from public.jury_ballot_submissions where id='29234500-0000-4000-8000-000000000061';
set local role authenticated;
select pg_temp.review(111,1);
reset role;
-- Forward adoption of a committed old scope-only receipt uses immutable audit
-- to bind the formerly omitted reason, even with the historical ballot gone.
insert into televoting.vote_preflight_checks(id,username_normalized,country_code,channel,canonical_edition_id,show_id,account_user_id) values('29234500-0000-4000-8000-000000000072','historical_jury','JRB','jury','29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000002');
insert into public.jury_ballot_submissions(id,edition_id,show_id,user_id,voter_country_id,preflight_id,status,review_version,review_reason,reviewed_at,reviewed_by) values('29234500-0000-4000-8000-000000000062','29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031','29234500-0000-4000-8000-000000000002','29234500-0000-4000-8000-000000000043','29234500-0000-4000-8000-000000000072','invalidated',2,'Historical adjudication',now(),'29234500-0000-4000-8000-000000000001');
update televoting.vote_preflight_checks set jury_ballot_submission_id='29234500-0000-4000-8000-000000000062',submitted_at=now() where id='29234500-0000-4000-8000-000000000072';
do $legacy_seed$ declare scope jsonb; op uuid:='29234500-0000-4000-8000-000000000190'; begin
 scope:=jsonb_build_object('ballotId','29234500-0000-4000-8000-000000000062','editionId','29234500-0000-4000-8000-000000000021','showId','29234500-0000-4000-8000-000000000031','fromStatus','submitted','toStatus','invalidated','expectedVersion',1);
 perform private.studio2_claim_operation(op,'jury:legacy','jury.ballot.review.invalidated','R2',scope);
 insert into public.admin_audit_log(actor_id,action,table_name,record_id,before_data,after_data) values(auth.uid(),'jury_ballot_review_transition','jury_ballot_submissions','29234500-0000-4000-8000-000000000062','{"status":"submitted","version":1}',jsonb_build_object('status','invalidated','version',2,'reason','Historical adjudication','operationId',op));
 perform private.studio2_complete_operation(op,jsonb_build_object('ok',true,'ballotId','29234500-0000-4000-8000-000000000062','status','invalidated','version',2,'operationId',op));
end $legacy_seed$;
set constraints all immediate;
set constraints all deferred;
delete from public.jury_ballot_submissions where id='29234500-0000-4000-8000-000000000062';
set local role authenticated;
do $legacy_recovery$ declare result jsonb; begin
 result:=public.studio2_apply_jury_ballot_review('29234500-0000-4000-8000-000000000062','invalidated','Historical adjudication','29234500-0000-4000-8000-000000000190','jury:legacy',1);
 if result->>'replayed'<>'true' then raise exception 'Historical committed review was lost'; end if;
 begin perform public.studio2_apply_jury_ballot_review('29234500-0000-4000-8000-000000000062','invalidated','Changed history','29234500-0000-4000-8000-000000000190','jury:legacy',1); raise exception 'Historical reason substitution accepted'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
end $legacy_recovery$;
reset role;
do $pending_claim$
declare scope jsonb; first_claim jsonb; second_claim jsonb; op uuid:='29234500-0000-4000-8000-000000000191';
begin
 scope:=jsonb_build_object('editionId','29234500-0000-4000-8000-000000000021','showId','29234500-0000-4000-8000-000000000031','voterId','29234500-0000-4000-8000-000000000051','voterCountryId','29234500-0000-4000-8000-000000000041','voterEntityId',null,'receivingCountryId','29234500-0000-4000-8000-000000000042','receivingEntityId',null,'points',12,'action','assign','expectedVersion',4);
 first_claim:=private.studio2_claim_operation(op,'jury:score:191','jury.vote.assign','R2',scope);
 second_claim:=private.studio2_claim_operation(op,'jury:score:191','jury.vote.assign','R2',scope);
 if first_claim->>'replayed'<>'false' or second_claim->>'replayed'<>'true' or second_claim->>'status'<>'processing' then raise exception 'An existing pending S2 claim was recreated'; end if;
end $pending_claim$;
set local role authenticated;
do $pending_is_not_authority$ begin
 begin perform pg_temp.score(191,4); raise exception 'Pending receipt granted fresh mutation authority'; exception when raise_exception then if sqlerrm<>'OPERATION_PENDING' then raise; end if; end;
end $pending_is_not_authority$;
-- Fresh capability is required even for a committed receipt.
reset role;
delete from public.studio2_role_assignments where user_id='29234500-0000-4000-8000-000000000001';
set local role authenticated;
do $capability$ begin
 begin perform pg_temp.review(111,1); raise exception 'Revoked capability review recovery accepted'; exception when insufficient_privilege then null; end;
 begin perform pg_temp.score(101,0); raise exception 'Revoked capability score recovery accepted'; exception when insufficient_privilege then null; end;
end $capability$;
reset role;
insert into public.studio2_role_assignments(user_id,role_key) values('29234500-0000-4000-8000-000000000001','organizer');
delete from auth.sessions where id='29234500-0000-4000-8000-000000000011';
set local role authenticated;
do $revoked$ begin
 begin perform pg_temp.review(111,1); raise exception 'Revoked session review recovery accepted'; exception when insufficient_privilege then null; end;
 begin perform pg_temp.score(101,0); raise exception 'Revoked session score recovery accepted'; exception when insufficient_privilege then null; end;
end $revoked$;
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29234500-0000-4000-8000-000000000002","session_id":"29234500-0000-4000-8000-000000000012"}',true);
set local role authenticated;
do $denied$ begin
 begin perform pg_temp.score(125,4); raise exception 'Unauthorized score accepted'; exception when insufficient_privilege then null; end;
 begin perform public.assign_jury_vote('29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031',null,'29234500-0000-4000-8000-000000000041',null,'29234500-0000-4000-8000-000000000042',null,12); raise exception 'Legacy score bypass accepted'; exception when insufficient_privilege then null; end;
 begin perform public.clear_jury_point('29234500-0000-4000-8000-000000000021','29234500-0000-4000-8000-000000000031',null,'29234500-0000-4000-8000-000000000041',null,12); raise exception 'Legacy clear bypass accepted'; exception when insufficient_privilege then null; end;
end $denied$;
set local role service_role;
do $service$ begin
 begin perform pg_temp.score(126,4); raise exception 'Service credentials became score authority'; exception when insufficient_privilege then null; end;
 begin perform pg_temp.review(111,1); raise exception 'Service credentials became review authority'; exception when insufficient_privilege then null; end;
end $service$;
reset role;
set constraints all immediate;
rollback;
