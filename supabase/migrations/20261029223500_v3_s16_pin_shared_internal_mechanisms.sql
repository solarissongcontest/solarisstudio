begin;

-- S16 structural proof requires every SECURITY DEFINER mechanism and every
-- reviewed caller in its chain to resolve system objects from pg_catalog first
-- and temporary objects only from an explicit final pg_temp entry. These are
-- configuration-only hardenings: no business semantics or grants are widened.

alter function private.studio2_reconcile_confirmation_requirement(uuid, uuid)
  set search_path = pg_catalog, public, private, pg_temp;
alter function private.studio2_confirmation_submission_requirement_trigger()
  set search_path = pg_catalog, public, private, pg_temp;
alter function public.admin_confirmation_ensure_requirements(uuid, uuid[])
  set search_path = pg_catalog, public, private, pg_temp;
alter function public.admin_confirmation_apply_requirement_materialization(
  uuid, uuid[], text, uuid, text, uuid
) set search_path = pg_catalog, public, private, pg_temp;
alter function public.studio2_reconcile_confirmation_requirements(uuid, integer, integer)
  set search_path = pg_catalog, public, private, pg_temp;
alter function private.studio2_touch_confirmation_round_version()
  set search_path = pg_catalog, public, private, pg_temp;

alter function public.studio2_apply_participation_status(
  uuid, uuid, uuid, text, uuid, text, bigint
) set search_path = pg_catalog, public, private, pg_temp;
alter function private.v3_supersede_stale_media_reviews()
  set search_path = pg_catalog, public, private, pg_temp;
alter function private.v3_apply_entry_credits_context()
  set search_path = pg_catalog, public, private, pg_temp;
alter function private.v3_bind_confirmation_entry_version()
  set search_path = pg_catalog, public, private, pg_temp;
alter function private.v3_record_inserted_entry_version()
  set search_path = pg_catalog, public, private, pg_temp;

alter function public.assign_jury_vote(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer
) set search_path = pg_catalog, public, private, pg_temp;
alter function public.clear_jury_point(
  uuid, uuid, uuid, uuid, uuid, integer
) set search_path = pg_catalog, public, private, pg_temp;
alter function public.studio2_apply_jury_vote_change(
  uuid, uuid, uuid, uuid, uuid, uuid, uuid, integer, text, uuid, text, bigint
) set search_path = pg_catalog, public, private, pg_temp;
alter function private.studio2_sync_results_after_jury_ballot_review()
  set search_path = pg_catalog, public, private, pg_temp;
alter function private.studio2_jury_ballot_review_task_trigger()
  set search_path = pg_catalog, public, private, pg_temp;
alter function public.sync_results_after_vote_change()
  set search_path = pg_catalog, public, private, televoting, extensions, pg_temp;

notify pgrst, 'reload schema';

commit;
