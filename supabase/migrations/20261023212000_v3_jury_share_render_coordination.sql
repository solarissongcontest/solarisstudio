begin;

-- Solaris Studio V3 / Jury Share Cards JSC-4.
-- Deterministic, service-owned render identity/cache coordination.
-- Image bytes never live in Postgres. Every reusable artifact is bound to the
-- exact canonical projection, publication visibility and validated theme recipe.

select public.v3_register_migration_contract(
  'v3.results.jury-share-render-coordination-v1',
  1,
  'forward_fix_only',
  false,
  null,
  'Add bounded service-only Jury Share render coordination, deterministic cache identity and retry/lease limits without backfilling render artifacts.'
);

create table private.v3_jury_share_render_cache (
  render_key text primary key
    check (render_key ~ '^[0-9a-f]{64}$'),
  renderer_contract_version integer not null default 1
    check (renderer_contract_version = 1),
  show_id uuid not null,
  edition_id uuid not null,
  voter_country_id uuid not null references public.countries(id) on delete cascade,
  ballot_id uuid not null references public.jury_ballot_submissions(id) on delete cascade,
  result_version bigint not null check (result_version > 0),
  projection_state_version text not null
    check (projection_state_version ~ '^[0-9a-f]{64}$'),
  visibility text not null check (visibility in ('public', 'private')),
  source_identity_version text not null
    check (source_identity_version ~ '^[0-9a-f]{64}$'),
  recipient_identity_version_set_hash text not null
    check (recipient_identity_version_set_hash ~ '^[0-9a-f]{64}$'),
  theme_id text not null
    check (theme_id in ('default', 'edition', 'liquid_glass')),
  theme_version integer not null check (theme_version >= 1),
  theme_fingerprint text not null
    check (theme_fingerprint ~ '^[0-9a-f]{64}$'),
  theme_composition_hash text
    check (theme_composition_hash is null or theme_composition_hash ~ '^[0-9a-f]{64}$'),
  theme_validation_contract_version integer
    check (theme_validation_contract_version is null or theme_validation_contract_version >= 1),
  output_target text not null check (output_target = 'story'),
  format text not null check (format in ('png', 'jpeg')),
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg')),
  width integer not null default 1080 check (width = 1080),
  height integer not null default 1920 check (height = 1920),
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
  constraint v3_jury_share_render_theme_evidence_check check (
    (theme_id = 'edition'
      and theme_composition_hash is not null
      and theme_validation_contract_version is not null)
    or (theme_id <> 'edition'
      and theme_composition_hash is null
      and theme_validation_contract_version is null)
  ),
  constraint v3_jury_share_render_visibility_expiry_check check (
    (visibility = 'public' and expires_at is null)
    or (visibility = 'private' and expires_at is not null)
  ),
  constraint v3_jury_share_render_ready_payload_check check (
    status <> 'ready'
    or (storage_path is not null and byte_size is not null and completed_at is not null)
  )
);

create index v3_jury_share_render_cache_lookup_idx
  on private.v3_jury_share_render_cache(show_id, voter_country_id, created_at desc);
create index v3_jury_share_render_cache_expiry_idx
  on private.v3_jury_share_render_cache(expires_at)
  where expires_at is not null;
create index v3_jury_share_render_cache_active_idx
  on private.v3_jury_share_render_cache(show_id, voter_country_id, lease_expires_at)
  where status = 'pending';

alter table private.v3_jury_share_render_cache enable row level security;
revoke all on table private.v3_jury_share_render_cache
  from public, anon, authenticated;
grant select, insert, update, delete on table private.v3_jury_share_render_cache
  to service_role;

comment on table private.v3_jury_share_render_cache is
  'Jury Share render coordination metadata only. Binary images live in storage. Cache identity includes canonical publication visibility, projection state, renderer contract and exact theme evidence.';

create or replace function private.v3_guard_jury_share_render_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $guard$
begin
  if new.render_key is distinct from old.render_key
     or new.renderer_contract_version is distinct from old.renderer_contract_version
     or new.show_id is distinct from old.show_id
     or new.edition_id is distinct from old.edition_id
     or new.voter_country_id is distinct from old.voter_country_id
     or new.ballot_id is distinct from old.ballot_id
     or new.result_version is distinct from old.result_version
     or new.projection_state_version is distinct from old.projection_state_version
     or new.visibility is distinct from old.visibility
     or new.source_identity_version is distinct from old.source_identity_version
     or new.recipient_identity_version_set_hash is distinct from old.recipient_identity_version_set_hash
     or new.theme_id is distinct from old.theme_id
     or new.theme_version is distinct from old.theme_version
     or new.theme_fingerprint is distinct from old.theme_fingerprint
     or new.theme_composition_hash is distinct from old.theme_composition_hash
     or new.theme_validation_contract_version is distinct from old.theme_validation_contract_version
     or new.output_target is distinct from old.output_target
     or new.format is distinct from old.format
     or new.mime_type is distinct from old.mime_type
     or new.width is distinct from old.width
     or new.height is distinct from old.height
     or new.expected_storage_path is distinct from old.expected_storage_path then
    raise exception 'Jury Share render identity is immutable; claim a new render key'
      using errcode = '55000';
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_jury_share_render_identity()
  from public, anon, authenticated;

create trigger v3_guard_jury_share_render_identity
before update on private.v3_jury_share_render_cache
for each row execute function private.v3_guard_jury_share_render_identity();

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
  v_renderer_contract integer := 1;
  v_theme_id text := lower(btrim(coalesce(p_theme_id, '')));
  v_target text := lower(btrim(coalesce(p_output_target, '')));
  v_format text := lower(btrim(coalesce(p_format, '')));
  v_envelope jsonb;
  v_projection jsonb;
  v_theme jsonb;
  v_theme_version integer;
  v_theme_fingerprint text;
  v_theme_composition_hash text;
  v_theme_validation_contract integer;
  v_recipient_identity_hash text;
  v_projection_state_version text;
  v_source_identity_version text;
  v_visibility text;
  v_identity jsonb;
  v_render_key text;
  v_result_version bigint;
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

  -- Re-resolve canonical state for every claim/completion/status path.
  v_envelope := public.v3_jury_share_projection(p_show_id, p_voter_country_id);
  if not coalesce((v_envelope ->> 'ok')::boolean, false) then
    return v_envelope;
  end if;

  v_projection := v_envelope -> 'projection';
  v_visibility := coalesce(v_envelope ->> 'visibility', 'private');
  v_projection_state_version := v_projection ->> 'stateVersion';
  v_source_identity_version := v_projection #>> '{source,identityVersion}';

  if v_visibility not in ('public', 'private')
     or coalesce(v_projection_state_version, '') !~ '^[0-9a-f]{64}$'
     or coalesce(v_source_identity_version, '') !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object(
      'ok', false,
      'errorCode', 'JURY_SHARE_RENDER_FAILED'
    );
  end if;

  if v_theme_id = 'default' then
    v_theme_version := 1;
    v_theme_fingerprint := encode(
      extensions.digest(
        convert_to('default|1|renderer-contract|' || v_renderer_contract::text, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    v_theme := jsonb_build_object(
      'id', 'default',
      'version', v_theme_version,
      'fingerprint', v_theme_fingerprint
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

    begin
      v_theme_version := (v_theme ->> 'version')::integer;
      v_theme_validation_contract := (v_theme ->> 'renderValidationVersion')::integer;
    exception when others then
      return jsonb_build_object(
        'ok', false,
        'errorCode', 'JURY_SHARE_THEME_UNAVAILABLE',
        'themeId', 'edition'
      );
    end;
    v_theme_composition_hash := v_theme ->> 'compositionHash';

    if v_theme_version < 1
       or v_theme_validation_contract is distinct from 1
       or coalesce(v_theme_composition_hash, '') !~ '^[0-9a-f]{64}$' then
      return jsonb_build_object(
        'ok', false,
        'errorCode', 'JURY_SHARE_THEME_UNAVAILABLE',
        'themeId', 'edition'
      );
    end if;

    v_theme_fingerprint := encode(
      extensions.digest(
        convert_to(
          jsonb_build_object(
            'id', 'edition',
            'version', v_theme_version,
            'compositionHash', v_theme_composition_hash,
            'renderValidationVersion', v_theme_validation_contract,
            'rendererContractVersion', v_renderer_contract
          )::text,
          'UTF8'
        ),
        'sha256'
      ),
      'hex'
    );
  else
    -- Liquid Glass gets its own renderer version in JSC-9. Until then it is
    -- recognized but impossible to claim, preventing arbitrary theme input.
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

  if coalesce(v_recipient_identity_hash, '') !~ '^[0-9a-f]{64}$' then
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
    'rendererContractVersion', v_renderer_contract,
    'ballotId', v_projection ->> 'ballotId',
    'resultVersionId', v_projection #>> '{result,resultVersionId}',
    'projectionStateVersion', v_projection_state_version,
    'visibility', v_visibility,
    'sourceIdentityVersion', v_source_identity_version,
    'recipientIdentityVersionSetHash', v_recipient_identity_hash,
    'themeId', v_theme_id,
    'themeVersion', v_theme_version,
    'themeFingerprint', v_theme_fingerprint,
    'themeCompositionHash', v_theme_composition_hash,
    'themeValidationContractVersion', v_theme_validation_contract,
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
    'projectionStateVersion', v_projection_state_version,
    'recipientIdentityVersionSetHash', v_recipient_identity_hash,
    'resultVersion', v_result_version,
    'visibility', v_visibility,
    'theme', v_theme || jsonb_build_object('fingerprint', v_theme_fingerprint),
    'themeFingerprint', v_theme_fingerprint,
    'themeCompositionHash', v_theme_composition_hash,
    'themeValidationContractVersion', v_theme_validation_contract,
    'rendererContractVersion', v_renderer_contract,
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
  v_active_count integer;
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
  v_storage_path := 'jury-share/' || v_visibility || '/'
    || left(v_render_key, 2) || '/' || v_render_key
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

  select count(*)::integer into v_active_count
  from private.v3_jury_share_render_cache active
  where active.show_id = p_show_id
    and active.voter_country_id = p_voter_country_id
    and active.render_key <> v_render_key
    and active.status = 'pending'
    and active.lease_expires_at > v_now;

  if v_active_count >= 4 then
    raise exception using errcode = '54000', message = 'JURY_SHARE_RENDER_CONCURRENCY_LIMIT';
  end if;

  if coalesce(v_row.attempt_count, 0) >= 8 then
    raise exception using errcode = '54000', message = 'JURY_SHARE_RENDER_RETRY_LIMIT';
  end if;

  v_lease := gen_random_uuid();

  insert into private.v3_jury_share_render_cache (
    render_key,
    renderer_contract_version,
    show_id,
    edition_id,
    voter_country_id,
    ballot_id,
    result_version,
    projection_state_version,
    visibility,
    source_identity_version,
    recipient_identity_version_set_hash,
    theme_id,
    theme_version,
    theme_fingerprint,
    theme_composition_hash,
    theme_validation_contract_version,
    output_target,
    format,
    mime_type,
    width,
    height,
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
    (v_identity ->> 'rendererContractVersion')::integer,
    p_show_id,
    (v_projection #>> '{edition,id}')::uuid,
    p_voter_country_id,
    (v_projection ->> 'ballotId')::uuid,
    (v_identity ->> 'resultVersion')::bigint,
    v_identity ->> 'projectionStateVersion',
    v_visibility,
    v_projection #>> '{source,identityVersion}',
    v_identity ->> 'recipientIdentityVersionSetHash',
    lower(btrim(p_theme_id)),
    (v_identity #>> '{identity,themeVersion}')::integer,
    v_identity ->> 'themeFingerprint',
    nullif(v_identity ->> 'themeCompositionHash', ''),
    nullif(v_identity ->> 'themeValidationContractVersion', '')::integer,
    lower(btrim(p_output_target)),
    v_format,
    v_identity ->> 'mimeType',
    1080,
    1920,
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
  set storage_path = null,
      byte_size = null,
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

  -- Publication, visibility, result, identity or Edition-theme evidence may
  -- have changed while the image rendered. Recompute before exposing it.
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
  if v_identity ->> 'renderKey' is distinct from p_render_key
     or v_identity ->> 'visibility' is distinct from v_row.visibility
     or v_identity ->> 'projectionStateVersion' is distinct from v_row.projection_state_version
     or v_identity ->> 'themeFingerprint' is distinct from v_row.theme_fingerprint then
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
       or v_identity ->> 'renderKey' is distinct from p_render_key
       or v_identity ->> 'visibility' is distinct from v_row.visibility
       or v_identity ->> 'projectionStateVersion' is distinct from v_row.projection_state_version
       or v_identity ->> 'themeFingerprint' is distinct from v_row.theme_fingerprint then
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

create or replace function public.v3_prune_jury_share_render_cache(
  p_limit integer default 500
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $prune$
declare
  v_deleted integer;
begin
  if not private.studio2_request_is_service_role() then
    raise exception using errcode = '42501', message = 'JURY_SHARE_NOT_AUTHORIZED';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 1000 then
    raise exception using errcode = '22023', message = 'JURY_SHARE_PRUNE_LIMIT_INVALID';
  end if;

  with candidates as (
    select cache.render_key
    from private.v3_jury_share_render_cache cache
    where (cache.expires_at is not null and cache.expires_at < now() - interval '1 day')
       or (cache.status = 'failed' and cache.updated_at < now() - interval '7 days')
    order by cache.updated_at
    limit p_limit
    for update skip locked
  )
  delete from private.v3_jury_share_render_cache cache
  using candidates
  where cache.render_key = candidates.render_key;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end
$prune$;

revoke all on function public.v3_prune_jury_share_render_cache(integer)
  from public, anon, authenticated, service_role;
grant execute on function public.v3_prune_jury_share_render_cache(integer)
  to service_role;

notify pgrst, 'reload schema';

commit;
