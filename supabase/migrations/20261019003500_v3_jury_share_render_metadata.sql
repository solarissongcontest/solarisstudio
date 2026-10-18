begin;

-- System V3 / Jury Share Cards (JSC-4): deterministic, service-owned render
-- metadata and cache coordination. Image bytes are never stored in Postgres.
-- Every claim re-resolves the canonical Jury Share projection so withdrawn or
-- corrected publication state cannot be bypassed by an old render key.

create table if not exists private.v3_jury_share_render_cache (
  render_key text primary key
    check (render_key ~ '^[0-9a-f]{64}$'),
  show_id uuid not null,
  edition_id uuid not null,
  voter_country_id uuid not null references public.countries(id) on delete cascade,
  ballot_id uuid not null references public.jury_ballot_submissions(id) on delete cascade,
  result_version bigint not null check (result_version > 0),
  projection_state_version text not null
    check (projection_state_version ~ '^[0-9a-f]{64}$'),
  source_identity_version text not null
    check (source_identity_version ~ '^[0-9a-f]{64}$'),
  recipient_identity_version_set_hash text not null
    check (recipient_identity_version_set_hash ~ '^[0-9a-f]{64}$'),
  theme_id text not null
    check (theme_id in ('default', 'edition', 'liquid_glass')),
  theme_version integer not null check (theme_version >= 1),
  output_target text not null check (output_target = 'story'),
  format text not null check (format in ('png', 'jpeg')),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg')),
  width integer not null default 1080 check (width = 1080),
  height integer not null default 1920 check (height = 1920),
  visibility text not null check (visibility in ('public', 'private')),
  status text not null check (status in ('pending', 'ready', 'failed')),
  expected_storage_path text not null
    check (length(expected_storage_path) between 1 and 512)
    check (expected_storage_path !~ '(^|/)\.\.(/|$)')
    check (expected_storage_path !~* '^[a-z][a-z0-9+.-]*://'),
  storage_path text
    check (storage_path is null or length(storage_path) between 1 and 512)
    check (storage_path is null or storage_path !~ '(^|/)\.\.(/|$)')
    check (storage_path is null or storage_path !~* '^[a-z][a-z0-9+.-]*://'),
  byte_size bigint check (byte_size is null or byte_size between 1 and 15728640),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0 check (attempt_count between 0 and 8),
  failure_code text check (failure_code is null or failure_code ~ '^[A-Z0-9_]{1,80}$'),
  expires_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v3_jury_share_render_show_edition_fk
    foreign key (show_id, edition_id)
    references public.shows(id, edition_id)
    on delete cascade,
  constraint v3_jury_share_render_result_version_fk
    foreign key (show_id, result_version)
    references private.v3_result_versions(show_id, version)
    deferrable initially deferred,
  constraint v3_jury_share_render_visibility_expiry_check check (
    (visibility = 'public' and expires_at is null)
    or (visibility = 'private' and expires_at is not null)
  ),
  constraint v3_jury_share_render_ready_payload_check check (
    status <> 'ready'
    or (storage_path is not null and byte_size is not null and completed_at is not null)
  )
);

create index if not exists v3_jury_share_render_cache_lookup_idx
  on private.v3_jury_share_render_cache(show_id, voter_country_id, created_at desc);
create index if not exists v3_jury_share_render_cache_expiry_idx
  on private.v3_jury_share_render_cache(expires_at)
  where expires_at is not null;

alter table private.v3_jury_share_render_cache enable row level security;
revoke all on table private.v3_jury_share_render_cache
  from public, anon, authenticated;
grant select, insert, update, delete on table private.v3_jury_share_render_cache
  to service_role;

comment on table private.v3_jury_share_render_cache is
  'Jury Share render coordination metadata only. Binary images live in storage; private/public delivery policy remains outside Postgres.';

create or replace function private.v3_jury_share_render_identity(
  p_show_id uuid,
  p_voter_country_id uuid,
  p_theme_id text,
  p_output_target text,
  p_format text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, extensions
as $identity$
declare
  v_theme_id text := lower(btrim(coalesce(p_theme_id, '')));
  v_target text := lower(btrim(coalesce(p_output_target, '')));
  v_format text := lower(btrim(coalesce(p_format, '')));
  v_envelope jsonb;
  v_projection jsonb;
  v_theme jsonb;
  v_theme_version integer;
  v_recipient_identity_hash text;
  v_identity jsonb;
  v_render_key text;
  v_result_version bigint;
  v_visibility text;
begin
  if p_show_id is null or p_voter_country_id is null
     or v_theme_id not in ('default', 'edition', 'liquid_glass')
     or v_target <> 'story'
     or v_format not in ('png', 'jpeg') then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_FORMAT_UNSUPPORTED'
    );
  end if;

  -- This call is intentionally repeated for every claim/status/completion path.
  -- It revalidates current publication, ballot finality, result version and
  -- historical identity instead of trusting browser or stale cache metadata.
  v_envelope := public.v3_jury_share_projection(p_show_id, p_voter_country_id);
  if not coalesce((v_envelope ->> 'ok')::boolean, false) then
    return v_envelope;
  end if;

  v_projection := v_envelope -> 'projection';
  v_visibility := coalesce(v_envelope ->> 'visibility', 'private');

  if v_theme_id = 'default' then
    v_theme_version := 1;
    v_theme := jsonb_build_object(
      'id', 'default',
      'version', v_theme_version
    );
  elsif v_theme_id = 'edition' then
    v_theme := public.v3_jury_share_edition_theme(p_show_id);
    if not coalesce((v_theme ->> 'available')::boolean, false) then
      return jsonb_build_object(
        'ok', false,
        'errorCode', 'JURY_SHARE_THEME_UNAVAILABLE',
        'themeId', 'edition'
      );
    end if;
    v_theme_version := (v_theme ->> 'version')::integer;
  else
    -- Liquid Glass is deliberately not claimed until the renderer capability
    -- is implemented. Recognising the id here prevents callers from smuggling
    -- an arbitrary theme while still failing closed for unfinished JSC-9.
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_THEME_UNAVAILABLE',
      'themeId', 'liquid_glass'
    );
  end if;

  select encode(
    extensions.digest(
      convert_to(
        coalesce(string_agg(
          vote ->> 'identityVersion',
          '|' order by (vote ->> 'rank')::integer
        ), ''),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  into v_recipient_identity_hash
  from jsonb_array_elements(v_projection -> 'votes') vote;

  if v_recipient_identity_hash is null
     or v_recipient_identity_hash !~ '^[0-9a-f]{64}$'
     or coalesce(v_projection #>> '{source,identityVersion}', '') !~ '^[0-9a-f]{64}$'
     or coalesce(v_projection ->> 'stateVersion', '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_RENDER_FAILED'
    );
  end if;

  begin
    v_result_version := split_part(
      v_projection #>> '{result,resultVersionId}', ':', 2
    )::bigint;
  exception when others then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_RENDER_FAILED'
    );
  end;

  if v_result_version < 1 then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_RENDER_FAILED'
    );
  end if;

  v_identity := jsonb_build_object(
    'ballotId', v_projection ->> 'ballotId',
    'resultVersionId', v_projection #>> '{result,resultVersionId}',
    'sourceIdentityVersion', v_projection #>> '{source,identityVersion}',
    'recipientIdentityVersionSetHash', v_recipient_identity_hash,
    'themeId', v_theme_id,
    'themeVersion', v_theme_version,
    'outputTarget', v_target,
    'format', v_format
  );

  v_render_key := encode(
    extensions.digest(convert_to(v_identity::text, 'UTF8'), 'sha256'),
    'hex'
  );

  return jsonb_build_object(
    'ok', true,
    'renderKey', v_render_key,
    'identity', v_identity,
    'projection', v_projection,
    'projectionStateVersion', v_projection ->> 'stateVersion',
    'recipientIdentityVersionSetHash', v_recipient_identity_hash,
    'resultVersion', v_result_version,
    'visibility', v_visibility,
    'theme', v_theme,
    'mimeType', case when v_format = 'png' then 'image/png' else 'image/jpeg' end,
    'width', 1080,
    'height', 1920
  );
end
$identity$;

revoke all on function private.v3_jury_share_render_identity(
  uuid, uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function private.v3_jury_share_render_identity(
  uuid, uuid, text, text, text
) to service_role;

create or replace function public.v3_claim_jury_share_render(
  p_show_id uuid,
  p_voter_country_id uuid,
  p_theme_id text,
  p_output_target text,
  p_format text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $claim$
declare
  v_identity jsonb;
  v_projection jsonb;
  v_render_key text;
  v_visibility text;
  v_format text := lower(btrim(coalesce(p_format, '')));
  v_row private.v3_jury_share_render_cache%rowtype;
  v_lease uuid;
  v_now timestamptz := now();
  v_expires timestamptz;
  v_storage_path text;
begin
  if not private.studio2_request_is_service_role() then
    raise exception using errcode = '42501', message = 'JURY_SHARE_NOT_AUTHORIZED';
  end if;

  v_identity := private.v3_jury_share_render_identity(
    p_show_id,
    p_voter_country_id,
    p_theme_id,
    p_output_target,
    p_format
  );
  if not coalesce((v_identity ->> 'ok')::boolean, false) then
    raise exception using errcode = '25006',
      message = coalesce(v_identity ->> 'errorCode', 'JURY_SHARE_RENDER_FAILED');
  end if;

  v_projection := v_identity -> 'projection';
  v_render_key := v_identity ->> 'renderKey';
  v_visibility := v_identity ->> 'visibility';
  v_expires := case
    when v_visibility = 'private' then v_now + interval '15 minutes'
    else null
  end;
  v_storage_path := 'jury-share/' || v_visibility || '/' || v_render_key
    || case when v_format = 'png' then '.png' else '.jpg' end;

  perform pg_advisory_xact_lock(
    hashtextextended('jury-share-render:' || v_render_key, 0)
  );

  select cache.* into v_row
  from private.v3_jury_share_render_cache cache
  where cache.render_key = v_render_key
  for update;

  if v_row.render_key is not null
     and v_row.status = 'ready'
     and (v_row.expires_at is null or v_row.expires_at > v_now) then
    return jsonb_build_object(
      'ok', true,
      'renderKey', v_render_key,
      'status', 'ready',
      'cacheHit', true,
      'leaseAcquired', false,
      'visibility', v_row.visibility,
      'storagePath', v_row.storage_path,
      'expiresAt', v_row.expires_at,
      'mimeType', v_row.mime_type,
      'width', v_row.width,
      'height', v_row.height
    );
  end if;

  if v_row.render_key is not null
     and v_row.status = 'pending'
     and v_row.lease_expires_at is not null
     and v_row.lease_expires_at > v_now then
    return jsonb_build_object(
      'ok', true,
      'renderKey', v_render_key,
      'status', 'pending',
      'cacheHit', false,
      'leaseAcquired', false,
      'retryAfterSeconds', greatest(
        1,
        ceil(extract(epoch from (v_row.lease_expires_at - v_now)))::integer
      )
    );
  end if;

  if coalesce(v_row.attempt_count, 0) >= 8 then
    raise exception using errcode = 'P0001', message = 'JURY_SHARE_RENDER_RETRY_LIMIT';
  end if;

  v_lease := gen_random_uuid();

  insert into private.v3_jury_share_render_cache (
    render_key,
    show_id,
    edition_id,
    voter_country_id,
    ballot_id,
    result_version,
    projection_state_version,
    source_identity_version,
    recipient_identity_version_set_hash,
    theme_id,
    theme_version,
    output_target,
    format,
    mime_type,
    width,
    height,
    visibility,
    status,
    expected_storage_path,
    storage_path,
    byte_size,
    lease_token,
    lease_expires_at,
    attempt_count,
    failure_code,
    expires_at,
    completed_at,
    created_at,
    updated_at
  ) values (
    v_render_key,
    p_show_id,
    (v_projection #>> '{edition,id}')::uuid,
    p_voter_country_id,
    (v_projection ->> 'ballotId')::uuid,
    (v_identity ->> 'resultVersion')::bigint,
    v_identity ->> 'projectionStateVersion',
    v_projection #>> '{source,identityVersion}',
    v_identity ->> 'recipientIdentityVersionSetHash',
    lower(btrim(p_theme_id)),
    (v_identity #>> '{identity,themeVersion}')::integer,
    lower(btrim(p_output_target)),
    v_format,
    v_identity ->> 'mimeType',
    1080,
    1920,
    v_visibility,
    'pending',
    v_storage_path,
    null,
    null,
    v_lease,
    v_now + interval '2 minutes',
    1,
    null,
    v_expires,
    null,
    v_now,
    v_now
  )
  on conflict (render_key) do update
  set projection_state_version = excluded.projection_state_version,
      expected_storage_path = excluded.expected_storage_path,
      storage_path = null,
      byte_size = null,
      visibility = excluded.visibility,
      status = 'pending',
      lease_token = excluded.lease_token,
      lease_expires_at = excluded.lease_expires_at,
      attempt_count = private.v3_jury_share_render_cache.attempt_count + 1,
      failure_code = null,
      expires_at = excluded.expires_at,
      completed_at = null,
      updated_at = v_now
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'renderKey', v_render_key,
    'status', 'pending',
    'cacheHit', false,
    'leaseAcquired', true,
    'leaseToken', v_lease,
    'leaseExpiresAt', v_row.lease_expires_at,
    'expectedStoragePath', v_row.expected_storage_path,
    'visibility', v_row.visibility,
    'expiresAt', v_row.expires_at,
    'mimeType', v_row.mime_type,
    'width', v_row.width,
    'height', v_row.height,
    'theme', v_identity -> 'theme',
    'projection', v_projection
  );
end
$claim$;

revoke all on function public.v3_claim_jury_share_render(
  uuid, uuid, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.v3_claim_jury_share_render(
  uuid, uuid, text, text, text
) to service_role;

create or replace function public.v3_complete_jury_share_render(
  p_render_key text,
  p_lease_token uuid,
  p_success boolean,
  p_storage_path text default null,
  p_byte_size bigint default null,
  p_failure_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $complete$
declare
  v_row private.v3_jury_share_render_cache%rowtype;
  v_identity jsonb;
  v_now timestamptz := now();
  v_failure text := upper(btrim(coalesce(p_failure_code, 'JURY_SHARE_RENDER_FAILED')));
begin
  if not private.studio2_request_is_service_role() then
    raise exception using errcode = '42501', message = 'JURY_SHARE_NOT_AUTHORIZED';
  end if;
  if coalesce(p_render_key, '') !~ '^[0-9a-f]{64}$'
     or p_lease_token is null
     or p_success is null then
    raise exception using errcode = '22023', message = 'JURY_SHARE_RENDER_INVALID_COMPLETION';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('jury-share-render:' || p_render_key, 0)
  );

  select cache.* into v_row
  from private.v3_jury_share_render_cache cache
  where cache.render_key = p_render_key
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'JURY_SHARE_RENDER_NOT_FOUND';
  end if;

  -- Lost-response replay of a successful completion is idempotent for the same
  -- lease and exact object metadata.
  if v_row.status = 'ready' then
    if v_row.lease_token = p_lease_token
       and p_success
       and p_storage_path is not distinct from v_row.storage_path
       and p_byte_size is not distinct from v_row.byte_size then
      return jsonb_build_object(
        'ok', true,
        'renderKey', p_render_key,
        'status', 'ready',
        'replayed', true,
        'storagePath', v_row.storage_path,
        'expiresAt', v_row.expires_at
      );
    end if;
    raise exception using errcode = 'PT409', message = 'JURY_SHARE_RENDER_LEASE_CONFLICT';
  end if;

  if v_row.status = 'failed' then
    if v_row.lease_token = p_lease_token
       and not p_success
       and v_failure is not distinct from v_row.failure_code then
      return jsonb_build_object(
        'ok', false,
        'renderKey', p_render_key,
        'status', 'failed',
        'replayed', true,
        'failureCode', v_row.failure_code
      );
    end if;
    raise exception using errcode = 'PT409', message = 'JURY_SHARE_RENDER_LEASE_CONFLICT';
  end if;

  if v_row.lease_token is distinct from p_lease_token
     or v_row.lease_expires_at is null
     or v_row.lease_expires_at <= v_now then
    raise exception using errcode = 'PT409', message = 'JURY_SHARE_RENDER_LEASE_CONFLICT';
  end if;

  if not p_success then
    if v_failure !~ '^[A-Z0-9_]{1,80}$' then
      raise exception using errcode = '22023', message = 'JURY_SHARE_RENDER_INVALID_FAILURE';
    end if;
    update private.v3_jury_share_render_cache
    set status = 'failed',
        failure_code = v_failure,
        storage_path = null,
        byte_size = null,
        completed_at = v_now,
        updated_at = v_now
    where render_key = p_render_key
    returning * into v_row;

    return jsonb_build_object(
      'ok', false,
      'renderKey', p_render_key,
      'status', 'failed',
      'replayed', false,
      'failureCode', v_row.failure_code
    );
  end if;

  if p_storage_path is distinct from v_row.expected_storage_path
     or p_byte_size is null
     or p_byte_size not between 1 and 15728640 then
    raise exception using errcode = '22023', message = 'JURY_SHARE_RENDER_INVALID_OUTPUT';
  end if;

  -- Publication/result/theme state may have changed while the image rendered.
  -- Rebuild the identity immediately before exposing the completed artifact.
  v_identity := private.v3_jury_share_render_identity(
    v_row.show_id,
    v_row.voter_country_id,
    v_row.theme_id,
    v_row.output_target,
    v_row.format
  );
  if not coalesce((v_identity ->> 'ok')::boolean, false) then
    raise exception using errcode = '25006',
      message = coalesce(v_identity ->> 'errorCode', 'JURY_SHARE_RENDER_FAILED');
  end if;
  if v_identity ->> 'renderKey' is distinct from p_render_key then
    raise exception using errcode = 'PT409', message = 'JURY_SHARE_RESULT_CHANGED';
  end if;

  update private.v3_jury_share_render_cache
  set status = 'ready',
      storage_path = p_storage_path,
      byte_size = p_byte_size,
      failure_code = null,
      completed_at = v_now,
      updated_at = v_now
  where render_key = p_render_key
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'renderKey', p_render_key,
    'status', 'ready',
    'replayed', false,
    'storagePath', v_row.storage_path,
    'visibility', v_row.visibility,
    'expiresAt', v_row.expires_at,
    'mimeType', v_row.mime_type,
    'byteSize', v_row.byte_size
  );
end
$complete$;

revoke all on function public.v3_complete_jury_share_render(
  text, uuid, boolean, text, bigint, text
) from public, anon, authenticated, service_role;
grant execute on function public.v3_complete_jury_share_render(
  text, uuid, boolean, text, bigint, text
) to service_role;

create or replace function public.v3_jury_share_render_status(p_render_key text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $status$
declare
  v_row private.v3_jury_share_render_cache%rowtype;
  v_identity jsonb;
  v_now timestamptz := now();
begin
  if not private.studio2_request_is_service_role() then
    raise exception using errcode = '42501', message = 'JURY_SHARE_NOT_AUTHORIZED';
  end if;
  if coalesce(p_render_key, '') !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'JURY_SHARE_RENDER_INVALID_KEY';
  end if;

  select cache.* into v_row
  from private.v3_jury_share_render_cache cache
  where cache.render_key = p_render_key;
  if not found then
    return jsonb_build_object('ok', false, 'status', 'missing');
  end if;

  if v_row.expires_at is not null and v_row.expires_at <= v_now then
    return jsonb_build_object(
      'ok', false,
      'renderKey', p_render_key,
      'status', 'expired'
    );
  end if;

  if v_row.status = 'ready' then
    v_identity := private.v3_jury_share_render_identity(
      v_row.show_id,
      v_row.voter_country_id,
      v_row.theme_id,
      v_row.output_target,
      v_row.format
    );
    if not coalesce((v_identity ->> 'ok')::boolean, false)
       or v_identity ->> 'renderKey' is distinct from p_render_key then
      return jsonb_build_object(
        'ok', false,
        'renderKey', p_render_key,
        'status', 'stale'
      );
    end if;
  end if;

  return jsonb_build_object(
    'ok', v_row.status = 'ready',
    'renderKey', p_render_key,
    'status', v_row.status,
    'storagePath', case when v_row.status = 'ready' then v_row.storage_path else null end,
    'visibility', v_row.visibility,
    'expiresAt', v_row.expires_at,
    'mimeType', v_row.mime_type,
    'width', v_row.width,
    'height', v_row.height,
    'failureCode', v_row.failure_code
  );
end
$status$;

revoke all on function public.v3_jury_share_render_status(text)
  from public, anon, authenticated, service_role;
grant execute on function public.v3_jury_share_render_status(text)
  to service_role;

notify pgrst, 'reload schema';

commit;
