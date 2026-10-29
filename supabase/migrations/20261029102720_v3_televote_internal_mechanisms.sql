begin;
select public.v3_register_migration_contract('v3.televote.internal-mechanisms',1,'forward_fix_only',false,null,'Close trigger function exposure; remove trigger-generated entry identity and prove internal Televote mechanisms behind canonical commands.');
-- Guards remain SECURITY INVOKER where current_user is part of the invariant.
-- Only exposure/path changes: no new trigger gets semantic mutation authority.
alter function public.assert_entity_edition() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function public.assert_entity_edition() from public,anon,authenticated,service_role;
alter function private.studio2_guard_direct_client_write() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.studio2_guard_direct_client_write() from public,anon,authenticated,service_role;
alter function private.studio2_guard_direct_televote_status() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.studio2_guard_direct_televote_status() from public,anon,authenticated,service_role;
alter function private.studio2_touch_televote_global_version() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.studio2_touch_televote_global_version() from public,anon,authenticated,service_role;
alter function private.studio2_touch_televote_round_version() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.studio2_touch_televote_round_version() from public,anon,authenticated,service_role;
alter function private.v3_combined_command_version() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_combined_command_version() from public,anon,authenticated,service_role;
alter function private.v3_enforce_televote_submission_deadline() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_enforce_televote_submission_deadline() from public,anon,authenticated,service_role;
alter function private.v3_guard_archived_edition_workflow_write() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_guard_archived_edition_workflow_write() from public,anon,authenticated,service_role;
alter function private.v3_guard_archived_televote_write() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_guard_archived_televote_write() from public,anon,authenticated,service_role;
alter function private.v3_guard_direct_televote_deadline() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_guard_direct_televote_deadline() from public,anon,authenticated,service_role;
alter function private.v3_guard_source_managed_televote_projection() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_guard_source_managed_televote_projection() from public,anon,authenticated,service_role;
alter function private.v3_guard_televote_entry_scope() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_guard_televote_entry_scope() from public,anon,authenticated,service_role;
alter function private.v3_guard_televote_submission_identity() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_guard_televote_submission_identity() from public,anon,authenticated,service_role;
alter function private.v3_sync_published_televote_aggregation_trigger() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_sync_published_televote_aggregation_trigger() from public,anon,authenticated,service_role;
alter function private.v3_sync_published_televote_round_trigger() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_sync_published_televote_round_trigger() from public,anon,authenticated,service_role;
alter function private.v3_touch_televote_submission_version() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function private.v3_touch_televote_submission_version() from public,anon,authenticated,service_role;
alter function public.sync_results_after_vote_change() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function public.sync_results_after_vote_change() from public,anon,authenticated,service_role;
alter function televoting.block_sanctioned_submission() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function televoting.block_sanctioned_submission() from public,anon,authenticated,service_role;
alter function televoting.flag_round_results_outdated() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function televoting.flag_round_results_outdated() from public,anon,authenticated,service_role;
alter function televoting.round_entries_normalize() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function televoting.round_entries_normalize() from public,anon,authenticated,service_role;
alter function televoting.round_entries_sync_countries() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function televoting.round_entries_sync_countries() from public,anon,authenticated,service_role;
alter function televoting.update_updated_at_column() set search_path=pg_catalog,public,private,televoting,pg_temp;
revoke all on function televoting.update_updated_at_column() from public,anon,authenticated,service_role;

-- The canonical save_custom round command already creates entry_key. A trigger
-- must not generate business identity. It only normalizes country keys, retains
-- existing custom identity, and touches the timestamp.
create or replace function televoting.round_entries_normalize() returns trigger
language plpgsql set search_path=pg_catalog,televoting,pg_temp as $normalize$
begin
 if new.entry_type='country' then new.entry_key:=new.country_code;
 elsif tg_op='INSERT' then
  if nullif(btrim(new.entry_key),'') is null then raise exception 'Custom entry identity must be supplied by the canonical round command' using errcode='23514'; end if;
 else new.entry_key:=old.entry_key;
 end if;
 new.updated_at:=now();
 return new;
end $normalize$;
revoke all on function televoting.round_entries_normalize() from public,anon,authenticated,service_role;
-- Version rows are server-maintained housekeeping, never service-role input.
revoke insert,update,delete,truncate on public.studio2_televote_global_versions,public.studio2_televote_round_versions,public.studio2_televote_submission_versions from public,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION televoting.organizer_exclude_integrity_ballot(p_preflight_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'televoting', 'pg_temp'
AS $function$
declare
  v_edition_id uuid;
begin
  perform private.v3_require_active_auth_session();
  if auth.uid() is null then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;

  select coalesce(vpc.canonical_edition_id, il.solaris_id)
  into v_edition_id
  from televoting.vote_preflight_checks vpc
  left join televoting.rounds r on r.id = vpc.round_id
  left join public.integration_links il
    on il.service = 'televoting'
   and il.entity_type = 'edition'
   and il.remote_id = r.edition_id::text
  where vpc.id = p_preflight_id
  limit 1;

  if not public.studio2_access_allowed('televote.ballots.manage', v_edition_id, false) then
    raise exception 'Televote ballot management capability required' using errcode = '42501';
  end if;

  return televoting.exclude_integrity_ballot(p_preflight_id, p_reason, auth.uid());
end;
$function$;

CREATE OR REPLACE FUNCTION televoting.organizer_record_integrity_decision(p_preflight_id uuid, p_decision text, p_reason text, p_evidence_notes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'televoting', 'pg_temp'
AS $function$
declare
  v_edition_id uuid;
begin
  perform private.v3_require_active_auth_session();
  if auth.uid() is null then
    raise exception 'Organizer access required' using errcode = '42501';
  end if;

  select coalesce(vpc.canonical_edition_id, il.solaris_id)
  into v_edition_id
  from televoting.vote_preflight_checks vpc
  left join televoting.rounds r on r.id = vpc.round_id
  left join public.integration_links il
    on il.service = 'televoting'
   and il.entity_type = 'edition'
   and il.remote_id = r.edition_id::text
  where vpc.id = p_preflight_id
  limit 1;

  if not public.studio2_access_allowed('integrity.manage', v_edition_id, false) then
    raise exception 'Integrity management capability required' using errcode = '42501';
  end if;

  return televoting.record_integrity_decision(
    p_preflight_id,
    p_decision,
    p_reason,
    p_evidence_notes,
    auth.uid()
  );
end;
$function$;


alter function public.assert_entity_edition() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.update_updated_at_column() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.round_entries_normalize() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.round_entries_sync_countries() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.flag_round_results_outdated() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.flag_aggregation_outdated() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.block_sanctioned_submission() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.record_integrity_decision(p_preflight_id uuid, p_decision text, p_reason text, p_evidence_notes text, p_organizer_id uuid) set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.exclude_integrity_ballot(p_preflight_id uuid, p_reason text, p_organizer_id uuid) set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.organizer_record_integrity_decision(p_preflight_id uuid, p_decision text, p_reason text, p_evidence_notes text) set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.organizer_exclude_integrity_ballot(p_preflight_id uuid, p_reason text) set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function public.sync_results_after_vote_change() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.studio2_touch_televote_global_version() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.studio2_touch_televote_round_version() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.studio2_guard_direct_televote_status() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.studio2_guard_direct_client_write() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_guard_televote_submission_identity() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_guard_televote_entry_scope() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_apply_published_televote_projection(p_edition_id uuid, p_show_id uuid, p_source_type text, p_source_id text, p_source_version integer, p_source_published_at timestamp with time zone, p_rows jsonb) set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_sync_published_televote_round(p_round_id uuid) set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_sync_published_televote_aggregation(p_aggregation_id uuid) set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_guard_source_managed_televote_projection() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_sync_published_televote_round_trigger() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_sync_published_televote_aggregation_trigger() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_guard_direct_televote_deadline() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_enforce_televote_submission_deadline() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_guard_archived_edition_workflow_write() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_guard_archived_televote_write() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_touch_televote_submission_version() set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.v3_configure_round(p_round_id uuid, p_action text, p_payload jsonb, p_expected_round_version bigint, p_operation_id uuid, p_idempotency_key text, p_correlation_id uuid) set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function private.v3_configure_round_conversion(p_round_id uuid, p_action text, p_payload jsonb, p_expected_round_version bigint, p_operation_id uuid, p_idempotency_key text) set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
alter function televoting.v3_recover_conversion_calculation(p_round_id uuid, p_expected_round_version bigint, p_operation_id uuid) set search_path=pg_catalog,public,private,televoting,extensions,pg_temp;
commit;
