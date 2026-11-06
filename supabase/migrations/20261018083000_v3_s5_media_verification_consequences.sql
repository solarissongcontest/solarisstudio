begin;

-- System V3 S5 Media verification consequences.
--
-- The unified upload finalizer is already the byte-verification authority. It
-- publishes verified bytes first and only then commits the durable authorization
-- transition prepared -> verified. Observe that committed completion boundary;
-- do not create a second uploader, verifier or asset store.
--
-- The shared quarantine also serves beta feedback and integrity evidence. Those
-- domains deliberately do not become Media facts merely because they reuse the
-- same byte-safety infrastructure.

create or replace function private.v3_media_verification_operation_id(
  p_authorization_id uuid,
  p_actor_id uuid,
  p_domain text,
  p_entity_id uuid,
  p_scope text,
  p_final_bucket text,
  p_final_path text,
  p_detected_mime text
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $identity$
declare
  v_fingerprint text;
begin
  if p_authorization_id is null
     or p_actor_id is null
     or p_domain not in ('country_media', 'edition_artwork', 'country_font')
     or p_entity_id is null
     or nullif(btrim(coalesce(p_final_bucket, '')), '') is null
     or nullif(btrim(coalesce(p_final_path, '')), '') is null
     or nullif(btrim(coalesce(p_detected_mime, '')), '') is null then
    raise exception 'Media verification operation identity is incomplete'
      using errcode = '22023';
  end if;

  v_fingerprint := private.studio2_request_fingerprint(
    'media.finalize_upload',
    'R1',
    jsonb_strip_nulls(jsonb_build_object(
      'domain', p_domain,
      'entityId', p_entity_id,
      'scope', nullif(btrim(coalesce(p_scope, '')), '')
    )),
    jsonb_build_object(
      'authorizationId', p_authorization_id,
      'finalBucket', p_final_bucket,
      'finalPath', p_final_path,
      'detectedMime', p_detected_mime
    )
  );

  return (
    substr(v_fingerprint, 1, 8) || '-' ||
    substr(v_fingerprint, 9, 4) || '-' ||
    substr(v_fingerprint, 13, 4) || '-' ||
    substr(v_fingerprint, 17, 4) || '-' ||
    substr(v_fingerprint, 21, 12)
  )::uuid;
end
$identity$;

revoke all on function private.v3_media_verification_operation_id(
  uuid, uuid, text, uuid, text, text, text, text
) from public, anon, authenticated;

create or replace function private.v3_emit_media_verification_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_operation_id uuid;
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_edition_id uuid;
  v_receipt public.studio2_operation_receipts%rowtype;
begin
  if old.status = 'verified' or new.status <> 'verified' then
    return new;
  end if;

  -- The quarantine pipeline is cross-domain. Only public Media asset classes
  -- become media.verified facts. Beta feedback and integrity evidence retain
  -- their own domain semantics.
  if new.domain not in ('country_media', 'edition_artwork', 'country_font') then
    return new;
  end if;

  -- These three prepare paths are authenticated by construction. Failing closed
  -- here catches a bypassed/hand-written authorization instead of inventing an
  -- actor for an audit fact.
  if new.actor_id is null then
    raise exception 'Verified Media upload lacks its authenticated actor'
      using errcode = '23514';
  end if;
  if new.entity_id is null then
    raise exception 'Verified Media upload lacks its canonical entity scope'
      using errcode = '23514';
  end if;
  if new.finalized_at is null
     or nullif(btrim(coalesce(new.detected_mime, '')), '') is null
     or jsonb_typeof(new.verified_metadata) is distinct from 'object'
     or coalesce((new.verified_metadata ->> 'signatureVerified')::boolean, false) is not true
     or coalesce((new.verified_metadata ->> 'quarantineVerified')::boolean, false) is not true
     or new.verified_metadata ->> 'publicationDecision' is distinct from 'published_after_verification' then
    raise exception 'Verified Media upload lacks completed verification evidence'
      using errcode = '23514';
  end if;

  if new.domain = 'edition_artwork' then
    if not exists (
      select 1 from public.editions edition where edition.id = new.entity_id
    ) then
      raise exception 'Verified edition artwork references an unknown edition'
        using errcode = '23503';
    end if;
    v_edition_id := new.entity_id;
  elsif not exists (
    select 1 from public.countries country where country.id = new.entity_id
  ) then
    raise exception 'Verified country Media upload references an unknown country'
      using errcode = '23503';
  end if;

  v_scope := jsonb_strip_nulls(jsonb_build_object(
    'domain', new.domain,
    'entityId', new.entity_id,
    'scope', nullif(btrim(coalesce(new.scope, '')), '')
  ));
  v_request := jsonb_build_object(
    'authorizationId', new.id,
    'finalBucket', new.final_bucket,
    'finalPath', new.final_path,
    'detectedMime', new.detected_mime
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'media.finalize_upload',
    'R1',
    v_scope,
    v_request
  );
  v_operation_id := private.v3_media_verification_operation_id(
    new.id,
    new.actor_id,
    new.domain,
    new.entity_id,
    new.scope,
    new.final_bucket,
    new.final_path,
    new.detected_mime
  );

  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope,
    status,
    result,
    completed_at
  ) values (
    v_operation_id,
    new.actor_id,
    v_operation_id::text,
    v_operation_id,
    v_fingerprint,
    'media.finalize_upload',
    'R1',
    v_scope,
    'succeeded',
    jsonb_build_object(
      'ok', true,
      'authorizationId', new.id,
      'domain', new.domain,
      'entityId', new.entity_id,
      'scope', new.scope,
      'bucket', new.final_bucket,
      'objectPath', new.final_path,
      'detectedMime', new.detected_mime,
      'finalizedAt', new.finalized_at
    ),
    new.finalized_at
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from new.actor_id
     or v_receipt.command is distinct from 'media.finalize_upload'
     or v_receipt.risk_class is distinct from 'R1'
     or v_receipt.idempotency_key is distinct from v_operation_id::text
     or v_receipt.correlation_id is distinct from v_operation_id
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope
     or v_receipt.status <> 'succeeded' then
    raise exception 'IDEMPOTENCY_CONFLICT: Media verification identity has different semantics'
      using errcode = '23505';
  end if;

  perform private.v3_emit_domain_event(
    'media.verified',
    'media_asset',
    new.id::text,
    1,
    v_operation_id,
    v_edition_id,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'authorizationId', new.id,
      'domain', new.domain,
      'entityId', new.entity_id,
      'scope', new.scope,
      'bucket', new.final_bucket,
      'objectPath', new.final_path,
      'detectedMime', new.detected_mime,
      'processing', new.verified_metadata ->> 'processing',
      'finalizedAt', new.finalized_at
    )),
    1,
    array[]::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_media_verification_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_media_verification_event
  on public.studio2_upload_authorizations;
create trigger v3_emit_media_verification_event
after update of status
on public.studio2_upload_authorizations
for each row
when (old.status is distinct from new.status and new.status = 'verified')
execute function private.v3_emit_media_verification_event();

comment on function private.v3_emit_media_verification_event() is
  'Emits one media.verified fact after the unified finalizer durably records a verified public Media upload. Cross-domain quarantine users are intentionally excluded.';

commit;
