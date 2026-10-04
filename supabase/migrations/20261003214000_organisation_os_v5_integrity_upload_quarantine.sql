begin;

-- Organisation OS V5 evidence cutover to the unified upload quarantine.
--
-- Evidence keeps its existing immutable case-token/finalization lifecycle, but
-- the bytes now use the same shared server-side safety policy as every other
-- upload surface.

alter table public.studio2_upload_authorizations
  drop constraint if exists studio2_upload_authorizations_domain_check;

alter table public.studio2_upload_authorizations
  add constraint studio2_upload_authorizations_domain_check
  check (
    domain in (
      'country_media',
      'edition_artwork',
      'country_font',
      'beta_feedback',
      'integrity_evidence'
    )
  );

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'font/woff2',
  'font/woff',
  'font/ttf',
  'font/otf',
  'application/font-woff',
  'application/x-font-ttf',
  'application/x-font-opentype',
  'application/octet-stream',
  'application/pdf',
  'text/plain'
]::text[]
where id = 'solaris-upload-quarantine';

create or replace function private.studio2_upload_extension(
  p_domain text,
  p_name text,
  p_mime text
)
returns text
language plpgsql
immutable
set search_path = pg_catalog
as $extension$
declare
  v_ext text := lower(regexp_replace(coalesce(p_name, ''), '^.*[.]', ''));
  v_mime text := lower(coalesce(p_mime, ''));
begin
  if p_domain in ('country_media', 'edition_artwork', 'beta_feedback') then
    if v_mime = 'image/jpeg' and v_ext in ('jpg', 'jpeg') then return 'jpg'; end if;
    if v_mime = 'image/png' and v_ext = 'png' then return 'png'; end if;
    if v_mime = 'image/webp' and v_ext = 'webp' then return 'webp'; end if;
    return null;
  end if;

  if p_domain = 'country_font'
     and v_ext = 'woff2'
     and v_mime = 'font/woff2' then
    return 'woff2';
  end if;

  if p_domain = 'integrity_evidence' then
    if v_mime = 'image/jpeg' and v_ext in ('jpg', 'jpeg') then return 'jpg'; end if;
    if v_mime = 'image/png' and v_ext = 'png' then return 'png'; end if;
    if v_mime = 'image/webp' and v_ext = 'webp' then return 'webp'; end if;
    if v_mime = 'application/pdf' and v_ext = 'pdf' then return 'pdf'; end if;
    if v_mime = 'text/plain' and v_ext = 'txt' then return 'txt'; end if;
    return null;
  end if;

  return null;
end
$extension$;
revoke all on function private.studio2_upload_extension(text, text, text)
  from public, anon, authenticated;

create or replace function private.studio2_create_evidence_upload_authorization(
  p_case_id uuid,
  p_actor_id uuid,
  p_evidence_token_id uuid,
  p_scope text,
  p_name text,
  p_mime text,
  p_size bigint,
  p_final_path text,
  p_context jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $authorize$
declare
  v_authorization_id uuid := gen_random_uuid();
  v_secret text := gen_random_uuid()::text || gen_random_uuid()::text;
  v_extension text;
  v_quarantine_path text;
begin
  if not coalesce(private.studio2_platform_mutation_allowed('upload.prepare'), false) then
    raise exception 'Uploads are unavailable while Solaris is Read-only or in Maintenance'
      using errcode = '25006';
  end if;

  perform public.integrity_validate_evidence_file(p_name, p_mime, p_size);
  v_extension := private.studio2_upload_extension(
    'integrity_evidence',
    p_name,
    p_mime
  );

  if v_extension is null then
    raise exception 'Unsupported evidence file type' using errcode = '22023';
  end if;

  v_quarantine_path :=
    v_authorization_id::text || '/' || v_authorization_id::text || '.' || v_extension;

  insert into public.studio2_upload_authorizations (
    id,
    actor_id,
    domain,
    entity_id,
    scope,
    final_bucket,
    quarantine_path,
    final_path,
    original_name,
    declared_mime,
    expected_size,
    authorization_secret,
    context
  )
  values (
    v_authorization_id,
    p_actor_id,
    'integrity_evidence',
    p_case_id,
    p_scope,
    'integrity-evidence',
    v_quarantine_path,
    p_final_path,
    p_name,
    p_mime,
    p_size,
    v_secret,
    coalesce(p_context, '{}'::jsonb)
      || jsonb_build_object('evidenceTokenId', p_evidence_token_id)
  );

  return jsonb_build_object(
    'token_id', p_evidence_token_id,
    'upload_authorization_id', v_authorization_id,
    'upload_secret', v_secret,
    'bucket', 'solaris-upload-quarantine',
    'object_path', v_quarantine_path,
    'final_bucket', 'integrity-evidence',
    'final_path', p_final_path,
    'expires_at', now() + interval '10 minutes'
  );
end
$authorize$;

revoke all on function private.studio2_create_evidence_upload_authorization(
  uuid, uuid, uuid, text, text, text, bigint, text, jsonb
) from public, anon, authenticated;

create or replace function public.public_create_anonymous_evidence_upload(
  _case_code text,
  _recovery_key text,
  _name text,
  _mime text,
  _size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $anonymous$
declare
  v_case uuid;
  v_hash text;
  v_token uuid := gen_random_uuid();
  v_path text;
  v_extension text;
begin
  perform public.integrity_validate_evidence_file(_name, _mime, _size);

  v_hash := encode(
    extensions.digest(
      convert_to(public.integrity_normalize_secret(_recovery_key), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  select case_row.id
  into v_case
  from public.integrity_cases case_row
  join public.integrity_case_access access_row
    on access_row.case_id = case_row.id
  where upper(case_row.public_code) = upper(trim(_case_code))
    and case_row.identity_mode = 'anonymous'
    and access_row.recovery_secret_hash = v_hash;

  if v_case is null then
    raise exception 'Case code or recovery key is incorrect';
  end if;

  v_extension := private.studio2_upload_extension(
    'integrity_evidence',
    _name,
    _mime
  );
  if v_extension is null then
    raise exception 'Unsupported evidence file type';
  end if;

  v_path :=
    'case/' || v_case::text || '/reporter/' || v_token::text || '.' || v_extension;

  insert into public.integrity_evidence_upload_tokens (
    id,
    case_id,
    object_path,
    original_name,
    mime_type,
    expected_size
  )
  values (
    v_token,
    v_case,
    v_path,
    _name,
    _mime,
    _size
  );

  return private.studio2_create_evidence_upload_authorization(
    v_case,
    null,
    v_token,
    'reporter',
    _name,
    _mime,
    _size,
    v_path,
    jsonb_build_object('identityMode', 'anonymous')
  );
end
$anonymous$;

revoke all on function public.public_create_anonymous_evidence_upload(
  text, text, text, text, bigint
) from public;
grant execute on function public.public_create_anonymous_evidence_upload(
  text, text, text, text, bigint
) to anon, authenticated;

create or replace function public.create_protected_evidence_upload(
  _case_id uuid,
  _name text,
  _mime text,
  _size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $protected$
declare
  v_actor uuid := auth.uid();
  v_token uuid := gen_random_uuid();
  v_path text;
  v_extension text;
begin
  if v_actor is null or not exists (
    select 1
    from public.integrity_cases case_row
    where case_row.id = _case_id
      and case_row.reporter_user_id = v_actor
  ) then
    raise exception 'Case not available';
  end if;

  perform public.integrity_validate_evidence_file(_name, _mime, _size);
  v_extension := private.studio2_upload_extension(
    'integrity_evidence',
    _name,
    _mime
  );
  if v_extension is null then
    raise exception 'Unsupported evidence file type';
  end if;

  v_path :=
    'case/' || _case_id::text || '/reporter/' || v_token::text || '.' || v_extension;

  insert into public.integrity_evidence_upload_tokens (
    id,
    case_id,
    object_path,
    original_name,
    mime_type,
    expected_size,
    created_by
  )
  values (
    v_token,
    _case_id,
    v_path,
    _name,
    _mime,
    _size,
    v_actor
  );

  return private.studio2_create_evidence_upload_authorization(
    _case_id,
    v_actor,
    v_token,
    'reporter',
    _name,
    _mime,
    _size,
    v_path,
    jsonb_build_object('identityMode', 'protected')
  );
end
$protected$;

revoke all on function public.create_protected_evidence_upload(
  uuid, text, text, bigint
) from public;
grant execute on function public.create_protected_evidence_upload(
  uuid, text, text, bigint
) to authenticated;

create or replace function public.admin_create_integrity_evidence_derivative_upload(
  _source_evidence_id uuid,
  _name text,
  _mime text,
  _size bigint,
  _kind text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $derivative$
declare
  v_actor uuid := auth.uid();
  v_case_id uuid;
  v_source_status text;
  v_token uuid := gen_random_uuid();
  v_path text;
  v_extension text;
begin
  if not public.integrity_is_organizer() then
    raise exception 'Organizer access required';
  end if;

  _kind := lower(trim(coalesce(_kind, '')));
  if _kind not in ('redacted', 'disclosure', 'redacted_disclosure') then
    raise exception 'Invalid evidence derivative kind';
  end if;

  select evidence.case_id, evidence.lifecycle_status
  into v_case_id, v_source_status
  from public.integrity_case_evidence evidence
  where evidence.id = _source_evidence_id
  for share;

  if v_case_id is null then
    raise exception 'Source evidence not found';
  end if;
  if v_source_status = 'deleted' then
    raise exception 'Deleted evidence cannot be used as a derivative source';
  end if;

  perform public.integrity_validate_evidence_file(_name, _mime, _size);
  v_extension := private.studio2_upload_extension(
    'integrity_evidence',
    _name,
    _mime
  );
  if v_extension is null then
    raise exception 'Unsupported evidence file type';
  end if;

  v_path :=
    'case/' || v_case_id::text || '/tsbc/' || v_token::text || '.' || v_extension;

  insert into public.integrity_evidence_upload_tokens (
    id,
    case_id,
    object_path,
    original_name,
    mime_type,
    expected_size,
    created_by,
    derivative_source_evidence_id,
    derivative_kind
  )
  values (
    v_token,
    v_case_id,
    v_path,
    _name,
    _mime,
    _size,
    v_actor,
    _source_evidence_id,
    _kind
  );

  return private.studio2_create_evidence_upload_authorization(
    v_case_id,
    v_actor,
    v_token,
    'tsbc',
    _name,
    _mime,
    _size,
    v_path,
    jsonb_build_object(
      'sourceEvidenceId', _source_evidence_id,
      'derivativeKind', _kind
    )
  ) || jsonb_build_object(
    'source_evidence_id', _source_evidence_id,
    'kind', _kind
  );
end
$derivative$;

revoke all on function public.admin_create_integrity_evidence_derivative_upload(
  uuid, text, text, bigint, text
) from public;
grant execute on function public.admin_create_integrity_evidence_derivative_upload(
  uuid, text, text, bigint, text
) to authenticated;

-- Final evidence bytes are service-published only after unified verification.
drop policy if exists "integrity evidence token upload" on storage.objects;

notify pgrst, 'reload schema';

commit;
