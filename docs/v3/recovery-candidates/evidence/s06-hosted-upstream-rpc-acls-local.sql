-- S06 LOCAL-ONLY privilege overlay on the 21 existing S02 fixture functions.
-- Exact allowed EXECUTE grantees came from bounded read-only hosted pg_catalog.
-- Applying ONLY to disposable --network none PG17.11, never hosted Supabase.
-- Original S02 source fixture remains unchanged; no app or production effect.
BEGIN;
REVOKE ALL ON FUNCTION "private"."studio2_claim_operation"(uuid,text,uuid,text,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_complete_operation"(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_default_subsystems"(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_normalise_publication_config"(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_reconcile_confirmation_requirement_tasks"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_reconcile_confirmation_sync_tasks"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_reconcile_jury_ballot_review_tasks"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_reconcile_organizer_tasks_operational"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_reconcile_organizer_tasks_truth"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_reconcile_organizer_tasks"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_reconcile_permission_approval_tasks"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_reconcile_system_job_tasks"() FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_repair_jury_missing_ballot_tasks"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_sync_task_notifications"(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_task_recipient_eligible"(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."studio2_transition_risk"(text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."v3_emit_domain_event"(text,text,text,bigint,uuid,uuid,uuid,jsonb,integer,text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION "private"."v3_publication_result_version_release_ready"(uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION "public"."studio2_access_allowed"(text,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."studio2_access_allowed"(text,uuid,boolean) TO authenticated, service_role, anon;
REVOKE ALL ON FUNCTION "public"."studio2_complete_domain_event_delivery"(uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."studio2_complete_domain_event_delivery"(uuid,text,text,jsonb) TO service_role;
REVOKE ALL ON FUNCTION "public"."studio2_transition_edition_v2"(uuid,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."studio2_transition_edition_v2"(uuid,text,text,uuid) TO authenticated, service_role;
COMMIT;
