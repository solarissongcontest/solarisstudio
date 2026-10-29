begin;
select public.v3_register_migration_contract('v3.shared.invariant-mechanisms',1,'forward_fix_only',false,null,'Close raw review/participation revisions and technical trigger exposure; prove shared invariant guards and bounded server housekeeping without granting semantic authority to triggers.');
-- Server-maintained CAS rows cannot be supplied or advanced by service callers.
revoke insert,update,delete,truncate on public.studio2_confirmation_review_versions,public.studio2_participation_status_versions from public,anon,authenticated,service_role;
do $columns$
declare t regclass; cols text;
begin
 foreach t in array array['public.studio2_confirmation_review_versions'::regclass,'public.studio2_participation_status_versions'::regclass] loop
  select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid=t and attnum>0 and not attisdropped;
  execute format('revoke insert (%s), update (%s) on %s from public,anon,authenticated,service_role',cols,cols,t);
 end loop;
end $columns$;
-- Confirmation content already has owner-only row DML. Remove the leftover
-- bulk bypass too so all versioned selection content has the same boundary.
revoke truncate on public.national_finals,public.national_final_entries from public,anon,authenticated,service_role;
-- Preserve INVOKER guards: current_user distinguishes raw client DML. Changing
-- EXECUTE grants does not disable trigger invocation by canonical commands.
alter function private.studio2_guard_confirmation_resolution_scope() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.studio2_guard_confirmation_resolution_scope() from public,anon,authenticated,service_role;
alter function private.studio2_guard_direct_confirmation_review_transition() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.studio2_guard_direct_confirmation_review_transition() from public,anon,authenticated,service_role;
alter function private.studio2_guard_direct_confirmation_round_mutation() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.studio2_guard_direct_confirmation_round_mutation() from public,anon,authenticated,service_role;
alter function private.studio2_guard_duplicate_confirmation_submission() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.studio2_guard_duplicate_confirmation_submission() from public,anon,authenticated,service_role;
alter function private.studio2_touch_confirmation_review_version() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.studio2_touch_confirmation_review_version() from public,anon,authenticated,service_role;
alter function private.studio2_touch_confirmation_round_version() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.studio2_touch_confirmation_round_version() from public,anon,authenticated,service_role;
alter function private.studio2_touch_jury_window_version() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.studio2_touch_jury_window_version() from public,anon,authenticated,service_role;
alter function private.studio2_touch_participation_status_version() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.studio2_touch_participation_status_version() from public,anon,authenticated,service_role;
alter function private.v3_guard_archived_edition_workflow_write() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.v3_guard_archived_edition_workflow_write() from public,anon,authenticated,service_role;
alter function private.v3_guard_entry_parent_scope() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.v3_guard_entry_parent_scope() from public,anon,authenticated,service_role;
alter function private.v3_guard_jury_ballot_reference_scope() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.v3_guard_jury_ballot_reference_scope() from public,anon,authenticated,service_role;
alter function private.v3_guard_jury_vote_object_scope() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.v3_guard_jury_vote_object_scope() from public,anon,authenticated,service_role;
alter function private.v3_validate_current_entry_pointer() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.v3_validate_current_entry_pointer() from public,anon,authenticated,service_role;
alter function private.v3_validate_jury_submission_scope() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.v3_validate_jury_submission_scope() from public,anon,authenticated,service_role;
alter function private.v3_validate_jury_vote_ballot_scope() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.v3_validate_jury_vote_ballot_scope() from public,anon,authenticated,service_role;
alter function private.v3_validate_jury_window_scope() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.v3_validate_jury_window_scope() from public,anon,authenticated,service_role;
alter function private.studio2_guard_direct_client_write() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function private.studio2_guard_direct_client_write() from public,anon,authenticated,service_role;
alter function public.assert_entity_edition() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function public.assert_entity_edition() from public,anon,authenticated,service_role;
alter function public.bump_edition_data_revision() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function public.bump_edition_data_revision() from public,anon,authenticated,service_role;
alter function public.update_updated_at_column() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
revoke all on function public.update_updated_at_column() from public,anon,authenticated,service_role;
-- This scalar guard uses only NEW/OLD and pg_catalog operations. Retain its
-- original narrower path; it has no relation lookup that needs app schemas.
alter function private.v3_combined_command_version() set search_path=pg_catalog;
commit;
