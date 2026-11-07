-- Run ONLY through rehearse-v3-world-follow-notification-candidates.sh.
-- Requires the TG9 statement and TG10 follow migrations in a disposable local stack.
-- The whole fixture including the local-only feature flag is ROLLED BACK.
\set ON_ERROR_STOP on
begin;

do $seed$
declare
  v_first uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_third uuid := gen_random_uuid();
  v_org uuid := gen_random_uuid();
  v_statement uuid := gen_random_uuid();
  v_version uuid := gen_random_uuid();
begin
  if to_regclass('public.world_statements') is null
     or to_regclass('public.fan_follow_categories') is null
     or to_regprocedure('private.world_statement_follow_notification_candidates_v1(uuid,uuid,uuid,integer)') is null then
    raise exception 'TG10_UPSTREAM_MIGRATIONS_NOT_APPLIED';
  end if;

  if has_function_privilege('authenticated',
       'private.world_statement_follow_notification_candidates_v1(uuid,uuid,uuid,integer)', 'EXECUTE')
     or has_function_privilege('anon',
       'private.world_statement_follow_notification_candidates_v1(uuid,uuid,uuid,integer)', 'EXECUTE') then
    raise exception 'TG10_PRIVATE_NOTIFICATION_RECIPIENTS_EXPOSED';
  end if;

  insert into auth.users(id,aud,role,email,created_at,updated_at)
  values
    (v_first,'authenticated','authenticated',v_first::text||'@world-candidates.invalid',now(),now()),
    (v_second,'authenticated','authenticated',v_second::text||'@world-candidates.invalid',now(),now()),
    (v_third,'authenticated','authenticated',v_third::text||'@world-candidates.invalid',now(),now());

  insert into public.world_organizations(
    id,slug,official_name,short_name,type,status,public_visibility
  ) values (
    v_org,'tg10-candidates-'||replace(v_org::text,'-',''),
    'Candidate Test Institution','CTI','international_organization','active','public'
  );

  perform set_config('solaris.tg10_candidate_fixture',jsonb_build_object(
    'first',v_first,'second',v_second,'third',v_third,
    'org',v_org,'statement',v_statement,'version',v_version
  )::text,true);
end $seed$;

-- Local-only enablement inside a transaction, reversed by final rollback.
update public.studio2_feature_flags
  set enabled=true,admins_only=false,user_ids='{}'::uuid[],edition_ids='{}'::uuid[]
where key='terra_world_public';
do $verify_flag$
begin
  if public.studio2_feature_enabled('terra_world_public',null) is distinct from true then
    raise exception 'TG10_LOCAL_WORLD_FLAG_NOT_ENABLED';
  end if;
end $verify_flag$;

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $follows$
declare
  v jsonb:=current_setting('solaris.tg10_candidate_fixture')::jsonb;
  v_actor uuid;
  v_level text;
begin
  for v_actor,v_level in
    select (v->>'first')::uuid,'important'::text union all
    select (v->>'second')::uuid,'all'::text union all
    select (v->>'third')::uuid,'none'::text
  loop
    perform set_config('request.jwt.claim.sub',v_actor::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object(
      'sub',v_actor,'role','authenticated')::text,true);
    perform public.set_fan_follow('organization',(v->>'org')::uuid,true,v_level);
  end loop;
end $follows$;
reset role;

-- Mirror the real lifecycle: an organization is public, the user follows it,
-- and only THEN the statement is published. PostgreSQL now() is transaction-
-- stable, so these two timestamps are equal in this rollback-only fixture;
-- the separate historical-follow scenario below tests strict late-follow
-- exclusion using an explicitly older publication time.
do $publish_after_follows$
declare
  v jsonb := current_setting('solaris.tg10_candidate_fixture')::jsonb;
  v_follower_count integer;
begin
  select count(*) into v_follower_count
  from public.fan_follows follow_row
  where follow_row.entity_type = 'organization'
    and follow_row.entity_id = (v->>'org')::uuid
    and follow_row.profile_id in (
      (v->>'first')::uuid,(v->>'second')::uuid,(v->>'third')::uuid
    );
  if v_follower_count <> 3 then
    raise exception 'TG10_PUBLISH_BEFORE_CANONICAL_FOLLOW, got %', v_follower_count;
  end if;

  insert into public.world_statements(id,organization_id,status,visibility,published_at)
  values((v->>'statement')::uuid,(v->>'org')::uuid,'published','public',now());
  insert into public.world_statement_versions(
    id,statement_id,version_number,title,body,published_at
  ) values(
    (v->>'version')::uuid,(v->>'statement')::uuid,1,
    'Canonical public statement',
    'Published text never appears in lock screen content.',now()
  );
  update public.world_statements
  set current_version_id=(v->>'version')::uuid
  where id=(v->>'statement')::uuid;

  if exists (
    select 1
    from public.fan_follows follow_row
    join public.world_statement_versions initial_version
      on initial_version.id=(v->>'version')::uuid
    where follow_row.entity_type='organization'
      and follow_row.entity_id=(v->>'org')::uuid
      and follow_row.created_at > initial_version.published_at
  ) then raise exception 'TG10_PREPUBLICATION_FOLLOW_TIMELINE_INVALID'; end if;
end $publish_after_follows$;

insert into public.notification_preferences(profile_id,external_enabled,categories)
select (v.value)::uuid,true,array['following']::text[]
from jsonb_each_text(current_setting('solaris.tg10_candidate_fixture')::jsonb) v
where v.key in ('first','second','third')
on conflict(profile_id) do update
set external_enabled=true,categories=array['following']::text[];

-- Canonical S4 evidence is mandatory, not merely a guessed public source ID.
-- These receipts/events exist only in this rolled-back disposable fixture.
do $publication_event$
declare
  v jsonb:=current_setting('solaris.tg10_candidate_fixture')::jsonb;
  v_bad_operation uuid:=gen_random_uuid();
  v_pending_operation uuid:=gen_random_uuid();
  v_good_operation uuid:=gen_random_uuid();
  v_count integer;
begin
  if exists (
    select 1 from private.world_statement_follow_notification_candidates_v1(
      (v->>'statement')::uuid,(v->>'version')::uuid
    )
  ) then raise exception 'TG10_NO_EVENT_PROVENANCE_ACCEPTED'; end if;

  insert into public.studio2_operation_receipts(
    operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,
    command,risk_class,scope,status,result,completed_at
  ) values
    (v_bad_operation,(v->>'first')::uuid,'tg10-bad-source-'||v_bad_operation::text,
     v_bad_operation,repeat('a',64),'world.statement.publish','R2',
     '{}'::jsonb,'succeeded','{}'::jsonb,now()),
    (v_good_operation,(v->>'first')::uuid,'tg10-good-source-'||v_good_operation::text,
     v_good_operation,repeat('b',64),'world.statement.publish','R2',
     '{}'::jsonb,'succeeded','{}'::jsonb,now());

  insert into public.studio2_operation_receipts(
    operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,
    command,risk_class,scope,status
  ) values (
    v_pending_operation,(v->>'first')::uuid,
    'tg10-pending-'||v_pending_operation::text,
    v_pending_operation,repeat('e',64),
    'world.statement.publish','R2','{}'::jsonb,'processing'
  );

  -- A real S2 receipt alone is insufficient when its S4 event points to a
  -- different immutable version than the exact request.
  perform private.v3_emit_domain_event(
    'world.statement.published','world_statement',v->>'statement',1,
    v_bad_operation,null,null,
    jsonb_build_object(
      'organizationId',v->>'org','statementId',v->>'statement',
      'versionId',gen_random_uuid(),'revision',1,
      'visibility','public','published',true
    ),1,array[]::text[]
  );
  if exists (
    select 1 from private.world_statement_follow_notification_candidates_v1(
      (v->>'statement')::uuid,(v->>'version')::uuid
    )
  ) then raise exception 'TG10_MISMATCHED_S4_VERSION_ACCEPTED'; end if;

  -- A true S4 fact is not deliverable until the matching S2 operation succeeds.
  perform private.v3_emit_domain_event(
    'world.statement.published','world_statement',v->>'statement',1,
    v_pending_operation,null,null,
    jsonb_build_object(
      'organizationId',v->>'org','statementId',v->>'statement',
      'versionId',v->>'version','revision',1,
      'visibility','public','published',true
    ),1,array[]::text[]
  );
  if exists (
    select 1 from private.world_statement_follow_notification_candidates_v1(
      (v->>'statement')::uuid,(v->>'version')::uuid
    )
  ) then raise exception 'TG10_INCOMPLETE_R2_SOURCE_ACCEPTED'; end if;

  -- This is the exact TG9 world_issue_statement_v1 S4 envelope and its
  -- already-completed canonical S2 operation; no alternative publisher.
  perform private.v3_emit_domain_event(
    'world.statement.published','world_statement',v->>'statement',1,
    v_good_operation,null,null,
    jsonb_build_object(
      'organizationId',v->>'org','statementId',v->>'statement',
      'versionId',v->>'version','revision',1,
      'visibility','public','published',true
    ),1,array[]::text[]
  );
  select count(*) into v_count
  from private.world_statement_follow_notification_candidates_v1(
    (v->>'statement')::uuid,(v->>'version')::uuid
  );
  if v_count <> 2 then
    raise exception 'TG10_CANONICAL_S4_FACT_NOT_ACCEPTED, got %',v_count;
  end if;
  raise notice 'PASS: missing or mismatched S4 facts denied; canonical S2+S4 publication accepted';
end $publication_event$;

do $initial$
declare
  v jsonb:=current_setting('solaris.tg10_candidate_fixture')::jsonb;
  v_count integer;
  v_first_row record;
  v_next_count integer;
begin
  select count(*) into v_count
  from private.world_statement_follow_notification_candidates_v1((v->>'statement')::uuid,(v->>'version')::uuid);
  if v_count <> 2 then
    raise exception 'TG10_EXPECTED_IMPORTANT_AND_ALL_RECIPIENTS, got %',v_count;
  end if;
  if exists (
    select 1 from private.world_statement_follow_notification_candidates_v1(
      (v->>'statement')::uuid,gen_random_uuid()
    )
  ) then raise exception 'TG10_UNRELATED_VERSION_EVENT_ALLOWED'; end if;

  select * into v_first_row
  from private.world_statement_follow_notification_candidates_v1((v->>'statement')::uuid,(v->>'version')::uuid,null,1
  );
  select count(*) into v_next_count
  from private.world_statement_follow_notification_candidates_v1((v->>'statement')::uuid,(v->>'version')::uuid,v_first_row.user_id,1
  );
  if v_first_row.user_id is null or v_next_count <> 1 then
    raise exception 'TG10_KEYSET_PAGINATION_INCORRECT';
  end if;
  if v_first_row.title <> 'Terra Solaris'
     or v_first_row.body like '%Published text%'
     or v_first_row.category <> 'following'
     or v_first_row.event_type <> 'world.statement.published' then
    raise exception 'TG10_CANDIDATE_PUBLIC_PUSH_PROJECTION_INVALID';
  end if;

  begin
    perform 1 from private.world_statement_follow_notification_candidates_v1((v->>'statement')::uuid,(v->>'version')::uuid,null,201
    );
    raise exception 'TG10_UNBOUNDED_LIMIT_ALLOWED';
  exception when sqlstate '22023' then null;
  end;
  raise notice 'PASS: Important/All/None, safe public payload, keyset paging, bounded limit';
end $initial$;

-- A follower's explicit category opt-out must be decisive, regardless of All.
set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $disable$
declare
  v jsonb:=current_setting('solaris.tg10_candidate_fixture')::jsonb;
  v_follow uuid;
begin
  perform set_config('request.jwt.claim.sub',v->>'second',true);
  perform set_config('request.jwt.claims',jsonb_build_object(
    'sub',v->>'second','role','authenticated')::text,true);
  select id into strict v_follow from public.fan_follows
  where profile_id=(v->>'second')::uuid and entity_type='organization'
    and entity_id=(v->>'org')::uuid;
  perform public.world_set_follow_category_v1(v_follow,'statements',false);
end $disable$;
reset role;

do $privacy$
declare
  v jsonb:=current_setting('solaris.tg10_candidate_fixture')::jsonb;
  v_count integer;
begin
  select count(*) into v_count from private.world_statement_follow_notification_candidates_v1((v->>'statement')::uuid,(v->>'version')::uuid
  );
  if v_count <> 1 then raise exception 'TG10_CATEGORY_OPTOUT_IGNORED'; end if;

  update public.world_organizations set public_visibility='private'
  where id=(v->>'org')::uuid;
  if exists(select 1 from private.world_statement_follow_notification_candidates_v1((v->>'statement')::uuid,(v->>'version')::uuid
  )) then raise exception 'TG10_PRIVATE_ORGANIZATION_LEAK'; end if;
  update public.world_organizations set public_visibility='public'
  where id=(v->>'org')::uuid;

  update public.studio2_feature_flags set enabled=false
  where key='terra_world_public';
  if exists(select 1 from private.world_statement_follow_notification_candidates_v1((v->>'statement')::uuid,(v->>'version')::uuid
  )) then raise exception 'TG10_DARK_FLAG_LEAK'; end if;
  update public.studio2_feature_flags set enabled=true
  where key='terra_world_public';

  update public.world_statements set visibility='private'
  where id=(v->>'statement')::uuid;
  if exists(select 1 from private.world_statement_follow_notification_candidates_v1((v->>'statement')::uuid,(v->>'version')::uuid
  )) then raise exception 'TG10_UNPUBLISHED_STATEMENT_LEAK'; end if;
  update public.world_statements set visibility='public'
  where id=(v->>'statement')::uuid;

  update public.world_statements set status='withdrawn'
  where id=(v->>'statement')::uuid;
  if exists(select 1 from private.world_statement_follow_notification_candidates_v1((v->>'statement')::uuid,(v->>'version')::uuid
  )) then raise exception 'TG10_WITHDRAWN_STATEMENT_LEAK'; end if;
  update public.world_statements set status='published'
  where id=(v->>'statement')::uuid;
  raise notice 'PASS: opted-out category, hidden institution, dark flag and unpublished content rejected';
end $privacy$;

-- A user who follows only after a publication is not part of its
-- original audience, even while the publication remains within the 30m window.
do $historical_follow$
declare
  v jsonb:=current_setting('solaris.tg10_candidate_fixture')::jsonb;
  v_old_statement uuid:=gen_random_uuid();
  v_old_version uuid:=gen_random_uuid();
  v_old_op uuid:=gen_random_uuid();
begin
  insert into public.world_statements(
    id,organization_id,status,visibility,published_at
  ) values (
    v_old_statement,(v->>'org')::uuid,'published','public',
    now()-interval '2 minutes'
  );
  insert into public.world_statement_versions(
    id,statement_id,version_number,title,body,published_at
  ) values (
    v_old_version,v_old_statement,1,'Historical public statement',
    'The account was not following at publication.',now()-interval '2 minutes'
  );
  update public.world_statements set current_version_id=v_old_version
  where id=v_old_statement;

  insert into public.studio2_operation_receipts(
    operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,
    command,risk_class,scope,status,result,completed_at
  ) values (
    v_old_op,(v->>'first')::uuid,'tg10-old-'||v_old_op::text,
    v_old_op,repeat('d',64),'world.statement.publish','R2',
    '{}'::jsonb,'succeeded','{}'::jsonb,now()
  );
  perform private.v3_emit_domain_event(
    'world.statement.published','world_statement',v_old_statement::text,1,
    v_old_op,null,null,
    jsonb_build_object(
      'organizationId',v->>'org','statementId',v_old_statement,
      'versionId',v_old_version,'revision',1,
      'visibility','public','published',true
    ),1,array[]::text[]
  );
  if exists (
    select 1 from private.world_statement_follow_notification_candidates_v1(
      v_old_statement,v_old_version
    )
  ) then raise exception 'TG10_AFTER_PUBLICATION_FOLLOW_ACCEPTED'; end if;
  raise notice 'PASS: post-publication followers do not receive earlier events';
end $historical_follow$;

do $versions$
declare
  v jsonb:=current_setting('solaris.tg10_candidate_fixture')::jsonb;
  v_corrected uuid:=gen_random_uuid();
  v_future uuid:=gen_random_uuid();
  v_correct_op uuid:=gen_random_uuid();
  v_result record;
begin
  insert into public.world_statement_versions(
    id,statement_id,version_number,title,body,correction_reason,published_at
  ) values (
    v_corrected,(v->>'statement')::uuid,2,'Corrected statement',
    'Corrections preserve historical versions.','Corrected factual detail',now()
  );
  update public.world_statements
  set current_version_id=v_corrected,current_revision=2
  where id=(v->>'statement')::uuid;
  -- The S4 event from an older publication must not turn into a correction.
  if exists (
    select 1 from private.world_statement_follow_notification_candidates_v1(
      (v->>'statement')::uuid,(v->>'version')::uuid
    )
  ) then raise exception 'TG10_STALE_VERSION_EVENT_ALLOWED'; end if;

  insert into public.studio2_operation_receipts(
    operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,
    command,risk_class,scope,status,result,completed_at
  ) values (
    v_correct_op,(v->>'first')::uuid,'tg10-correction-'||v_correct_op::text,
    v_correct_op,repeat('c',64),'world.statement.correct','R2',
    '{}'::jsonb,'succeeded','{}'::jsonb,now()
  );
  perform private.v3_emit_domain_event(
    'world.statement.corrected','world_statement',v->>'statement',2,
    v_correct_op,null,null,
    jsonb_build_object(
      'organizationId',v->>'org','statementId',v->>'statement',
      'versionId',v_corrected,'revision',2,
      'visibility','public','published',true
    ),1,array[]::text[]
  );
  select * into strict v_result
  from private.world_statement_follow_notification_candidates_v1(
    (v->>'statement')::uuid,v_corrected
  );
  if v_result.event_type <> 'world.statement.corrected'
     or v_result.subject_id <> v_corrected::text then
    raise exception 'TG10_VERSIONED_CORRECTION_WRONG';
  end if;

  insert into public.world_statement_versions(
    id,statement_id,version_number,title,body,correction_reason,published_at
  ) values(
    v_future,(v->>'statement')::uuid,3,'Future statement',
    'This statement is not yet effective.','Corrected future schedule',now()+interval '1 day'
  );
  update public.world_statements
  set current_version_id=v_future,current_revision=3
  where id=(v->>'statement')::uuid;
  -- Exact future-version notification is forbidden until effective.
  if exists(select 1 from private.world_statement_follow_notification_candidates_v1(
    (v->>'statement')::uuid,v_future
  )) then raise exception 'TG10_FUTURE_VERSION_LEAK'; end if;
  -- A previous correction event cannot masquerade as a future version.
  if exists(select 1 from private.world_statement_follow_notification_candidates_v1(
    (v->>'statement')::uuid,v_corrected
  )) then raise exception 'TG10_SUPERSEDED_CORRECTION_EVENT_ALLOWED'; end if;
  raise notice 'PASS: correction only current immutable version and future version exclusion';
end $versions$;

rollback;
