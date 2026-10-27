begin;
select public.v3_register_migration_contract(
 'v3.media.finalization-authority',1,'forward_fix_only',false,null,
 'Retire raw service-role upload authorization writes. A narrow token/actor/session-bound finalization command owns the prepared-to-terminal CAS, published-object readback, operation receipt and media.verified event in one transaction.'
);
create or replace function public.v3_finalize_media_upload(
 p_token_id uuid, p_upload_secret text, p_actor_id uuid, p_actor_session_id uuid,
 p_status text, p_detected_mime text, p_metadata jsonb, p_rejection_reason text
) returns jsonb
language plpgsql security definer
set search_path=pg_catalog,public,private,auth,storage
as $finalize$
declare
 v_row public.studio2_upload_authorizations%rowtype;
 v_operation_id uuid := md5('media.finalize:'||p_token_id::text)::uuid;
 v_result jsonb;
begin
 if coalesce(auth.jwt()->>'role','') <> 'service_role' then
   raise exception 'AUTHORIZATION: media verification worker required' using errcode='42501';
 end if;
 select * into v_row from public.studio2_upload_authorizations where id=p_token_id for update;
 if not found or v_row.authorization_secret is distinct from p_upload_secret
    or v_row.actor_id is distinct from p_actor_id then
   raise exception 'AUTHORIZATION: upload authorization does not match worker evidence' using errcode='42501';
 end if;
 if v_row.actor_id is not null and not exists (
   select 1 from auth.sessions where id=p_actor_session_id and user_id=v_row.actor_id
     and (not_after is null or not_after > now())
 ) then raise exception 'SESSION_REVOKED' using errcode='42501'; end if;
 if p_status is null or p_status not in ('verified','rejected','expired')
    or jsonb_typeof(p_metadata) is distinct from 'object' then
   raise exception 'VALIDATION: invalid finalization outcome' using errcode='22023';
 end if;
 -- A lost race is not a successful write. The finalizer must re-read the
 -- canonical terminal receipt before acknowledging/rejecting another request.
 if v_row.status <> 'prepared' then return null; end if;
 if p_status='verified' then
   if v_row.expires_at <= now() or nullif(p_detected_mime,'') is null
      or p_metadata->>'signatureVerified' is distinct from 'true'
      or p_metadata->>'quarantineVerified' is distinct from 'true'
      or p_metadata->>'publicationDecision' is distinct from 'published_after_verification'
      or (p_metadata->>'originalSize')::bigint is distinct from v_row.expected_size
      or not exists (
        select 1 from storage.objects obj where obj.bucket_id=v_row.final_bucket and obj.name=v_row.final_path
          and obj.metadata->>'size' = p_metadata->>'publishedSize'
      ) then
     raise exception 'STATE_CHANGED: verified publication is not backed by canonical object evidence' using errcode='23514';
   end if;
 elsif nullif(btrim(coalesce(p_rejection_reason,'')),'') is null then
   raise exception 'VALIDATION: terminal failure reason required' using errcode='22023';
 end if;
 if p_status='expired' and v_row.expires_at > now() then
   raise exception 'STATE_CHANGED: upload authorization has not expired' using errcode='23514';
 end if;
 insert into public.studio2_operation_receipts(operation_id,actor_id,idempotency_key,correlation_id,request_fingerprint,command,risk_class,scope,status,actor_session_id)
 values(v_operation_id,v_row.actor_id,'media.finalize:'||p_token_id::text,v_operation_id,
   private.studio2_request_fingerprint('media.finalize','R1',jsonb_build_object('uploadTokenId',p_token_id),jsonb_build_object('status',p_status,'metadata',p_metadata)),
   'media.finalize','R1',jsonb_build_object('uploadTokenId',p_token_id,'domain',v_row.domain),'processing',p_actor_session_id::text);
 update public.studio2_upload_authorizations set status=p_status,detected_mime=p_detected_mime,
   verified_metadata=p_metadata,rejection_reason=p_rejection_reason,finalized_at=now()
   where id=p_token_id and status='prepared';
 v_result:=jsonb_build_object('id',p_token_id,'status',p_status,'operationId',v_operation_id);
 if p_status='verified' then
   perform private.v3_emit_domain_event('media.verified','upload',p_token_id::text,1,v_operation_id,
     case when v_row.domain='edition_artwork' then v_row.entity_id else null end,null,
     jsonb_build_object('uploadTokenId',p_token_id,'bucket',v_row.final_bucket,'path',v_row.final_path),1,array[]::text[]);
 end if;
 update public.studio2_operation_receipts set status='succeeded',result=v_result,completed_at=now(),updated_at=now()
 where operation_id=v_operation_id;
 return v_result;
end
$finalize$;
revoke all on function public.v3_finalize_media_upload(uuid,text,uuid,uuid,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.v3_finalize_media_upload(uuid,text,uuid,uuid,text,text,jsonb,text) to service_role;
-- Preparation remains in its existing authorization RPCs. No application worker
-- can directly insert, overwrite, delete or truncate canonical upload state.
revoke insert,update,delete,truncate on public.studio2_upload_authorizations from service_role;
notify pgrst,'reload schema';
commit;
