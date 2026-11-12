-- S06 local-only upstream-RPC catalog audit, exactly 21 signatures.
-- Queries only pg_catalog; run ONLY against disposable, networkless PG17.11
-- reconstructed from merged S02 fixture; never on hosted Supabase in CI.
-- Expected hashes come from bounded operator-initiated READ-ONLY metadata audit.
WITH required(identity) AS (
  VALUES
  ('private.studio2_claim_operation(uuid,text,uuid,text,text,jsonb,jsonb)'),
  ('private.studio2_complete_operation(uuid,jsonb)'),
  ('private.studio2_default_subsystems(text)'),
  ('private.studio2_normalise_publication_config(jsonb)'),
  ('private.studio2_reconcile_confirmation_requirement_tasks(uuid)'),
  ('private.studio2_reconcile_confirmation_sync_tasks()'),
  ('private.studio2_reconcile_jury_ballot_review_tasks(uuid)'),
  ('private.studio2_reconcile_organizer_tasks_operational(uuid)'),
  ('private.studio2_reconcile_organizer_tasks_truth(uuid)'),
  ('private.studio2_reconcile_organizer_tasks(uuid)'),
  ('private.studio2_reconcile_permission_approval_tasks()'),
  ('private.studio2_reconcile_system_job_tasks()'),
  ('private.studio2_repair_jury_missing_ballot_tasks(uuid)'),
  ('private.studio2_sync_task_notifications(uuid)'),
  ('private.studio2_task_recipient_eligible(uuid,uuid)'),
  ('private.studio2_transition_risk(text,text)'),
  ('private.v3_emit_domain_event(text,text,text,bigint,uuid,uuid,uuid,jsonb,integer,text[])'),
  ('private.v3_publication_result_version_release_ready(uuid,bigint)'),
  ('public.studio2_access_allowed(text,uuid,boolean)'),
  ('public.studio2_complete_domain_event_delivery(uuid,text,text,jsonb)'),
  ('public.studio2_transition_edition_v2(uuid,text,text,uuid)')
), catalog AS (
  SELECT w.identity,
         md5(pg_get_functiondef(p.oid)) AS definition_md5,
         pg_get_userbyid(p.proowner) AS owner,
         p.prosecdef AS security_definer,
         p.proisstrict AS strict,
         p.provolatile AS volatility,
         p.proparallel AS parallel,
         coalesce(p.proacl::text,'') AS acl,
         coalesce(array_to_string(p.proconfig,'|'),'') AS config
  FROM required w LEFT JOIN pg_proc p ON p.oid=to_regprocedure(w.identity)
)
SELECT coalesce(jsonb_agg(to_jsonb(catalog) ORDER BY identity),'[]'::jsonb)::text
FROM catalog;
