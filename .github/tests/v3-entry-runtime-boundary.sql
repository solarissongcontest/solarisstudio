\set ON_ERROR_STOP on
begin;
-- CONTRACTS
do $catalog$
declare c jsonb; a jsonb; f record; t text; role_name text; col text; actual text[]; expected text[];
begin
 if jsonb_array_length(current_setting('test.internal_mechanisms')::jsonb)<>6 then raise exception 'Missing Entry mechanism proofs'; end if;
 for c in select value from jsonb_array_elements(current_setting('test.internal_mechanisms')::jsonb || current_setting('test.internal_callers')::jsonb) loop
  select p.*,pg_get_userbyid(p.proowner) owner_name into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'=c->>'signature';
  if f.oid is null or f.owner_name<>'postgres' or md5(pg_get_functiondef(f.oid))<>c->>'definitionHash' or f.prosecdef<>(c->>'securityDefiner')::boolean or not exists(select 1 from unnest(f.proconfig) x where x like 'search_path=pg_catalog,%pg_temp') then raise exception 'Entry implementation/path drift: %',c->>'signature'; end if;
  select array_agg(x order by x) into expected from jsonb_array_elements_text(coalesce(c->'executeRoles','["postgres"]'::jsonb)) x;
  select array_agg(case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end order by case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end) into actual from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) acl where acl.privilege_type='EXECUTE';
  if actual is distinct from expected then raise exception 'Entry execution exposure drift: %',c->>'signature'; end if;
  select coalesce(array_agg(x order by x),array[]::text[]) into expected from jsonb_array_elements_text(c->'callerSignatures') x;
  select coalesce(array_agg(n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' order by n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'),array[]::text[]) into actual from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','private','televoting') and p.prokind='f' and p.prosrc ~ ('\m'||f.proname||'[\"]?[[:space:]]*\(');
  if actual is distinct from expected then raise exception 'Entry caller graph drift: %',c->>'signature'; end if;
  for a in select value from jsonb_array_elements(c->'attachments') loop
   if not exists(select 1 from pg_trigger where tgrelid=(a->>'table')::regclass and tgfoid=f.oid and tgtype=(a->>'type')::int and tgenabled='O' and md5(pg_get_triggerdef(oid))=a->>'definitionHash') then raise exception 'Entry trigger attachment drift: %',c->>'signature'; end if;
  end loop;
  for t in select jsonb_array_elements_text(c->'inputTables') loop
   foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name,t,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Raw Entry source DML: %',t; end if;
    for col in select attname from pg_attribute where attrelid=t::regclass and attnum>0 and not attisdropped loop
     if has_column_privilege(role_name,t,col,'INSERT,UPDATE') then raise exception 'Raw Entry source column DML: %.%',t,col; end if;
    end loop;
   end loop;
  end loop;
 end loop;
end $catalog$;
insert into auth.users(id,aud,role,email) values
 ('29230000-0000-4000-8000-000000000001','authenticated','authenticated','entry-authority@local.invalid'),
 ('29230000-0000-4000-8000-000000000002','authenticated','authenticated','entry-denied@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('29230000-0000-4000-8000-000000000011','29230000-0000-4000-8000-000000000001',now(),now()),
 ('29230000-0000-4000-8000-000000000012','29230000-0000-4000-8000-000000000002',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29230000-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,slug,edition_number,status) values
 ('29230000-0000-4000-8000-000000000021','Entry A','entry-a-29230000',29230000,'active'),
 ('29230000-0000-4000-8000-000000000022','Entry B','entry-b-29230000',29230001,'active');
insert into public.countries(id,name,short_code) values('29230000-0000-4000-8000-000000000041','Entryland','E3A');
insert into public.participants(id,edition_id,country_id,youtube_url) values
 ('29230000-0000-4000-8000-000000000071','29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041','https://youtu.be/older'),
 ('29230000-0000-4000-8000-000000000072','29230000-0000-4000-8000-000000000022','29230000-0000-4000-8000-000000000041','https://youtu.be/other');
insert into public.entries(id,edition_id,country_id,artist,song_title,song_url,status,source) values
 ('29230000-0000-4000-8000-000000000061','29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041','Artist A','Song A','https://youtu.be/old-approved','confirmed','confirmations'),
 ('29230000-0000-4000-8000-000000000062','29230000-0000-4000-8000-000000000022','29230000-0000-4000-8000-000000000041','Artist B','Song B','https://youtu.be/other','confirmed','confirmations');
-- Seed valid review evidence before the canonical source changes.
insert into public.studio2_media_asset_reviews(edition_id,asset_key,asset_type,country_id,entry_id,source_fingerprint,decision,reason,reviewed_by) values
 ('29230000-0000-4000-8000-000000000021','entry:29230000-0000-4000-8000-000000000061:performance_video','performance_video','29230000-0000-4000-8000-000000000041','29230000-0000-4000-8000-000000000061','https://youtu.be/old-approved','approved','Fixture approval','29230000-0000-4000-8000-000000000001'),
 ('29230000-0000-4000-8000-000000000022','entry:29230000-0000-4000-8000-000000000062:performance_video','performance_video','29230000-0000-4000-8000-000000000041','29230000-0000-4000-8000-000000000062','https://youtu.be/other','approved','Fixture approval','29230000-0000-4000-8000-000000000001');
insert into public.contest_entities(id,edition_id,country_id,entity_type,display_name,abbreviation) values('29230000-0000-4000-8000-000000000051','29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041','global','Entryland','E3A');
insert into public.submission_rounds(id,edition_id,name,status) values('29230000-0000-4000-8000-000000000081','29230000-0000-4000-8000-000000000021','Entry versions','open');
insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,selection_method) values('29230000-0000-4000-8000-000000000091','29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000081','entry_versions','Entryland',true,'internal');
select set_config('solaris.v3_entry_credits_context','{"credits":[{"role":"composer","name":"  Composer  "}]}',true);
insert into public.internal_entries(id,submission_id,artist,song_title,song_url) values('29230000-0000-4000-8000-000000000111','29230000-0000-4000-8000-000000000091','Version artist','Version song','https://youtu.be/canonical');
select set_config('solaris.v3_entry_credits_context','',true);
update public.internal_entries set review_status='accepted',reviewed_at=now(),reviewed_by='29230000-0000-4000-8000-000000000001' where id='29230000-0000-4000-8000-000000000111';
set local role service_role;
do $source$ declare result jsonb; begin
 result:=public.v3_sync_confirmation_entry('29230000-0000-4000-8000-000000000091');
 if result->>'ok'<>'true' or result->>'status'<>'synced' then raise exception 'Canonical source reconciliation failed'; end if;
end $source$;
reset role;
-- The source-content reconciliation updates the link and invalidates its old
-- media decision. A later status change must not re-approve that old decision.
select set_config('test.entry.version',(select version::text from public.studio2_participation_status_versions where edition_id='29230000-0000-4000-8000-000000000021' and subject_key='country:29230000-0000-4000-8000-000000000041'),true);
select set_config('test.entry.other_version',(select version::text from public.studio2_participation_status_versions where edition_id='29230000-0000-4000-8000-000000000022' and subject_key='country:29230000-0000-4000-8000-000000000041'),true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29230000-0000-4000-8000-000000000001","session_id":"29230000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $command$
declare result jsonb; replay jsonb;
begin
 result:=public.studio2_apply_participation_status('29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041',null,'withdrawn','29230000-0000-4000-8000-000000000101','entry:withdraw',current_setting('test.entry.version')::bigint);
 replay:=public.studio2_apply_participation_status('29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041',null,'withdrawn','29230000-0000-4000-8000-000000000101','entry:withdraw',current_setting('test.entry.version')::bigint);
 if result<>replay or result->>'ok'<>'true' or (result->>'version')::bigint<=current_setting('test.entry.version')::bigint then raise exception 'Participation lost-response retry failed'; end if;
 begin perform public.studio2_apply_participation_status('29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041',null,'confirmed','29230000-0000-4000-8000-000000000102','entry:stale',current_setting('test.entry.version')::bigint); raise exception 'Stale Entry mutation accepted'; exception when sqlstate 'PT409' then null; end;
 begin perform public.studio2_apply_participation_status('29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041',null,'confirmed','29230000-0000-4000-8000-000000000101','entry:withdraw',current_setting('test.entry.version')::bigint); raise exception 'Changed Entry request accepted'; exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin perform public.admin_set_participation_status('29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041',null,'confirmed'); raise exception 'Legacy Entry authority exposed'; exception when insufficient_privilege then null; end;
end $command$;
reset role;
do $bounded$
begin
 if (select status from public.entries where id='29230000-0000-4000-8000-000000000061')<>'withdrawn' or (select participation_status from public.participants where id='29230000-0000-4000-8000-000000000071')<>'withdrawn' then raise exception 'Participation persistence split'; end if;
 if (select youtube_url from public.participants where id='29230000-0000-4000-8000-000000000071')<>'https://youtu.be/canonical' or (select youtube_url from public.participants where id='29230000-0000-4000-8000-000000000072')<>'https://youtu.be/other' then raise exception 'Entry link consequence escaped scope'; end if;
 if not exists(select 1 from public.studio2_media_asset_reviews where entry_id='29230000-0000-4000-8000-000000000061' and superseded_at is not null) or exists(select 1 from public.studio2_media_asset_reviews where entry_id='29230000-0000-4000-8000-000000000062' and superseded_at is not null) then raise exception 'Media invalidation escaped scope'; end if;
 if (select version from public.studio2_participation_status_versions where edition_id='29230000-0000-4000-8000-000000000022' and subject_key='country:29230000-0000-4000-8000-000000000041')<>current_setting('test.entry.other_version')::bigint then raise exception 'Participation CAS escaped edition'; end if;
 if (select count(*) from public.admin_audit_log where action='participation_status_changed' and after_data->>'operationId'='29230000-0000-4000-8000-000000000101')<>1 or (select count(*) from private.v3_domain_events where operation_id='29230000-0000-4000-8000-000000000101')<>1 then raise exception 'Entry retry duplicated audit/event'; end if;
end $bounded$;
select set_config('test.entry.next',(select version::text from public.studio2_participation_status_versions where edition_id='29230000-0000-4000-8000-000000000021' and subject_key='country:29230000-0000-4000-8000-000000000041'),true);
create function pg_temp.fail_entry_receipt() returns trigger language plpgsql as $$begin
 if tg_table_name='studio2_operation_receipts' then
  if new.operation_id='29230000-0000-4000-8000-000000000103' and new.status='succeeded' then raise exception 'injected Entry receipt failure'; end if;
 elsif tg_table_name='admin_audit_log' then
  if new.after_data->>'operationId'='29230000-0000-4000-8000-000000000105' then raise exception 'injected Entry audit failure'; end if;
 elsif tg_table_name='v3_domain_events' then
  if new.operation_id='29230000-0000-4000-8000-000000000106' then raise exception 'injected Entry event failure'; end if;
 end if;
 return new;
end$$;
create trigger v3_test_entry_receipt before update on public.studio2_operation_receipts for each row execute function pg_temp.fail_entry_receipt();
create trigger v3_test_entry_audit before insert on public.admin_audit_log for each row execute function pg_temp.fail_entry_receipt();
create trigger v3_test_entry_event before insert on private.v3_domain_events for each row execute function pg_temp.fail_entry_receipt();
set local role authenticated;
do $rollback$ declare i integer; begin
 foreach i in array array[103,105,106] loop
  begin perform public.studio2_apply_participation_status('29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041',null,'confirmed',('29230000-0000-4000-8000-000000000'||i)::uuid,'entry:rollback:'||i,current_setting('test.entry.next')::bigint); raise exception 'Atomicity failure accepted'; exception when raise_exception then if sqlerrm not in ('injected Entry receipt failure','injected Entry audit failure','injected Entry event failure') then raise; end if; end;
 end loop;
end $rollback$;
reset role;
do $intact$ begin
 if (select status from public.entries where id='29230000-0000-4000-8000-000000000061')<>'withdrawn' or (select participation_status from public.participants where id='29230000-0000-4000-8000-000000000071')<>'withdrawn' or exists(select 1 from public.studio2_operation_receipts where operation_id='29230000-0000-4000-8000-000000000103') or exists(select 1 from private.v3_domain_events where operation_id='29230000-0000-4000-8000-000000000103') or exists(select 1 from public.admin_audit_log where after_data->>'operationId'='29230000-0000-4000-8000-000000000103') then raise exception 'Receipt failure partially committed Entry'; end if;
 if (select version from public.studio2_participation_status_versions where edition_id='29230000-0000-4000-8000-000000000021' and subject_key='country:29230000-0000-4000-8000-000000000041')<>current_setting('test.entry.next')::bigint or exists(select 1 from public.studio2_operation_receipts where operation_id in ('29230000-0000-4000-8000-000000000105','29230000-0000-4000-8000-000000000106')) or exists(select 1 from private.v3_domain_events where operation_id in ('29230000-0000-4000-8000-000000000105','29230000-0000-4000-8000-000000000106')) or exists(select 1 from public.admin_audit_log where after_data->>'operationId' in ('29230000-0000-4000-8000-000000000105','29230000-0000-4000-8000-000000000106')) then raise exception 'Audit/event failure left partial state'; end if;
end $intact$;
-- Entry version mechanisms record only real rows and reject caller-authored
-- revision identities. A discarded INSERT must leave no phantom history.
insert into public.internal_entries(id,submission_id,artist,song_title) values('29230000-0000-4000-8000-000000000112','29230000-0000-4000-8000-000000000091','Discarded artist','Discarded song') on conflict(submission_id) do nothing;
select set_config('test.entry.original_version',(select current_version_id::text from public.internal_entries where id='29230000-0000-4000-8000-000000000111'),true);
update public.internal_entries set review_status='accepted',reviewed_at=now(),reviewed_by='29230000-0000-4000-8000-000000000001' where id='29230000-0000-4000-8000-000000000111';
update public.internal_entries set artist='New artist',content_revision=999,current_version_id='29230000-0000-4000-8000-000000000199' where id='29230000-0000-4000-8000-000000000111';
do $versions$
declare e public.internal_entries%rowtype;
begin
 select * into e from public.internal_entries where id='29230000-0000-4000-8000-000000000111';
 if e.content_revision<>2 or e.current_version_id::text=current_setting('test.entry.original_version') or e.current_version_id='29230000-0000-4000-8000-000000000199' or e.review_status<>'pending' or e.reviewed_version_id is not null then raise exception 'Version/stale-review invariant failed'; end if;
 if e.credits<>'[{"role":"composer","name":"Composer"}]'::jsonb then raise exception 'Credits context not normalized'; end if;
 if (select count(*) from private.v3_entry_versions where entry_id=e.id)<>2 or exists(select 1 from private.v3_entry_versions where entry_id='29230000-0000-4000-8000-000000000112') then raise exception 'Entry version history contains duplicates/phantoms'; end if;
 if not exists(select 1 from private.v3_entry_versions where id=e.current_version_id and parent_version_id::text=current_setting('test.entry.original_version') and content->>'artist'='New artist') then raise exception 'Immutable Entry lineage missing'; end if;
end $versions$;
-- The shared version/credits implementation also covers NF candidates.
insert into public.countries(id,name,short_code) values('29230000-0000-4000-8000-000000000042','NF Entryland','E3N');
insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,selection_method) values('29230000-0000-4000-8000-000000000092','29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000081','entry_nf_versions','NF Entryland',true,'national_final');
insert into public.national_finals(id,submission_id,nf_name,expected_entry_count) values('29230000-0000-4000-8000-000000000131','29230000-0000-4000-8000-000000000092','Version NF',1);
select set_config('solaris.v3_entry_credits_context','{"nf_entries":[{"artist":"NF artist","song_title":"NF song","credits":[{"role":"lyricist","name":"  Lyricist  "}]}]}',true);
insert into public.national_final_entries(id,national_final_id,position,artist,song_title) values('29230000-0000-4000-8000-000000000121','29230000-0000-4000-8000-000000000131',1,'NF artist','NF song');
select set_config('solaris.v3_entry_credits_context','',true);
update public.national_final_entries set artist='NF revised artist' where id='29230000-0000-4000-8000-000000000121';
do $nf_versions$ begin
 if not exists(select 1 from public.national_final_entries where id='29230000-0000-4000-8000-000000000121' and content_revision=2 and credits='[{"role":"lyricist","name":"Lyricist"}]'::jsonb) or (select count(*) from private.v3_entry_versions where entry_id='29230000-0000-4000-8000-000000000121')<>2 then raise exception 'NF version/credits consequence failed'; end if;
 begin update public.internal_entries set submission_id='29230000-0000-4000-8000-000000000092' where id='29230000-0000-4000-8000-000000000111'; raise exception 'Versioned Entry ownership drift accepted'; exception when sqlstate '22023' then if sqlerrm<>'Versioned entries cannot change their Confirmation ownership' then raise; end if; end;
end $nf_versions$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29230000-0000-4000-8000-000000000002","session_id":"29230000-0000-4000-8000-000000000012"}',true);
set local role authenticated;
do $unauthorized$ begin
 begin perform public.studio2_apply_participation_status('29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041',null,'confirmed','29230000-0000-4000-8000-000000000104','entry:denied',current_setting('test.entry.next')::bigint); raise exception 'Unauthorized Entry mutation accepted'; exception when insufficient_privilege then null; end;
 begin update public.entries set status='confirmed' where id='29230000-0000-4000-8000-000000000061'; raise exception 'Raw Entry mutation accepted'; exception when insufficient_privilege then null; end;
end $unauthorized$;
reset role;
delete from public.studio2_role_assignments where user_id='29230000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29230000-0000-4000-8000-000000000001","session_id":"29230000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $capability_revoked$ begin
 begin perform public.studio2_apply_participation_status('29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041',null,'withdrawn','29230000-0000-4000-8000-000000000101','entry:withdraw',current_setting('test.entry.version')::bigint); raise exception 'Revoked capability recovery accepted'; exception when insufficient_privilege then null; end;
end $capability_revoked$;
reset role;
insert into public.studio2_role_assignments(user_id,role_key) values('29230000-0000-4000-8000-000000000001','organizer');
delete from auth.sessions where id='29230000-0000-4000-8000-000000000011';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29230000-0000-4000-8000-000000000001","session_id":"29230000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $revoked$ begin
 begin perform public.studio2_apply_participation_status('29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041',null,'withdrawn','29230000-0000-4000-8000-000000000101','entry:withdraw',current_setting('test.entry.version')::bigint); raise exception 'Revoked Entry recovery accepted'; exception when insufficient_privilege then null; end;
end $revoked$;
set local role service_role;
do $service$ begin
 begin perform public.studio2_apply_participation_status('29230000-0000-4000-8000-000000000021','29230000-0000-4000-8000-000000000041',null,'confirmed','29230000-0000-4000-8000-000000000104','entry:service',0); raise exception 'Service transport became Entry authority'; exception when insufficient_privilege then null; end;
end $service$;
rollback;
