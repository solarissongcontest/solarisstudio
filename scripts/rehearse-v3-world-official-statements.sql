-- TG9 disposable/local PostgreSQL only. The runner enforces loopback and all
-- fixtures roll back. Never run this against hosted Solaris production.
\set ON_ERROR_STOP on
begin;

do $setup$
declare
  v_org uuid;
  v_statement uuid;
  v_version uuid;
begin
  if to_regclass('public.world_statements') is null
    or to_regclass('public.world_statement_versions') is null then
    raise exception 'TG9_STATEMENT_SCHEMA_MISSING';
  end if;
  if has_table_privilege('anon','public.world_statements','INSERT')
    or has_table_privilege('authenticated','public.world_statements','UPDATE')
    or has_table_privilege('anon','public.world_statement_versions','DELETE') then
    raise exception 'TG9_DIRECT_CLIENT_DML_NOT_REVOKED';
  end if;
  select id into strict v_org
  from public.world_organizations where slug = 'guard';
  -- Feature flag must be OFF even when this privileged fixture holds a row.
  update public.studio2_feature_flags
  set enabled = false, admins_only = false,
      user_ids = '{}'::uuid[], edition_ids = '{}'::uuid[]
  where key = 'terra_world_public';
  if not found or public.studio2_feature_enabled('terra_world_public',null) then
    raise exception 'TG9_DARK_ROLLOUT_SETUP_FAILED';
  end if;
  insert into public.world_statements(organization_id,status,visibility)
  values(v_org,'published','public') returning id into v_statement;
  insert into public.world_statement_versions(statement_id,version_number,title,body)
  values(v_statement,1,'TG9 disposable official title','TG9 disposable official body')
  returning id into v_version;
  update public.world_statements set current_version_id=v_version where id=v_statement;
  perform set_config('solaris.tg9_statement_fixture',jsonb_build_object(
    'org',v_org,'statement',v_statement,'version',v_version
  )::text,true);
end
$setup$;

set local role anon;
do $anonymous$
declare
  v jsonb := current_setting('solaris.tg9_statement_fixture')::jsonb;
  v_statement uuid := (v->>'statement')::uuid;
begin
  if (select count(*) from public.world_statements) <> 0
    or (select count(*) from public.world_statement_versions) <> 0
    or public.world_public_statement_history_v1(v_statement) is not null
    or public.world_public_statements_v1('guard',20) <> '[]'::jsonb then
    raise exception 'TG9_DARK_WORLD_LEAKED_OFFICIAL_CONTENT';
  end if;
  raise notice 'PASS: anonymous public RLS and both RPCs remain dark';
end
$anonymous$;
reset role;

do $integrity$
declare
  v jsonb := current_setting('solaris.tg9_statement_fixture')::jsonb;
  v_statement uuid := (v->>'statement')::uuid;
  v_version uuid := (v->>'version')::uuid;
begin
  begin
    update public.world_statement_versions set body='silent rewrite' where id=v_version;
    raise exception 'TG9_SILENT_REWRITE_ACCEPTED';
  exception when sqlstate '42501' then
    if sqlerrm <> 'PUBLISHED_STATEMENT_VERSION_IMMUTABLE' then raise; end if;
  end;

  if (select count(*) from public.world_statement_versions where statement_id=v_statement) <> 1
    or (select current_version_id from public.world_statements where id=v_statement) <> v_version then
    raise exception 'TG9_CURRENT_VERSION_MISMATCH';
  end if;
  raise notice 'PASS: published statement text immutable, current pointer consistent';
end
$integrity$;

rollback;
