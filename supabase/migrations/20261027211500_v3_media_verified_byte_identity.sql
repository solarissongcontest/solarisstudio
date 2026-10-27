begin;

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

  if v_row.actor_id is not null and not exists (
    select 1
    from auth.sessions
    where id = p_actor_session_id
      and user_id = v_row.actor_id
      and (not_after is null or not_after > now())
  ) then
    raise exception 'SESSION_REVOKED' using errcode = '42501';
  end if;

  if p_status is null
     or p_status not in ('verified', 'rejected', 'expired')
     or jsonb_typeof(v_metadata) is distinct from 'object' then
    raise exception 'VALIDATION: invalid finalization outcome' using errcode = '22023';
  end if;

  if p_status = 'verified' then
    if v_row.expires_at <= now()
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
    return null;
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

-- The service role remains an operational credential only. It can execute the
-- two governed media commands above, but cannot mutate canonical upload state.
revoke insert, update, delete, truncate on public.studio2_upload_authorizations
  from service_role;

notify pgrst, 'reload schema';
commit;
