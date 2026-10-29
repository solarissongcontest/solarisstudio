begin;

-- V3 S16 shared-authority hardening.
--
-- These functions are existing transactional trigger/implementation mechanisms,
-- not independent business authorities. Pin their SECURITY DEFINER lookup path
-- to a catalog-first, pg_temp-last path so runtime proof can fail closed on any
-- later definition/ACL/topology drift.

alter function public.sync_confirmation_entry_youtube_link()
  set search_path = pg_catalog, public, pg_temp;

alter function private.v3_supersede_stale_media_reviews()
  set search_path = pg_catalog, public, private, pg_temp;

alter function private.v3_apply_entry_credits_context()
  set search_path = pg_catalog, public, private, pg_temp;

alter function private.v3_bind_confirmation_entry_version()
  set search_path = pg_catalog, public, private, pg_temp;

alter function private.v3_record_inserted_entry_version()
  set search_path = pg_catalog, public, private, pg_temp;

alter function private.studio2_sync_results_after_jury_ballot_review()
  set search_path = pg_catalog, public, private, pg_temp;

alter function private.studio2_jury_ballot_review_task_trigger()
  set search_path = pg_catalog, public, private, pg_temp;

alter function private.studio2_confirmation_submission_requirement_trigger()
  set search_path = pg_catalog, public, private, pg_temp;

alter function private.studio2_reconcile_confirmation_requirement(uuid, uuid)
  set search_path = pg_catalog, public, private, pg_temp;

alter function public.admin_confirmation_ensure_requirements(uuid, uuid[])
  set search_path = pg_catalog, public, private, pg_temp;

-- The legacy Entry mutator is implementation behind the governed
-- studio2_apply_participation_status command. service_role must not remain a
-- second externally invokable mutation authority.
revoke all on function public.admin_set_participation_status(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_set_participation_status(uuid, uuid, uuid, text)
  to postgres;
alter function public.admin_set_participation_status(uuid, uuid, uuid, text)
  set search_path = pg_catalog, public, private, pg_temp;

commit;
