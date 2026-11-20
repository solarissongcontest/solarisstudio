-- Solaris Studio V3: operator-only read-only catalog evidence probe.
-- Source: docs/v3/production-schema-effect-reconciliation-2026-11-07.md.
-- DO NOT run this file in CI, GitHub Actions, Playwright, previews or automated jobs.
-- It contains SELECTs over system catalogs/configuration only; no user/vote/result rows.
-- Target must be deliberately selected and checked by an authorized human operator.
-- These checks report object PRESENCE only, not semantic parity/release certification.
-- Missing objects must NOT be created directly from this file.
--
-- 1. Expected object identities; schema is informational for routine/trigger/index
-- comparison. The authoritative identity of a trigger includes its attached table,
-- and must be separately inspected for the final reconciliation.
WITH expected(kind, schema_name, object_name) AS (
  VALUES
  ('table', 'private', 'v3_migration_contracts'),
  ('table', 'private', 'v3_schema_compatibility'),
  ('table', 'private', 'v3_schema_compatibility_history'),
  ('table', 'private', 'v3_backfill_jobs'),
  ('table', 'private', 'v3_migration_parity_runs'),
  ('table', 'private', 'v3_televote_result_projection_sources'),
  ('table', 'private', 'v3_archive_runtime_transition_gates'),
  ('table', 'private', 'v3_archive_task_reconciliation_gates'),
  ('table', 'public', 'world_country_control_terms'),
  ('table', 'public', 'world_organizations'),
  ('function', 'public', 'v3_register_migration_contract'),
  ('function', 'public', 'v3_schema_compatibility'),
  ('function', 'public', 'admin_system_observability_snapshot'),
  ('function', 'public', 'admin_system_v3_sli_snapshot'),
  ('function', 'public', 'studio2_televote_projection_status'),
  ('function', 'public', 'studio2_transition_edition_v3'),
  ('function', 'public', 'studio2_verify_notification_delivery_projection'),
  ('function', 'public', 'studio2_reconcile_notification_delivery_projection'),
  ('function', 'public', 'studio2_reconcile_confirmation_requirements'),
  ('function', 'public', 'studio2_verify_confirmation_requirements'),
  ('function', 'public', 'v3_public_published_result_snapshot'),
  ('function', 'private', 'v3_apply_published_televote_projection'),
  ('function', 'private', 'v3_guard_source_managed_televote_projection'),
  ('function', 'private', 'v3_televote_projection_snapshot'),
  ('function', 'private', 'v3_guard_archive_runtime_transition'),
  ('function', 'private', 'v3_arm_archive_runtime_transition_gate'),
  ('trigger', 'public', 'v3_guard_archive_runtime_transition'),
  ('trigger', 'public', 'v3_guard_archive_runtime_update'),
  ('trigger', 'public', 'v3_guard_archive_runtime_insert'),
  ('trigger', 'public', 'v3_guard_archive_runtime_delete'),
  ('trigger', 'public', 'v3_emit_entry_submission_event'),
  ('trigger', 'public', 'v3_emit_entry_version_changed_event'),
  ('trigger', 'public', 'participants_sync_running_order_results'),
  ('trigger', 'public', 'v3_guard_source_managed_televote_projection'),
  ('trigger', 'public', 'v3_project_resolved_task_delivery_state'),
  ('index', 'public', 'studio2_operation_receipts_created_at_idx'),
  ('index', 'private', 'v3_domain_events_occurred_at_idx'),
  ('index', 'private', 'v3_domain_event_outbox_created_at_idx')
)
SELECT kind, schema_name || '.' || object_name AS object_identity,
  CASE kind
    WHEN 'table' THEN to_regclass(format('%I.%I', schema_name, object_name)) IS NOT NULL
    WHEN 'function' THEN EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname=expected.schema_name AND p.proname=expected.object_name
    )
    WHEN 'trigger' THEN EXISTS (
      SELECT 1 FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE NOT t.tgisinternal AND n.nspname=expected.schema_name AND t.tgname=expected.object_name
    )
    WHEN 'index' THEN EXISTS (
      SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relkind='i' AND n.nspname=expected.schema_name AND c.relname=expected.object_name
    )
    ELSE false
  END AS object_exists
FROM expected
ORDER BY kind, object_identity;

-- 2. Exact 28 signatures taken from the 20261018031000 deterministic-conflict SQL.
-- Text checks identify the old SQLSTATE literal but do not exercise HTTP behavior.
WITH signatures(signature) AS (
  VALUES
  ('public.studio2_apply_confirmation_round_change(uuid,text,jsonb,uuid,text,bigint)'),
  ('public.studio2_apply_confirmation_winner_change(uuid,text,uuid,text,uuid,text,bigint,uuid)'),
  ('public.studio2_apply_eligibility_override_change(text,uuid,uuid,text,uuid,text,timestamptz,uuid,text,bigint)'),
  ('public.studio2_apply_jury_ballot_review(uuid,text,text,uuid,text,bigint)'),
  ('public.studio2_apply_jury_dnv(uuid,uuid,uuid,uuid,text,text,uuid,text,bigint)'),
  ('public.studio2_apply_jury_voting_status(uuid,text,uuid,text,bigint)'),
  ('public.studio2_apply_next_in_line_window_change(uuid,text,boolean,timestamptz,timestamptz,text,uuid,text,bigint)'),
  ('public.studio2_apply_participation_status(uuid,uuid,uuid,text,uuid,text,bigint)'),
  ('public.studio2_apply_permission_change(uuid,text,text,uuid,timestamptz,uuid,text,bigint)'),
  ('public.studio2_apply_platform_mode_change(text,text,text[],text,text,uuid,text,bigint,uuid)'),
  ('public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)'),
  ('public.studio2_apply_voting_declaration_invalidation(uuid,text,uuid,text,bigint)'),
  ('public.studio2_approve_permission_change(uuid)'),
  ('public.studio2_approve_transition(uuid)'),
  ('public.studio2_delete_prediction_round(uuid,uuid,text,bigint)'),
  ('public.studio2_execute_host_operation(uuid,text,text,uuid,uuid,bigint,jsonb)'),
  ('public.studio2_execute_result_operation(uuid,text,text,uuid,bigint)'),
  ('public.studio2_execute_story_operation(uuid,text,text,uuid,bigint,uuid,jsonb)'),
  ('public.studio2_record_platform_exit_preflight(uuid,text,jsonb,jsonb)'),
  ('public.studio2_request_permission_change_approval(uuid,text,text,uuid,timestamptz,uuid,text,bigint)'),
  ('public.studio2_review_media_assets_legacy_impl(uuid,jsonb,text)'),
  ('public.studio2_save_broadcast_rundown(uuid,integer,timestamptz,jsonb,text)'),
  ('public.studio2_save_prediction_round(uuid,timestamptz,timestamptz,text,text[],integer,uuid,text,bigint)'),
  ('public.studio2_score_prediction_round(uuid,uuid,text,bigint)'),
  ('public.studio2_set_broadcast_rundown_lock(uuid,integer,boolean,text)'),
  ('public.studio2_transition_broadcast_segment(uuid,integer,text,text,text)'),
  ('televoting.studio2_apply_round_deadline_change(uuid,timestamptz,uuid,text,bigint)'),
  ('televoting.studio2_apply_round_status_change(uuid,text,uuid,text,bigint,bigint)')
), routines AS (
  SELECT signature, to_regprocedure(signature) AS oid FROM signatures
)
SELECT signature, (oid IS NOT NULL) AS exists_in_catalog,
  CASE WHEN oid IS NULL THEN NULL ELSE position('''40001''' IN pg_get_functiondef(oid)) > 0 END AS uses_40001,
  CASE WHEN oid IS NULL THEN NULL ELSE position('''PT409''' IN pg_get_functiondef(oid)) > 0 END AS uses_pt409
FROM routines ORDER BY signature;

-- 3. Scheduler presence only; absence does not exclude external scheduling.
WITH expected(jobname) AS (
  VALUES ('solaris-app-push-dispatch'),
         ('solaris-studio2-publish-due-shows'),
         ('solaris-studio2-publish-due-notices'),
         ('solaris-publish-due-entries')
)
SELECT e.jobname, (j.jobid IS NOT NULL) AS registered, j.active, j.schedule
FROM expected e LEFT JOIN cron.job j USING (jobname)
ORDER BY e.jobname;

-- 4. Rollout flags: no user identifiers or participant data.
SELECT key, enabled, admins_only, cardinality(user_ids) AS user_target_count,
       cardinality(edition_ids) AS edition_target_count
FROM public.studio2_feature_flags
WHERE key = ANY (ARRAY[
  'solaris_app_v3', 'solaris_app_v3_confirmation', 'solaris_app_v3_results',
  'solaris_app_v3_entry', 'solaris_app_v3_jury', 'solaris_app_v3_organizer',
  'solaris_app_v3_live'
])
ORDER BY key;

-- 5. One known narrow grant: proof of an effect that is present without its
-- corresponding history row. Verify all other grants separately.
SELECT
  to_regprocedure('public.emit_entry_published_event(uuid,uuid)') IS NOT NULL AS rpc_exists,
  has_function_privilege('service_role','public.emit_entry_published_event(uuid,uuid)','EXECUTE') AS service_execute,
  has_function_privilege('authenticated','public.emit_entry_published_event(uuid,uuid)','EXECUTE') AS authenticated_execute,
  has_function_privilege('anon','public.emit_entry_published_event(uuid,uuid)','EXECUTE') AS anon_execute;
