begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('27182200-0000-4000-8000-000000000001','authenticated','authenticated','media-owner@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('27182200-0000-4000-8000-000000000011','27182200-0000-4000-8000-000000000001',now(),now());
insert into storage.buckets(id,name,public) values ('v3-media-authority-test','v3-media-authority-test',false);
insert into public.studio2_upload_authorizations(id,actor_id,domain,final_bucket,quarantine_path,final_path,original_name,declared_mime,expected_size,authorization_secret)
 values ('27182200-0000-4000-8000-000000000021','27182200-0000-4000-8000-000000000001','country_media','v3-media-authority-test','fixture/quarantine','fixture/final','fixture.png','image/png',3,'fixture-secret');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
do $test$
declare v_out jsonb;
begin
 begin
  update public.studio2_upload_authorizations set status='verified' where id='27182200-0000-4000-8000-000000000021';
  raise exception 'Raw worker update unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
 begin
  perform public.v3_finalize_media_upload('27182200-0000-4000-8000-000000000021','wrong-secret','27182200-0000-4000-8000-000000000001','27182200-0000-4000-8000-000000000011','verified','image/png','{}',null);
  raise exception 'Invalid capability unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
 begin
  perform public.v3_finalize_media_upload('27182200-0000-4000-8000-000000000021','fixture-secret','27182200-0000-4000-8000-000000000001','27182200-0000-4000-8000-000000000099','verified','image/png','{}',null);
  raise exception 'Revoked/nonexistent caller session unexpectedly succeeded';
 exception when insufficient_privilege then null; end;
 begin
  perform public.v3_finalize_media_upload('27182200-0000-4000-8000-000000000021','fixture-secret','27182200-0000-4000-8000-000000000001','27182200-0000-4000-8000-000000000011','verified','image/png','{"signatureVerified":true,"quarantineVerified":true,"originalSize":3,"publishedSize":3,"publicationDecision":"published_after_verification"}',null);
  raise exception 'Missing published object unexpectedly certified';
 exception when check_violation then null; end;
end
$test$;
reset role;
insert into storage.objects(bucket_id,name,metadata) values ('v3-media-authority-test','fixture/final','{"size":3}');
set local role service_role;
select public.v3_finalize_media_upload('27182200-0000-4000-8000-000000000021','fixture-secret','27182200-0000-4000-8000-000000000001','27182200-0000-4000-8000-000000000011','verified','image/png','{"signatureVerified":true,"quarantineVerified":true,"originalSize":3,"publishedSize":3,"publicationDecision":"published_after_verification"}',null);
do $test$
begin
 if public.v3_finalize_media_upload('27182200-0000-4000-8000-000000000021','fixture-secret','27182200-0000-4000-8000-000000000001','27182200-0000-4000-8000-000000000011','rejected',null,'{}','Race lost') is not null then
  raise exception 'CAS race invented terminal success';
 end if;
end
$test$;
reset role;
do $test$
declare v_role text;
begin
 if (select status from public.studio2_upload_authorizations where id='27182200-0000-4000-8000-000000000021') <> 'verified' then raise exception 'Canonical receipt missing'; end if;
 if (select count(*) from private.v3_domain_events where event_type='media.verified' and aggregate_id='27182200-0000-4000-8000-000000000021') <> 1 then raise exception 'Event not atomic/idempotent'; end if;
 if (select count(*) from public.studio2_operation_receipts where command='media.finalize' and scope->>'uploadTokenId'='27182200-0000-4000-8000-000000000021' and status='succeeded') <> 1 then raise exception 'Operation completion missing'; end if;
 foreach v_role in array array['anon','authenticated','service_role'] loop
  if has_table_privilege(v_role,'public.studio2_upload_authorizations','INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Direct upload DML remains for %',v_role; end if;
  if has_function_privilege(v_role,'private.studio2_create_evidence_upload_authorization(uuid,uuid,uuid,text,text,text,bigint,text,jsonb)','EXECUTE') then raise exception 'Private preparation helper exposed to %',v_role; end if;
 end loop;
 if has_function_privilege('authenticated','public.v3_finalize_media_upload(uuid,text,uuid,uuid,text,text,jsonb,text)','EXECUTE') then raise exception 'Worker command exposed to browser'; end if;
end
$test$;
rollback;
