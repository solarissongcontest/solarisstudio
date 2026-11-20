begin;

-- P14 follow-up: the verified upload token is already the stable identity for
-- one logical Entry-media commit. Bind that token to the canonical S2 operation
-- ledger so a lost response, duplicate click or reconnect returns durable
-- receipt evidence rather than relying only on comparing the resulting URL.
select set_config('request.jwt.claim.role', 'service_role', true);
select public.v3_register_migration_contract(
  'v3.public.p14-entry-media-commit-receipt',
  1,
  'forward_fix_only',
  false,
  null,
  'Add S2 idempotency, receipt and reconciliation semantics to the participant Entry-media canonical commit.'
);
select set_config('request.jwt.claim.role', '', true);

create or replace function public.v3_commit_entry_media_upload(
  p_token_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $commit$
declare
  v_actor uuid := auth.uid();
  v_authorization public.studio2_upload_authorizations%rowtype;
  v_entry public.entries%rowtype;
  v_asset_type text;
  v_asset_key text;
  v_expected_source text;
  v_current_source text;
  v_public_base text;
  v_public_url text;
  v_metadata jsonb;
  v_scope jsonb;
  v_request jsonb;
  v_claim jsonb;
  v_result jsonb;
  v_updated_at timestamptz;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_token_id is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('v3-entry-media:' || p_token_id::text, 0)
  );

  select upload_auth.*
  into v_authorization
  from public.studio2_upload_authorizations upload_auth
  where upload_auth.id = p_token_id
    and upload_auth.actor_id = v_actor
    and upload_auth.context ->> 'purpose' = 'entry_media'
  for update;

  -- Do not reveal whether another actor owns a token.
  if v_authorization.id is null then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_asset_type := lower(btrim(coalesce(v_authorization.context ->> 'assetType', '')));
  v_asset_key := nullif(btrim(coalesce(v_authorization.context ->> 'assetKey', '')), '');
  if v_authorization.domain <> 'country_media'
     or v_authorization.final_bucket <> 'country-media'
     or v_authorization.entity_id is null
     or v_authorization.scope is distinct from v_asset_type
     or v_asset_key is null
     or not private.v3_entry_media_supported_asset_type(v_asset_type) then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;

  if v_authorization.status <> 'verified' then
    raise exception using
      errcode = '23514',
      message = 'STATE_CHANGED',
      hint = case
        when v_authorization.status = 'rejected' then 'upload_rejected'
        when v_authorization.status = 'expired' then 'upload_expired'
        else 'upload_not_verified'
      end;
  end if;

  select entry.*
  into v_entry
  from public.entries entry
  where entry.id = v_authorization.entity_id
    and entry.edition_id::text = v_authorization.context ->> 'editionId'
    and entry.country_id::text = v_authorization.context ->> 'countryId'
  for update;

  if v_entry.id is null
     or not private.v3_next_in_line_actor_controls_country(
       v_actor,
       v_entry.edition_id,
       v_entry.country_id
     ) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  if v_entry.status in ('withdrawn', 'disqualified') then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;

  v_public_base := nullif(btrim(coalesce(
    v_authorization.context ->> 'storagePublicBase',
    ''
  )), '');
  if v_public_base is null
     or v_public_base !~* '^https?://[^[:space:]]+/storage/v1/object/public$' then
    raise exception using errcode = '23514', message = 'STATE_CHANGED';
  end if;

  v_public_url := v_public_base || '/' ||
    v_authorization.final_bucket || '/' || v_authorization.final_path;
  v_expected_source := nullif(
    btrim(coalesce(v_authorization.context ->> 'expectedSourceFingerprint', '')),
    ''
  );
  v_current_source := private.studio2_resolve_media_asset_source(
    v_entry.edition_id,
    v_asset_key,
    v_asset_type,
    v_entry.country_id,
    v_entry.id
  );

  -- Claim before authoritative Entry mutation. The upload token is a random UUID
  -- minted once by the server for this logical asset authorization, so it is a
  -- stable operation identity across duplicate commit calls and lost responses.
  v_scope := jsonb_build_object(
    'editionId', v_entry.edition_id,
    'countryId', v_entry.country_id,
    'entryId', v_entry.id,
    'assetType', v_asset_type,
    'assetKey', v_asset_key
  );
  v_request := jsonb_build_object(
    'tokenId', p_token_id,
    'expectedSourceFingerprint', v_expected_source,
    'verifiedSourceFingerprint', v_public_url
  );

  v_claim := private.studio2_claim_operation(
    p_token_id,
    'entry-media-commit:' || p_token_id::text,
    p_token_id,
    'entry.media.commit',
    'R2',
    v_scope,
    v_request
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return coalesce(v_claim -> 'result', '{}'::jsonb)
        || jsonb_build_object('replayed', true);
    end if;

    -- A non-final replay is an uncertain result, never permission to perform a
    -- second blind mutation. Return the actor-scoped canonical operation view.
    return public.studio2_reconcile_operation(p_token_id)
      || jsonb_build_object('replayed', true, 'reconciliationRequired', true);
  end if;

  if v_current_source is distinct from v_public_url then
    -- Per-slot optimistic concurrency. A token authorized against source A may
    -- not overwrite source B after another device or authorized user changes it.
    if v_current_source is distinct from v_expected_source then
      raise exception using
        errcode = '40001',
        message = 'STATE_CHANGED',
        hint = 'Entry media changed after this upload was authorized.';
    end if;

    v_metadata := coalesce(v_entry.metadata, '{}'::jsonb);

    if v_asset_type = 'artist_photo' then
      v_metadata :=
        v_metadata
        - 'artistPhotoUrl'
        - 'artist_image_url'
        - 'artistImageUrl'
        - 'artistPhotoProcessing'
        || jsonb_build_object(
          'artist_photo_url', v_public_url,
          'artist_photo_processing', false
        );
    elsif v_asset_type = 'cover_artwork' then
      v_metadata :=
        v_metadata
        - 'coverArtworkUrl'
        - 'artwork_url'
        - 'artworkUrl'
        - 'coverArtworkProcessing'
        || jsonb_build_object(
          'cover_artwork_url', v_public_url,
          'cover_artwork_processing', false
        );
    else
      raise exception using errcode = '22023', message = 'VALIDATION';
    end if;

    update public.entries
    set
      metadata = v_metadata,
      updated_at = clock_timestamp()
    where id = v_entry.id;

    -- The existing S3 Entry-media review invariant supersedes any active review
    -- whose exact source fingerprint no longer matches this canonical source.
  end if;

  v_updated_at := clock_timestamp();
  v_result := jsonb_build_object(
    'ok', true,
    'replayed', false,
    'operationId', p_token_id,
    'receiptId', p_token_id,
    'tokenId', v_authorization.id,
    'editionId', v_entry.edition_id,
    'countryId', v_entry.country_id,
    'entryId', v_entry.id,
    'assetKey', v_asset_key,
    'assetType', v_asset_type,
    'state', 'validating',
    'stateVersion', v_public_url,
    'sourceFingerprint', v_public_url,
    'updatedAt', v_updated_at,
    'serverTime', v_updated_at
  );

  perform private.studio2_complete_operation(p_token_id, v_result);
  return v_result;
end
$commit$;

revoke all on function public.v3_commit_entry_media_upload(uuid)
  from public, anon;
grant execute on function public.v3_commit_entry_media_upload(uuid)
  to authenticated;

comment on function public.v3_commit_entry_media_upload(uuid) is
  'Participant Entry-media canonical commit. Exact verified token, delegation scope, per-slot CAS, S2 semantic idempotency, durable receipt and uncertain-result reconciliation.';

notify pgrst, 'reload schema';

commit;