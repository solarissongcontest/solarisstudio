\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- Read-only S16 pg_catalog evidence. This script must run only against an
-- isolated/local candidate database. It does not mutate schema or data.
with critical(table_schema, table_name) as (
  values
    ('public','results'),
    ('public','studio2_result_operations'),
    ('public','studio2_result_operation_executions'),
    ('public','televote_votes'),
    ('public','televoting_round_bindings'),
    ('televoting','rounds'),
    ('televoting','vote_submissions'),
    ('televoting','vote_entries'),
    ('televoting','televote_aggregations'),
    ('televoting','combined_televote_results'),
    ('public','jury_voting_windows'),
    ('public','jury_ballot_submissions'),
    ('public','jury_votes'),
    ('public','studio2_jury_window_versions'),
    ('public','submission_rounds'),
    ('public','submissions'),
    ('public','submission_versions'),
    ('public','studio2_confirmation_requirements'),
    ('public','studio2_confirmation_round_versions'),
    ('private','v3_confirmation_operations'),
    ('public','entries'),
    ('public','internal_entries'),
    ('public','studio2_show_publication_controls'),
    ('public','studio2_show_publication_executions'),
    ('public','studio2_capability_grants'),
    ('public','studio2_role_assignments'),
    ('public','studio2_role_capabilities'),
    ('public','studio2_permission_state_versions'),
    ('public','editions'),
    ('public','shows'),
    ('public','studio2_edition_runtime'),
    ('public','integrity_cases'),
    ('public','integrity_case_events'),
    ('public','integrity_case_evidence'),
    ('public','integrity_case_appeals'),
    ('public','integrity_case_findings'),
    ('public','integrity_case_sanctions'),
    ('public','integrity_adjudication_history')
),
table_evidence as (
  select jsonb_build_object(
    'table', c.table_schema || '.' || c.table_name,
    'owner', pg_get_userbyid(cls.relowner),
    'rlsEnabled', cls.relrowsecurity,
    'dmlRoles', coalesce((
      select jsonb_agg(distinct g.grantee order by g.grantee)
      from information_schema.role_table_grants g
      where g.table_schema = c.table_schema
        and g.table_name = c.table_name
        and g.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
    ), '[]'::jsonb),
    'columnDmlRoles', coalesce((
      select jsonb_agg(distinct g.grantee order by g.grantee)
      from information_schema.column_privileges g
      where g.table_schema = c.table_schema
        and g.table_name = c.table_name
        and g.privilege_type in ('INSERT','UPDATE')
    ), '[]'::jsonb),
    'columnDmlGrants', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'role', g.grantee,
          'privilege', g.privilege_type,
          'column', g.column_name
        )
        order by g.grantee, g.privilege_type, g.column_name
      )
      from information_schema.column_privileges g
      where g.table_schema = c.table_schema
        and g.table_name = c.table_name
        and g.privilege_type in ('INSERT','UPDATE')
    ), '[]'::jsonb),
    'writeTriggers', coalesce((
      select jsonb_agg(distinct t.trigger_name order by t.trigger_name)
      from information_schema.triggers t
      where t.event_object_schema = c.table_schema
        and t.event_object_table = c.table_name
        and t.event_manipulation in ('INSERT','UPDATE','DELETE','TRUNCATE')
    ), '[]'::jsonb),
    'updatableViews', coalesce((
      select jsonb_agg(distinct u.view_schema || '.' || u.view_name order by u.view_schema || '.' || u.view_name)
      from information_schema.view_table_usage u
      join information_schema.views v
        on v.table_schema = u.view_schema and v.table_name = u.view_name
      where u.table_schema = c.table_schema
        and u.table_name = c.table_name
        and (v.is_updatable = 'YES' or v.is_insertable_into = 'YES')
    ), '[]'::jsonb)
  ) as value
  from critical c
  join pg_namespace n on n.nspname = c.table_schema
  join pg_class cls on cls.relnamespace = n.oid and cls.relname = c.table_name and cls.relkind in ('r','p')
),
function_candidates as (
  select
    n.nspname || '.' || p.proname as function_name,
    p.oid,
    p.proowner,
    p.prosecdef,
    array_to_string(p.proconfig, ',') as proconfig,
    p.prosrc,
    array(
      select c.table_schema || '.' || c.table_name
      from critical c
      where p.prosrc ~* (
        '(insert[[:space:]]+into|update|delete[[:space:]]+from|truncate(?:[[:space:]]+table)?)'
        || '[[:space:]]+(?:' || c.table_schema || '[.])?' || c.table_name || '[[:>:]]'
      )
      order by 1
    ) as writes_tables
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','private','televoting')
),
function_evidence as (
  select jsonb_build_object(
    'name', f.function_name,
    'owner', pg_get_userbyid(f.proowner),
    'securityDefiner', f.prosecdef,
    'searchPath', f.proconfig,
    'executeRoles', coalesce((
      select jsonb_agg(distinct case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end order by case when x.grantee = 0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end)
      from aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
      where x.privilege_type = 'EXECUTE'
    ), '[]'::jsonb),
    'writesTables', to_jsonb(f.writes_tables)
  ) as value
  from function_candidates f
  join pg_proc p on p.oid = f.oid
  -- Include all hardened SECURITY DEFINER functions as authority evidence even
  -- when they delegate the physical DML to a private implementation primitive.
  -- writesTables remains the discriminator for competing-writer detection.
  where cardinality(f.writes_tables) > 0 or f.prosecdef
)
select jsonb_build_object(
  'schemaVersion', 1,
  'candidateSha', :'candidate_sha',
  'tables', coalesce((select jsonb_agg(value order by value ->> 'table') from table_evidence), '[]'::jsonb),
  'functions', coalesce((select jsonb_agg(value order by value ->> 'name') from function_evidence), '[]'::jsonb)
)::text;
