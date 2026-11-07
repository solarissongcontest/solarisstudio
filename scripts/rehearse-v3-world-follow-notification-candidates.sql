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

  insert into public.world_statements(id,organization_id,status,visibility,published_at)
  values(v_statement,v_org,'published','public',now());
  insert into public.world_statement_versions(
    id,statement_id,version_number,title,body,published_at
  ) values(v_version,v_statement,1,'Canonical public statement','Published text never appears in lock screen content.',now());
  update public.world_statements set current_version_id=v_version where id=v_statement;

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

insert into public.notification_preferences(profile_id,external_enabled,categories)
select (v.value)::uuid,true,array['following']::text[]
from jsonb_each_text(current_setting('solaris.tg10_candidate_fixture')::jsonb) v
where v.key in ('first','second','third')
on conflict(profile_id) do update
set external_enabled=true,categories=array['following']::text[];

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

do $versions$
declare
  v jsonb:=current_setting('solaris.tg10_candidate_fixture')::jsonb;
  v_corrected uuid:=gen_random_uuid();
  v_future uuid:=gen_random_uuid();
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
