begin;
select public.v3_register_migration_contract('v3.confirmation.restore-command',1,'forward_fix_only',false,null,'Replace unversioned restoration with reviewed-state CAS, active capability, stable operation identity, durable receipt, audit, immutable version history and transactional Confirmation consequences.');
-- Preserve the proven restore/provenance implementation behind one governed
-- boundary. Its historical public three-argument entrypoint disappears.
alter function public.admin_restore_confirmation_version(uuid,uuid,text) rename to v3_restore_confirmation_version_core;
alter function public.v3_restore_confirmation_version_core(uuid,uuid,text) set schema private;
alter function private.v3_restore_confirmation_version_core(uuid,uuid,text) set search_path=pg_catalog,public,private,pg_temp;
revoke all on function private.v3_restore_confirmation_version_core(uuid,uuid,text) from public,anon,authenticated,service_role;
alter function public.admin_restore_confirmation_version_apply(uuid,uuid,text) set search_path=pg_catalog,public,private,pg_temp;
revoke all on function public.admin_restore_confirmation_version_apply(uuid,uuid,text) from public,anon,authenticated,service_role;
create function public.admin_restore_confirmation_version(_submission_id uuid,_version_id uuid,_reason text,p_expected_revision text,p_operation_id uuid,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,pg_temp as $restore$
declare s public.submissions%rowtype; round_id uuid; claim jsonb; result jsonb; reason text:=nullif(btrim(_reason),''); state text;
begin
 perform private.v3_require_active_auth_session();
 if not private.studio2_user_has_capability(auth.uid(),'delegation.manage',null) or not private.solaris_confirmation_admin_allowed() then raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501'; end if;
 if _submission_id is null or _version_id is null or reason is null or length(reason)<8 or length(reason)>1000 or p_expected_revision is null or p_expected_revision !~ '^[a-f0-9]{64}$' or p_operation_id is null or nullif(btrim(p_idempotency_key),'') is null then raise exception 'Response, historical version, reason, reviewed revision and operation identity are required' using errcode='22023'; end if;
 claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,p_operation_id,'confirmation.response.restore','R2',jsonb_build_object('submissionId',_submission_id),jsonb_build_object('versionId',_version_id,'reason',reason,'expectedRevision',p_expected_revision));
 if coalesce((claim->>'replayed')::boolean,false) then
  if claim->>'status'<>'succeeded' or claim->'result' is null then raise exception 'OPERATION_PENDING'; end if;
  return (claim->'result')||jsonb_build_object('replayed',true);
 end if;
 select sub.round_id into round_id from public.submissions sub where sub.id=_submission_id;
 if round_id is null then raise exception 'VERSION_CONFLICT' using errcode='PT409'; end if;
 perform 1 from public.submission_rounds where id=round_id for update;
 perform 1 from public.internal_entries where submission_id=_submission_id order by id for update;
 perform 1 from public.national_finals where submission_id=_submission_id order by id for update;
 perform 1 from public.national_final_entries e join public.national_finals n on n.id=e.national_final_id where n.submission_id=_submission_id order by e.id for update of e;
 select * into s from public.submissions where id=_submission_id for update;
 if s.id is null or s.round_id is distinct from round_id or private.v3_confirmation_response_delete_revision(s.id) is distinct from p_expected_revision then raise exception 'VERSION_CONFLICT' using errcode='PT409'; end if;
 select r.state into state from public.studio2_edition_runtime r where edition_id=s.edition_id for share;
 if state='archived' then raise exception 'Archived edition workflow is read-only.' using errcode='42501'; end if;
 result:=private.v3_restore_confirmation_version_core(_submission_id,_version_id,reason);
 select * into s from public.submissions where id=_submission_id;
 result:=result||jsonb_build_object('operationId',p_operation_id,'submissionId',s.id,'roundId',s.round_id,'editionId',s.edition_id,'editCount',s.edit_count);
 insert into public.admin_audit_log(actor_id,action,table_name,record_id,before_data,after_data) values(auth.uid(),'confirmation_response_restored','submissions',s.id::text,jsonb_build_object('revision',p_expected_revision),jsonb_build_object('operationId',p_operation_id,'versionId',_version_id,'capturedVersion',result->'captured_version','reason',reason));
 perform private.studio2_complete_operation(p_operation_id,result);
 return result||jsonb_build_object('replayed',false);
end $restore$;
revoke all on function public.admin_restore_confirmation_version(uuid,uuid,text,text,uuid,text) from public,anon,service_role;
grant execute on function public.admin_restore_confirmation_version(uuid,uuid,text,text,uuid,text) to authenticated;
-- The same receipt-driven durable consequence family observes restoration.
-- Event failure rolls back state/history/audit/receipt together; delivery is
-- recoverable through the existing Confirmation task/notification consumers.
do $event$
declare d text; anchor text:=$anchor$if new.command = 'confirmation.submit' then$anchor$;
begin
 d:=pg_get_functiondef('private.v3_emit_confirmation_operation_event()'::regprocedure);
 if position(anchor in d)=0 then raise exception 'Confirmation consequence contract drift'; end if;
 execute replace(d,anchor,$replacement$if new.command in ('confirmation.submit','confirmation.response.restore') then$replacement$);
end $event$;
notify pgrst,'reload schema';
commit;
