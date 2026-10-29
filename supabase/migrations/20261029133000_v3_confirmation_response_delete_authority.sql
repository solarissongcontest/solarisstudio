begin;
select public.v3_register_migration_contract('v3.confirmation.response-delete-authority',1,'forward_fix_only',false,null,'Replace unversioned response deletion with one live-actor CAS command, atomic audit/receipt and recovery after the response has disappeared.');

-- The same STABLE snapshot supplies displayed content and its opaque CAS token.
-- Include parent controls and all selection/review content, not a client clock.
create function private.v3_confirmation_response_delete_revision(p_submission_id uuid) returns text
language sql stable security definer set search_path=pg_catalog,public,private,extensions,pg_temp set timezone='UTC' as $revision$
 select encode(extensions.digest(jsonb_build_object(
  'response',to_jsonb(s),
  'reviewVersion',(select version from public.studio2_confirmation_review_versions where submission_id=s.id),
  'internal',(select jsonb_agg(to_jsonb(i) order by i.id) from public.internal_entries i where i.submission_id=s.id),
  'nationalFinal',(select jsonb_agg(to_jsonb(n) order by n.id) from public.national_finals n where n.submission_id=s.id),
  'candidates',(select jsonb_agg(to_jsonb(i) order by i.id) from public.national_final_entries i join public.national_finals n on n.id=i.national_final_id where n.submission_id=s.id)
 )::text,'sha256'),'hex') from public.submissions s where s.id=p_submission_id;
$revision$;
revoke all on function private.v3_confirmation_response_delete_revision(uuid) from public,anon,authenticated,service_role;
do $read_contract$
declare d text; anchor text:=E'\'id\', s.id,';
begin
 d:=pg_get_functiondef('public.admin_confirmation_response(uuid)'::regprocedure);
 if position(anchor in d)=0 then raise exception 'Confirmation response read contract changed'; end if;
 execute replace(d,anchor,anchor||E'\n    \'delete_revision\', private.v3_confirmation_response_delete_revision(s.id),');
end $read_contract$;

-- No unversioned peer remains callable, including through a server credential.
drop function public.admin_confirmation_delete_response(uuid);
create function public.admin_confirmation_delete_response(_submission_id uuid,p_expected_revision text,p_operation_id uuid,p_idempotency_key text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,private,extensions,pg_temp as $delete$
declare s public.submissions%rowtype; claim jsonb; result jsonb; round_id uuid; runtime_state text;
begin
 perform private.v3_require_active_auth_session();
 if not private.studio2_user_has_capability(auth.uid(),'delegation.manage',null) or not private.solaris_confirmation_admin_allowed() then
  raise exception 'Missing Solaris capability: delegation.manage' using errcode='42501';
 end if;
 if _submission_id is null or p_expected_revision is null or p_expected_revision !~ '^[a-f0-9]{64}$' or p_operation_id is null or nullif(btrim(p_idempotency_key),'') is null then
  raise exception 'Response, canonical revision and operation identity required' using errcode='22023';
 end if;
 -- Claim/recover BEFORE any lookup of the response. Scope and fingerprint are
 -- independent of live rows, so deletion cannot destroy its recovery authority.
 claim:=private.studio2_claim_operation(p_operation_id,p_idempotency_key,p_operation_id,'confirmation.response.delete','R2',jsonb_build_object('submissionId',_submission_id),jsonb_build_object('expectedRevision',p_expected_revision));
 if coalesce((claim->>'replayed')::boolean,false) then
  if claim->>'status'<>'succeeded' or claim->'result' is null then raise exception 'OPERATION_PENDING'; end if;
  return (claim->'result')||jsonb_build_object('replayed',true);
 end if;
 select sub.round_id into round_id from public.submissions sub where sub.id=_submission_id;
 if round_id is null then raise exception 'VERSION_CONFLICT' using errcode='PT409'; end if;
 -- Match the existing round -> children -> parent content/restore lock order.
 perform 1 from public.submission_rounds where id=round_id for update;
 perform 1 from public.internal_entries where submission_id=_submission_id order by id for update;
 perform 1 from public.national_finals where submission_id=_submission_id order by id for update;
 perform 1 from public.national_final_entries i join public.national_finals n on n.id=i.national_final_id where n.submission_id=_submission_id order by i.id for update of i;
 select * into s from public.submissions where id=_submission_id for update;
 if s.id is null or s.round_id is distinct from round_id or private.v3_confirmation_response_delete_revision(s.id) is distinct from p_expected_revision then
  raise exception 'VERSION_CONFLICT' using errcode='PT409';
 end if;
 select state into runtime_state from public.studio2_edition_runtime where edition_id=s.edition_id for share;
 if runtime_state='archived' then raise exception 'Archived edition workflow is read-only.' using errcode='42501'; end if;
 -- A resolved requirement must not retain an invalid FK/status between the
 -- source delete and its existing reconciliation trigger. All effects roll back
 -- with the deletion, audit and receipt if any part fails.
 update public.studio2_confirmation_requirements set status='required',resolved_by_submission_id=null,resolved_at=null,updated_at=now() where resolved_by_submission_id=s.id;
 delete from public.submissions where id=s.id;
 insert into public.admin_audit_log(actor_id,action,table_name,record_id,before_data,after_data)
 values(auth.uid(),'confirmation_response_deleted','submissions',s.id::text,jsonb_build_object('editionId',s.edition_id,'roundId',s.round_id,'revision',p_expected_revision),jsonb_build_object('deleted',true,'operationId',p_operation_id));
 result:=jsonb_build_object('ok',true,'deleted',true,'submissionId',s.id,'editionId',s.edition_id,'roundId',s.round_id,'previousRevision',p_expected_revision,'operationId',p_operation_id);
 perform private.studio2_complete_operation(p_operation_id,result);
 return result||jsonb_build_object('replayed',false);
end $delete$;
revoke all on function public.admin_confirmation_delete_response(uuid,text,uuid,text) from public,anon,service_role;
grant execute on function public.admin_confirmation_delete_response(uuid,text,uuid,text) to authenticated;
-- Raw receipt grants for other command families must not let a transport role
-- invent this command's committed deletion or destroy its recovery evidence.
create function private.v3_guard_confirmation_delete_receipt() returns trigger
language plpgsql set search_path=pg_catalog,pg_temp as $guard$
declare command_name text; old_command_name text;
begin
 if tg_op='TRUNCATE' then
  if current_user<>'postgres' then raise exception 'Canonical delete receipt history cannot be truncated' using errcode='42501'; end if;
  return null;
 end if;
 command_name:=case when tg_op='DELETE' then old.command else new.command end;
 old_command_name:=case when tg_op='UPDATE' then old.command else null end;
 if current_user<>'postgres' and (command_name='confirmation.response.delete' or old_command_name='confirmation.response.delete') then
  raise exception 'Confirmation delete receipts are command-owned' using errcode='42501';
 end if;
 return case when tg_op='DELETE' then old else new end;
end $guard$;
revoke all on function private.v3_guard_confirmation_delete_receipt() from public,anon,authenticated,service_role;
create trigger v3_confirmation_delete_receipt_guard before insert or update or delete on public.studio2_operation_receipts for each row execute function private.v3_guard_confirmation_delete_receipt();
create trigger v3_confirmation_delete_receipt_truncate_guard before truncate on public.studio2_operation_receipts for each statement execute function private.v3_guard_confirmation_delete_receipt();
notify pgrst,'reload schema';
commit;
