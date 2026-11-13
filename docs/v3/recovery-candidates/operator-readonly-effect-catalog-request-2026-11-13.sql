-- V3 S13/S14/Televote/Results minimal metadata request (13 Nov 2026)
-- DRAFT: DO NOT EXECUTE WITHOUT NEW, EXPLICIT OWNER APPROVAL.
-- Not a migration. Not a production test. Not a standing query authorization.
-- Confirm SQL Editor is in canonical project dkxmnvekiopyesuzggeu first.
-- The CSV upload cannot establish project identity. Never use Preview oxtbskojiexkaspputvo.
-- Inspect pg_catalog metadata only; no user rows, credentials, functions invoked, or writes.
-- Return sanitized metadata only. Raw catalog detail must remain under operator custody.

begin read only;
set local statement_timeout = '5s';
set local lock_timeout = '2s';

-- A. Presence, owner, RLS and ACL fingerprint of only named relation dependencies.
with target_relations(qualified_name) as (
  values
    ('private.v3_migration_contracts'),
    ('private.v3_schema_compatibility'),
    ('private.v3_schema_compatibility_history'),
    ('private.v3_backfill_jobs'),
    ('private.v3_migration_parity_runs'),
    ('private.v3_archive_runtime_transition_gates'),
    ('private.v3_archive_task_reconciliation_gates'),
    ('private.v3_televote_result_projection_sources'),
    ('private.v3_result_versions'),
    ('private.v3_result_input_revisions'),
    ('public.studio2_edition_runtime'),
    ('public.studio2_organizer_tasks'),
    ('public.admin_notifications'),
    ('public.notification_deliveries'),
    ('public.televote_votes'),
    ('public.participants'),
    ('public.results')
)
select t.qualified_name,
       c.oid is not null as exists_now,
       case when c.oid is not null then pg_get_userbyid(c.relowner) end as owner,
       c.relkind, c.relrowsecurity, c.relforcerowsecurity,
       case when c.oid is not null then md5(coalesce(c.relacl::text, '<null>')) end as relacl_md5,
       case when c.oid is not null then has_table_privilege('anon',c.oid,'INSERT') end as anon_insert,
       case when c.oid is not null then has_table_privilege('authenticated',c.oid,'UPDATE') end as authenticated_update,
       case when c.oid is not null then has_table_privilege('service_role',c.oid,'SELECT') end as service_select,
       case when c.oid is not null then has_table_privilege('service_role',c.oid,'INSERT') end as service_insert
from target_relations t left join pg_class c on c.oid=to_regclass(t.qualified_name)
order by t.qualified_name;

-- B. Bounded function signatures and metadata fingerprints. DO NOT return pg_get_functiondef.
-- The matching named RPCs may have overloads; retain all exact returned signatures.
with targets(schema_name, function_name) as (
  values
    ('private','studio2_request_is_service_role'),
    ('private','studio2_require_strict_dual'),
    ('public','v3_schema_compatibility'),
    ('public','v3_register_migration_contract'),
    ('public','v3_claim_backfill'),
    ('public','v3_checkpoint_backfill'),
    ('public','v3_fail_backfill'),
    ('public','v3_record_migration_parity'),
    ('public','v3_set_schema_compatibility'),
    ('private','studio2_reconcile_all_organizer_tasks'),
    ('private','v3_resolve_archived_edition_workflow_tasks'),
    ('private','v3_reconcile_resolved_task_notifications'),
    ('private','v3_guard_archive_runtime_transition'),
    ('private','v3_arm_archive_runtime_transition_gate'),
    ('private','v3_guard_archived_edition_workflow_write'),
    ('private','v3_guard_archived_edition_task_resurrection'),
    ('private','v3_guard_archived_televote_write'),
    ('public','studio2_transition_edition_v3'),
    ('public','studio2_verify_notification_delivery_projection'),
    ('public','studio2_reconcile_notification_delivery_projection'),
    ('public','v3_public_published_result_snapshot'),
    ('private','v3_edition_final_results_ready'),
    ('private','v3_televote_projection_snapshot'),
    ('private','v3_apply_published_televote_projection'),
    ('private','v3_guard_source_managed_televote_projection'),
    ('private','v3_sync_published_televote_round'),
    ('private','v3_sync_published_televote_aggregation'),
    ('public','sync_show_results_from_votes'),
    ('private','studio2_result_reconciliation'),
    ('private','studio2_result_preconditions'),
    ('private','v3_public_result_row_visible')
)
select t.schema_name||'.'||t.function_name as requested_name,
       p.oid::regprocedure::text as exact_identity,
       pg_get_userbyid(p.proowner) as owner,
       p.prosecdef, p.provolatile, p.proparallel,
       md5(coalesce(p.proconfig::text,'<null>')) as config_md5,
       md5(coalesce(p.proacl::text,'<null>')) as acl_md5,
       md5(pg_get_functiondef(p.oid)) as definition_md5,
       has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
       has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from targets t
left join pg_namespace n on n.nspname=t.schema_name
left join pg_proc p on p.pronamespace=n.oid and p.proname=t.function_name
order by requested_name, exact_identity;

-- C. Preserve both hosted-only platform guards; also capture scoped Archive,
-- Televote, Entry and task/delivery triggers, including enabled state and function ID.
with targets(qualified_relation, trigger_name) as (
  values
    ('public.admin_notifications','studio2_platform_direct_write_guard'),
    ('public.notification_deliveries','studio2_platform_direct_write_guard'),
    ('public.studio2_edition_runtime','v3_guard_archive_runtime_transition'),
    ('public.studio2_edition_runtime','v3_sync_archived_edition_legacy_status'),
    ('public.studio2_organizer_tasks','v3_guard_archived_edition_task_resurrection'),
    ('public.notification_deliveries','v3_project_resolved_task_delivery_state'),
    ('public.televote_votes','v3_guard_source_managed_televote_projection'),
    ('public.participants','participants_sync_running_order_results'),
    ('public.studio2_operation_receipts','v3_emit_entry_submission_event')
)
select x.qualified_relation, x.trigger_name, t.oid is not null as exists_now,
       t.tgenabled,
       case when t.oid is not null then t.tgfoid::regprocedure::text end as trigger_function,
       case when t.oid is not null then md5(pg_get_triggerdef(t.oid)) end as definition_md5
from targets x
left join pg_trigger t on t.tgrelid=to_regclass(x.qualified_relation)
                      and t.tgname=x.trigger_name and not t.tgisinternal
order by x.qualified_relation,x.trigger_name;

-- D. Privacy policy fingerprints on only affected public tables; no policy SQL body.
select n.nspname||'.'||c.relname as relation, p.polname, p.polcmd, p.polpermissive,
       md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'<null>')) as using_md5,
       md5(coalesce(pg_get_expr(p.polwithcheck,p.polrelid),'<null>')) as check_md5
from pg_policy p join pg_class c on c.oid=p.polrelid
join pg_namespace n on n.oid=c.relnamespace
where (n.nspname,c.relname) in (
  ('public','admin_notifications'),('public','notification_deliveries'),
  ('public','televote_votes'),('public','studio2_organizer_tasks'),
  ('public','studio2_edition_runtime')
)
order by relation,p.polname;

rollback;
