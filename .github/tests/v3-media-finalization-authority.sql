\set ON_ERROR_STOP on
begin;
insert into public.countries(id,name,short_code)values('27182200-0000-4000-8000-000000000002','Isolated Media Country','MCX');
update public.studio2_platform_operational_state set mode='normal',version=version+1 where singleton=true;


insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('27182200-0000-4000-8000-000000000001','authenticated','authenticated','media-owner@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('27182200-0000-4000-8000-000000000011','27182200-0000-4000-8000-000000000001',now(),now());
insert into public.country_accounts(user_id,country_id,status)values('27182200-0000-4000-8000-000000000001','27182200-0000-4000-8000-000000000002','active');
set local role authenticated;
set local request.jwt.claims='{"sub":"27182200-0000-4000-8000-000000000001","role":"authenticated","session_id":"27182200-0000-4000-8000-000000000011"}';
do $prepare$ declare r jsonb;begin
 r:=public.studio2_prepare_upload('country_media','27182200-0000-4000-8000-000000000002','flags','prepared.png','image/png',3,'{}');
 if r->>'token_id' is null or r->>'upload_secret' is null or r->>'bucket'<>'solaris-upload-quarantine' then raise exception 'Governed Media preparation broken by table cutover';end if;
end $prepare$;
reset role;
insert into storage.buckets(id,name,public) values
 ('v3-media-authority-test','v3-media-authority-test',false);
insert into public.studio2_upload_authorizations(
 id,actor_id,entity_id,domain,final_bucket,quarantine_path,final_path,
 original_name,declared_mime,expected_size,authorization_secret
) values (
 '27182200-0000-4000-8000-000000000021',
 '27182200-0000-4000-8000-000000000001',
 '27182200-0000-4000-8000-000000000002',
 'country_media',
 'v3-media-authority-test',
 'fixture/quarantine',
 'fixture/final',
 'fixture.png',
 'image/png',
 3,
 'fixture-secret'
);

select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;

do $test$
declare
  v_out jsonb;
begin
  begin
    update public.studio2_upload_authorizations
    set status='verified'
    where id='27182200-0000-4000-8000-000000000021';
    raise exception 'Raw worker update unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.v3_finalize_media_upload(
      '27182200-0000-4000-8000-000000000021',
      'wrong-secret',
      '27182200-0000-4000-8000-000000000001',
      '27182200-0000-4000-8000-000000000011',
      'verified',
      'image/png',
      '{}',
      null
    );
    raise exception 'Invalid capability unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.v3_finalize_media_upload(
      '27182200-0000-4000-8000-000000000021',
      'fixture-secret',
      '27182200-0000-4000-8000-000000000001',
      '27182200-0000-4000-8000-000000000099',
      'verified',
      'image/png',
      '{}',
      null
    );
    raise exception 'Revoked/nonexistent caller session unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    perform public.v3_finalize_media_upload(
      '27182200-0000-4000-8000-000000000021',
      'fixture-secret',
      '27182200-0000-4000-8000-000000000001',
      '27182200-0000-4000-8000-000000000011',
      'verified',
      'image/png',
      '{"signatureVerified":true,"quarantineVerified":true,"originalSize":3,"publishedSize":3,"publicationDecision":"published_after_verification"}',
      null
    );
    raise exception 'Hashless verification unexpectedly succeeded';
  exception when check_violation then null;
  end;

  begin
    perform public.v3_finalize_media_upload(
      '27182200-0000-4000-8000-000000000021',
      'fixture-secret',
      '27182200-0000-4000-8000-000000000001',
      '27182200-0000-4000-8000-000000000011',
      'verified',
      'image/png',
      '{"signatureVerified":true,"quarantineVerified":true,"originalSize":3,"publishedSize":3,"publicationDecision":"published_after_verification","hashAlgorithm":"sha256","publishedSha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}',
      null
    );
    raise exception 'Missing published object unexpectedly certified';
  exception when check_violation then null;
  end;
end
$test$;

reset role;
insert into storage.objects(bucket_id,name,metadata)
values ('v3-media-authority-test','fixture/final','{"size":3}');

-- Check the database gate and fresh actor scope independently of Edge checks.
update public.studio2_platform_operational_state set mode='read_only',version=version+1 where singleton=true;
set local role service_role;
do $blocked$ declare denied boolean:=false;begin
 begin perform public.v3_finalize_media_upload('27182200-0000-4000-8000-000000000021','fixture-secret','27182200-0000-4000-8000-000000000001','27182200-0000-4000-8000-000000000011','verified','image/png','{"signatureVerified":true,"quarantineVerified":true,"originalSize":3,"publishedSize":3,"publicationDecision":"published_after_verification","hashAlgorithm":"sha256","publishedSha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}',null);
 exception when read_only_sql_transaction then denied:=true;end;
 if not denied then raise exception 'Media bypassed database read-only mode';end if;
end $blocked$;
reset role;
update public.studio2_platform_operational_state set mode='normal',version=version+1 where singleton=true;
update public.country_accounts set status='suspended' where user_id='27182200-0000-4000-8000-000000000001';
set local role service_role;
do $revoked$ declare denied boolean:=false;begin
 begin perform public.v3_finalize_media_upload('27182200-0000-4000-8000-000000000021','fixture-secret','27182200-0000-4000-8000-000000000001','27182200-0000-4000-8000-000000000011','verified','image/png','{"signatureVerified":true,"quarantineVerified":true,"originalSize":3,"publishedSize":3,"publicationDecision":"published_after_verification","hashAlgorithm":"sha256","publishedSha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}',null);
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Media accepted revoked country authority';end if;
end $revoked$;
reset role;
update public.country_accounts set status='active' where user_id='27182200-0000-4000-8000-000000000001';
set local role service_role;
select public.v3_finalize_media_upload(
  '27182200-0000-4000-8000-000000000021',
  'fixture-secret',
  '27182200-0000-4000-8000-000000000001',
  '27182200-0000-4000-8000-000000000011',
  'verified',
  'image/png',
  '{"signatureVerified":true,"quarantineVerified":true,"originalSize":3,"publishedSize":3,"publicationDecision":"published_after_verification","hashAlgorithm":"sha256","publishedSha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}',
  null
);

do $test$
declare
  v_replay jsonb;
  v_readback jsonb;
begin
  v_replay := public.v3_finalize_media_upload(
    '27182200-0000-4000-8000-000000000021',
    'fixture-secret',
    '27182200-0000-4000-8000-000000000001',
    '27182200-0000-4000-8000-000000000011',
    'verified',
    'image/png',
    '{"signatureVerified":true,"quarantineVerified":true,"originalSize":3,"publishedSize":3,"publicationDecision":"published_after_verification","hashAlgorithm":"sha256","publishedSha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}',
    null
  );
  if v_replay is null or v_replay->>'status' <> 'verified' then
    raise exception 'Same-byte terminal retry did not return canonical receipt';
  end if;

  begin
    perform public.v3_finalize_media_upload(
      '27182200-0000-4000-8000-000000000021',
      'fixture-secret',
      '27182200-0000-4000-8000-000000000001',
      '27182200-0000-4000-8000-000000000011',
      'verified',
      'image/png',
      '{"signatureVerified":true,"quarantineVerified":true,"originalSize":3,"publishedSize":3,"publicationDecision":"published_after_verification","hashAlgorithm":"sha256","publishedSha256":"cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34"}',
      null
    );
    raise exception 'Changed-byte retry unexpectedly succeeded';
  exception when check_violation then null;
  end;

  v_readback := public.v3_read_media_finalization_receipt(
    '27182200-0000-4000-8000-000000000021',
    'fixture-secret',
    '27182200-0000-4000-8000-000000000001',
    '27182200-0000-4000-8000-000000000011'
  );
  if v_readback is null
     or v_readback->>'status' <> 'verified'
     or v_readback->'metadata'->>'publishedSha256' <> 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
     or nullif(v_readback->'metadata'->>'storageObjectId','') is null then
    raise exception 'Canonical media receipt readback is incomplete';
  end if;
end
$test$;

reset role;
-- A completed command remains recoverable after its upload window expires.
update public.studio2_upload_authorizations set created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' where id='27182200-0000-4000-8000-000000000021';
set local role service_role;
do $expired_replay$ declare r jsonb;begin
 r:=public.v3_finalize_media_upload('27182200-0000-4000-8000-000000000021','fixture-secret','27182200-0000-4000-8000-000000000001','27182200-0000-4000-8000-000000000011','verified','image/png','{"signatureVerified":true,"quarantineVerified":true,"originalSize":3,"publishedSize":3,"publicationDecision":"published_after_verification","hashAlgorithm":"sha256","publishedSha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}',null);
 if r->>'status' is distinct from 'verified' then raise exception 'Expired window lost a completed receipt';end if;
end $expired_replay$;
reset role;

do $test$
declare
  v_role text;
  v_event_id uuid;
begin
  if (select status from public.studio2_upload_authorizations where id='27182200-0000-4000-8000-000000000021') <> 'verified' then
    raise exception 'Canonical receipt missing';
  end if;
  if (select verified_metadata->>'publishedSha256' from public.studio2_upload_authorizations where id='27182200-0000-4000-8000-000000000021') <> 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' then
    raise exception 'Canonical receipt is not byte-bound';
  end if;

  select id into v_event_id
  from private.v3_domain_events
  where event_type='media.verified'
    and aggregate_id='27182200-0000-4000-8000-000000000021';
  if v_event_id is null then
    raise exception 'media.verified event missing';
  end if;
  if (select payload->>'publishedSha256' from private.v3_domain_events where id=v_event_id) <> 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' then
    raise exception 'media.verified is not bound to canonical byte identity';
  end if;
  if (select count(*) from private.v3_domain_events where event_type='media.verified' and aggregate_id='27182200-0000-4000-8000-000000000021') <> 1 then
    raise exception 'Event not atomic/idempotent';
  end if;
  if (select count(*) from private.v3_domain_event_outbox where event_id=v_event_id) <> 0 then
    raise exception 'media.verified unexpectedly owns an async critical consequence';
  end if;
  if (select count(*) from public.studio2_operation_receipts where command='media.finalize' and scope->>'uploadTokenId'='27182200-0000-4000-8000-000000000021' and status='succeeded') <> 1 then
    raise exception 'Operation completion missing';
  end if;

  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(v_role,'public.studio2_upload_authorizations','INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Direct upload DML remains for %',v_role;
    end if;
    if has_function_privilege(v_role,'private.studio2_create_evidence_upload_authorization(uuid,uuid,uuid,text,text,text,bigint,text,jsonb)','EXECUTE') then
      raise exception 'Private preparation helper exposed to %',v_role;
    end if;
  end loop;
  if has_function_privilege('authenticated','public.v3_finalize_media_upload(uuid,text,uuid,uuid,text,text,jsonb,text)','EXECUTE') then
    raise exception 'Worker finalization command exposed to browser';
  end if;
  if has_function_privilege('authenticated','public.v3_read_media_finalization_receipt(uuid,text,uuid,uuid)','EXECUTE') then
    raise exception 'Worker receipt readback exposed to browser';
  end if;
end
$test$;

rollback;
