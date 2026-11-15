begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- Current-main port of #1847, not replay of its stale stacked branch.
do $pre$ begin
 if current_user<>'postgres' or to_regclass('private.v3_migration_contracts') is null or
    to_regclass('public.studio2_upload_authorizations') is null or
    to_regclass('storage.objects') is null or
    to_regprocedure('private.studio2_platform_mutation_allowed(text)') is null then
  raise exception 'Media finalization authority prerequisites missing' using errcode='55000';end if;
 if to_regprocedure('public.v3_finalize_media_upload(uuid,text,uuid,uuid,text,text,jsonb,text)') is not null or
    to_regprocedure('public.v3_read_media_finalization_receipt(uuid,text,uuid,uuid)') is not null or
    exists(select 1 from private.v3_migration_contracts where migration_key in('v3.media.finalization-authority','v3.media.verified-byte-identity','v3.media.immutable-publication-cutover'))then
  raise exception 'Media authority already/partially installed' using errcode='55000';end if;
 if not has_schema_privilege('postgres','storage','USAGE') or not has_table_privilege('postgres','storage.objects','SELECT')then raise exception 'Storage metadata read authority missing' using errcode='42501';end if;
 if not exists(select 1 from pg_class c where c.oid='public.studio2_upload_authorizations'::regclass and pg_get_userbyid(c.relowner)='postgres' and c.relrowsecurity)then
  raise exception 'Media authorization owner/RLS drift' using errcode='55000';end if;
 if to_regprocedure('public.studio2_prepare_upload(text,uuid,text,text,text,bigint,jsonb)') is null or
    encode(sha256(convert_to(pg_get_functiondef(to_regprocedure('private.studio2_can_upload_country_media(uuid,uuid)')),'UTF8')),'hex') is distinct from '1d5951ce09b821c7b8184e3e9a93733c30f1dec5120694449c2ee3a3a93dfc4f' then
  raise exception 'Canonical Media preparation/authorization drift' using errcode='55000';end if;
end $pre$;
select public.v3_register_migration_contract('v3.media.finalization-authority',1,'forward_fix_only',false,null,'Port #1847: server byte verification delegates canonical media state, receipts and events to one actor/session/capability-bound database command');

select public.v3_register_migration_contract(
  'v3.media.verified-byte-identity',
  1,
  'forward_fix_only',
  false,
  null,
  'Bind media verification to one immutable publication identity. The governed finalizer must provide a SHA-256 digest of the exact published bytes; the database captures the matching Storage object id/size in the canonical media receipt and media.verified event. Verified receipt readback fails closed if DB/Storage identity diverges.'
);

create or replace function public.v3_finalize_media_upload(
  p_token_id uuid,
  p_upload_secret text,
  p_actor_id uuid,
  p_actor_session_id uuid,
  p_status text,
  p_detected_mime text,
  p_metadata jsonb,
  p_rejection_reason text
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, storage
as $finalize$
declare
  v_row public.studio2_upload_authorizations%rowtype;
  v_operation_id uuid := md5('media.finalize:' || p_token_id::text)::uuid;
  v_existing_receipt public.studio2_operation_receipts%rowtype;
  v_storage_object_id uuid;
  v_storage_size bigint;
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_result jsonb;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'AUTHORIZATION: media verification worker required' using errcode = '42501';
  end if;

  select *
  into v_row
  from public.studio2_upload_authorizations
  where id = p_token_id
  for update;

  if not found
     or v_row.authorization_secret is distinct from p_upload_secret
     or v_row.actor_id is distinct from p_actor_id then
    raise exception 'AUTHORIZATION: upload authorization does not match worker evidence' using errcode = '42501';
  end if;

  if v_row.actor_id is not null then
    perform 1 from auth.sessions
    where id=p_actor_session_id and user_id=v_row.actor_id
      and (not_after is null or not_after>now()) for key share;
    if not found then raise exception 'SESSION_REVOKED' using errcode='42501';end if;
  elsif p_actor_session_id is not null then
    raise exception 'AUTHORIZATION: anonymous capability has no actor session' using errcode='42501';
  end if;

  if p_status is null
     or p_status not in ('verified', 'rejected', 'expired')
     or jsonb_typeof(v_metadata) is distinct from 'object' then
    raise exception 'VALIDATION: invalid finalization outcome' using errcode = '22023';
  end if;

  if p_status = 'verified' and p_rejection_reason is not null then raise exception 'VALIDATION: verified media cannot carry rejection' using errcode='22023';end if;
  if p_status = 'verified' then
    if (v_row.status = 'prepared' and v_row.expires_at <= now())
       or nullif(p_detected_mime, '') is null
       or v_metadata->>'signatureVerified' is distinct from 'true'
       or v_metadata->>'quarantineVerified' is distinct from 'true'
       or v_metadata->>'publicationDecision' is distinct from 'published_after_verification'
       or v_metadata->>'hashAlgorithm' is distinct from 'sha256'
       or coalesce(v_metadata->>'publishedSha256', '') !~ '^[0-9a-f]{64}$'
       or coalesce(v_metadata->>'originalSize', '') !~ '^[0-9]+$'
       or coalesce(v_metadata->>'publishedSize', '') !~ '^[0-9]+$'
       or (v_metadata->>'originalSize')::bigint is distinct from v_row.expected_size then
      raise exception 'STATE_CHANGED: verified publication lacks exact canonical byte evidence' using errcode = '23514';
    end if;

    select obj.id, nullif(obj.metadata->>'size', '')::bigint
    into v_storage_object_id, v_storage_size
    from storage.objects obj
    where obj.bucket_id = v_row.final_bucket
      and obj.name = v_row.final_path;

    if v_storage_object_id is null
       or v_storage_size is distinct from (v_metadata->>'publishedSize')::bigint then
      raise exception 'STATE_CHANGED: verified publication is not backed by the expected Storage object' using errcode = '23514';
    end if;

    v_metadata := v_metadata || jsonb_build_object(
      'storageObjectId', v_storage_object_id,
      'storageBucket', v_row.final_bucket,
      'storagePath', v_row.final_path
    );
  elsif nullif(btrim(coalesce(p_rejection_reason, '')), '') is null then
    raise exception 'VALIDATION: terminal failure reason required' using errcode = '22023';
  end if;

  if p_status = 'expired' and v_row.expires_at > now() then
    raise exception 'STATE_CHANGED: upload authorization has not expired' using errcode = '23514';
  end if;

  -- A racing retry may arrive after the first transaction committed. It is
  -- idempotent only when it describes the same terminal result and, for
  -- verified media, the same exact published byte digest.
  if v_row.status <> 'prepared' then
    if v_row.status is distinct from p_status then
      raise exception 'STATE_CHANGED: upload already reached terminal state %', v_row.status using errcode = '23514';
    end if;
    if p_status = 'verified'
       and (
         v_row.verified_metadata->>'publishedSha256' is distinct from v_metadata->>'publishedSha256'
         or v_row.verified_metadata->>'publishedSize' is distinct from v_metadata->>'publishedSize'
         or v_row.verified_metadata->>'storageObjectId' is distinct from v_metadata->>'storageObjectId'
       ) then
      raise exception 'IDEMPOTENCY_KEY_REUSED: verified retry refers to different bytes' using errcode = '23514';
    end if;

    if v_row.detected_mime is distinct from p_detected_mime or
       v_row.rejection_reason is distinct from p_rejection_reason or
       v_row.verified_metadata is distinct from v_metadata then
      raise exception 'IDEMPOTENCY_KEY_REUSED: terminal retry content changed' using errcode='23514';
    end if;

    select *
    into v_existing_receipt
    from public.studio2_operation_receipts
    where operation_id = v_operation_id
      and command = 'media.finalize'
      and status = 'succeeded';

    if v_existing_receipt.operation_id is null then
      return null;
    end if;
    return v_existing_receipt.result;
  end if;

  -- Replays are readback; new state must independently respect the database gate.
  if not coalesce(private.studio2_platform_mutation_allowed('media.finalize'),false) then
    raise exception 'PLATFORM_MODE_BLOCKED: media finalization is unavailable' using errcode='25006';
  end if;
  if v_row.domain in('country_media','country_font') and
     not coalesce(private.studio2_can_upload_country_media(v_row.actor_id,v_row.entity_id),false) then
    raise exception 'AUTHORIZATION: country media authority was revoked' using errcode='42501';
  elsif v_row.domain='edition_artwork' and
     not coalesce(private.studio2_user_has_capability(v_row.actor_id,'edition.manage',v_row.entity_id),false) then
    raise exception 'AUTHORIZATION: edition artwork authority was revoked' using errcode='42501';
  end if;

  insert into public.studio2_operation_receipts(
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope,
    status,
    actor_session_id
  ) values (
    v_operation_id,
    v_row.actor_id,
    'media.finalize:' || p_token_id::text,
    v_operation_id,
    private.studio2_request_fingerprint(
      'media.finalize',
      'R1',
      jsonb_build_object('uploadTokenId', p_token_id),
      jsonb_build_object('status', p_status, 'metadata', v_metadata)
    ),
    'media.finalize',
    'R1',
    jsonb_build_object('uploadTokenId', p_token_id, 'domain', v_row.domain),
    'processing',
    p_actor_session_id::text
  );

  update public.studio2_upload_authorizations
  set status = p_status,
      detected_mime = p_detected_mime,
      verified_metadata = v_metadata,
      rejection_reason = p_rejection_reason,
      finalized_at = now()
  where id = p_token_id
    and status = 'prepared';

  if not found then
    raise exception 'STATE_CHANGED: prepared Media update was suppressed' using errcode='23514';
  end if;

  v_result := jsonb_build_object(
    'id', p_token_id,
    'status', p_status,
    'operationId', v_operation_id,
    'bucket', v_row.final_bucket,
    'path', v_row.final_path,
    'detectedMime', p_detected_mime,
    'metadata', v_metadata
  );

  if p_status = 'verified' then
    perform private.v3_emit_domain_event(
      'media.verified',
      'upload',
      p_token_id::text,
      1,
      v_operation_id,
      case when v_row.domain = 'edition_artwork' then v_row.entity_id else null end,
      null,
      jsonb_build_object(
        'uploadTokenId', p_token_id,
        'bucket', v_row.final_bucket,
        'path', v_row.final_path,
        'storageObjectId', v_storage_object_id,
        'publishedSize', (v_metadata->>'publishedSize')::bigint,
        'publishedSha256', v_metadata->>'publishedSha256',
        'hashAlgorithm', 'sha256',
        'detectedMime', p_detected_mime
      ),
      1,
      array[]::text[]
    );
  end if;

  update public.studio2_operation_receipts
  set status = 'succeeded',
      result = v_result,
      completed_at = now(),
      updated_at = now()
  where operation_id = v_operation_id;

  return v_result;
end
$finalize$;

revoke all on function public.v3_finalize_media_upload(uuid,text,uuid,uuid,text,text,jsonb,text)
  from public, anon, authenticated;
grant execute on function public.v3_finalize_media_upload(uuid,text,uuid,uuid,text,text,jsonb,text)
  to service_role;

create or replace function public.v3_read_media_finalization_receipt(
  p_token_id uuid,
  p_upload_secret text,
  p_actor_id uuid,
  p_actor_session_id uuid
) returns jsonb
language plpgsql
security definer
stable
set search_path = pg_catalog, public, private, auth, storage
as $readback$
declare
  v_row public.studio2_upload_authorizations%rowtype;
  v_operation_id uuid := md5('media.finalize:' || p_token_id::text)::uuid;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_storage_object_id uuid;
  v_storage_size bigint;
begin
  if coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception 'AUTHORIZATION: media verification worker required' using errcode = '42501';
  end if;

  select *
  into v_row
  from public.studio2_upload_authorizations
  where id = p_token_id;

  if not found
     or v_row.authorization_secret is distinct from p_upload_secret
     or v_row.actor_id is distinct from p_actor_id then
    raise exception 'AUTHORIZATION: upload authorization does not match worker evidence' using errcode = '42501';
  end if;

  if v_row.actor_id is not null and not exists (
    select 1
    from auth.sessions
    where id = p_actor_session_id
      and user_id = v_row.actor_id
      and (not_after is null or not_after > now())
  ) then
    raise exception 'SESSION_REVOKED' using errcode = '42501';
  end if;

  if v_row.status <> 'verified'
     or v_row.verified_metadata->>'hashAlgorithm' is distinct from 'sha256'
     or coalesce(v_row.verified_metadata->>'publishedSha256', '') !~ '^[0-9a-f]{64}$'
     or coalesce(v_row.verified_metadata->>'publishedSize', '') !~ '^[0-9]+$'
     or coalesce(v_row.verified_metadata->>'storageObjectId', '') !~ '^[0-9a-f-]{36}$' then
    return null;
  end if;

  select obj.id, nullif(obj.metadata->>'size', '')::bigint
  into v_storage_object_id, v_storage_size
  from storage.objects obj
  where obj.bucket_id = v_row.final_bucket
    and obj.name = v_row.final_path;

  if v_storage_object_id::text is distinct from v_row.verified_metadata->>'storageObjectId'
     or v_storage_size is distinct from (v_row.verified_metadata->>'publishedSize')::bigint then
    return null;
  end if;

  select *
  into v_receipt
  from public.studio2_operation_receipts
  where operation_id = v_operation_id
    and command = 'media.finalize'
    and status = 'succeeded';

  if v_receipt.operation_id is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', p_token_id,
    'status', v_row.status,
    'operationId', v_operation_id,
    'bucket', v_row.final_bucket,
    'path', v_row.final_path,
    'detectedMime', v_row.detected_mime,
    'metadata', v_row.verified_metadata,
    'receiptResult', v_receipt.result
  );
end
$readback$;

revoke all on function public.v3_read_media_finalization_receipt(uuid,text,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.v3_read_media_finalization_receipt(uuid,text,uuid,uuid)
  to service_role;

-- Preparation and finalization remain owner-executed canonical commands.
revoke insert,update,delete,truncate,references,trigger,maintain on public.studio2_upload_authorizations from public,anon,authenticated,service_role;
do $columns$ declare cols text;actor text;begin
 select string_agg(quote_ident(attname),',' order by attnum) into cols from pg_attribute where attrelid='public.studio2_upload_authorizations'::regclass and attnum>0 and not attisdropped;
 execute format('revoke insert(%1$s),update(%1$s),references(%1$s) on public.studio2_upload_authorizations from public,anon,authenticated,service_role',cols);
 foreach actor in array array['anon','authenticated','service_role']loop
  if has_table_privilege(actor,'public.studio2_upload_authorizations','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')or has_any_column_privilege(actor,'public.studio2_upload_authorizations','INSERT,UPDATE,REFERENCES')then
   raise exception 'Inherited media table writer remains: %',actor using errcode='42501';end if;
 end loop;
end $columns$;

-- Retire the superseded token/finalization API surface, retaining historical
-- rows and owner implementation. The new finalizer does not delegate to it.
do $legacy$ declare identity text;actor text;begin
 foreach identity in array array['public.studio2_create_country_media_upload(uuid,text,text,text,bigint)','public.studio2_finalize_country_media_upload(uuid)']loop
  if to_regprocedure(identity) is not null then
   execute 'revoke all on function '||identity||' from public,anon,authenticated,service_role';
   foreach actor in array array['anon','authenticated','service_role']loop
    if has_function_privilege(actor,to_regprocedure(identity),'EXECUTE')then raise exception 'Legacy Media API authority remains' using errcode='42501';end if;
   end loop;
  end if;
 end loop;
end $legacy$;
-- Storage policies belong to supabase_storage_admin. Its separately reviewed
-- owner-only cutover must run under that owner; postgres has no SET ROLE path.
notify pgrst, 'reload schema';
commit;
