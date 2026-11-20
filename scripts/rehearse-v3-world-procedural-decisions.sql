-- TG9 procedure decisions: disposable/local only. No hosted database access.
\set ON_ERROR_STOP on
begin;

do $setup$
declare
  v_org uuid;
  v_decision uuid;
  v_version uuid;
begin
  if to_regclass('public.world_decisions') is null
     or to_regclass('public.world_decision_versions') is null then
    raise exception 'TG9_DECISION_SCHEMA_MISSING';
  end if;
  if has_table_privilege('anon','public.world_decisions','INSERT')
     or has_table_privilege('authenticated','public.world_decisions','UPDATE')
     or has_table_privilege('service_role','public.world_decisions','INSERT')
     or has_table_privilege('service_role','public.world_decisions','UPDATE')
     or has_table_privilege('service_role','public.world_decision_versions','INSERT')
     or has_table_privilege('service_role','public.world_decision_versions','UPDATE') then
    raise exception 'TG9_DECISION_DIRECT_WRITER_PRESENT';
  end if;

  select org.id into strict v_org
  from public.world_organizations org where slug='guard';

  update public.studio2_feature_flags set enabled=false,admins_only=false,
    user_ids='{}'::uuid[],edition_ids='{}'::uuid[]
  where key='terra_world_public';
  if not found or public.studio2_feature_enabled('terra_world_public',null) then
    raise exception 'TG9_DECISION_DARK_ROLLOUT_SETUP_FAILED';
  end if;

  -- Owner-only insertion inside a rollback-only fixture is NOT an authorized
  -- user command. Test actual user commands separately with canonical offices.
  insert into public.delegation_people(id,display_name,identity_key)
  values(gen_random_uuid(),'Disposable TG9 signer',
    'tg9-decision-fixture:'||gen_random_uuid()::text);

  insert into public.world_decisions(
    organization_id,issuer_office_id,issuer_person_id,identifier,decision_kind
  )
  select v_org,office_row.id,p.id,
      'tg9-procedure-fixture/'||gen_random_uuid()::text,'procedural'
  from public.world_organization_offices office_row
  cross join lateral (
    select id from public.delegation_people
    where identity_key like 'tg9-decision-fixture:%'
    order by created_at desc limit 1
  ) p
  where office_row.organization_id=v_org and office_row.slug='chairperson'
  limit 1 returning id into v_decision;

  if v_decision is null then raise exception 'TG9_DECISION_FIXTURE_NOT_CREATED'; end if;
  insert into public.world_decision_versions(
    decision_id,version_number,title,body
  ) values(v_decision,1,'Procedural fixture','Published fixture body')
  returning id into v_version;
  update public.world_decisions set current_version_id=v_version where id=v_decision;
  perform set_config('solaris.tg9_decision_fixture',jsonb_build_object(
    'decision',v_decision,'version',v_version
  )::text,true);
end
$setup$;

set local role anon;
do $dark$
declare
  v jsonb:=current_setting('solaris.tg9_decision_fixture')::jsonb;
begin
  if (select count(*) from public.world_decisions)<>0
     or (select count(*) from public.world_decision_versions)<>0
     or public.world_public_executive_decisions_v1('guard',20)<>'[]'::jsonb
     or public.world_public_executive_decision_history_v1(
       (v->>'decision')::uuid) is not null then
    raise exception 'TG9_DECISION_DARK_ROLLOUT_LEAK';
  end if;
  raise notice 'PASS: anonymous decision listing/history and RLS remain dark';
end $dark$;
reset role;

do $history$
declare
  v jsonb:=current_setting('solaris.tg9_decision_fixture')::jsonb;
  v_version uuid:=(v->>'version')::uuid;
  v_decision uuid:=(v->>'decision')::uuid;
begin
  begin
    update public.world_decision_versions set body='silently edited body'
    where id=v_version;
    raise exception 'TG9_DECISION_SILENT_HISTORY_REWRITE';
  exception when sqlstate '42501' then
    if sqlerrm<>'PUBLISHED_DECISION_VERSION_IMMUTABLE' then raise; end if;
  end;
  if (select current_version_id from public.world_decisions
      where id=v_decision)<>v_version then
    raise exception 'TG9_DECISION_CURRENT_VERSION_INCONSISTENT';
  end if;
  raise notice 'PASS: official decision history remains immutable';
end $history$;

rollback;
