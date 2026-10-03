begin;

-- Organisation OS V5 unified upload authorization + quarantine.
--
-- User-controlled bytes enter one private quarantine bucket only. The browser
-- receives one short-lived exact-path capability. A server-side finalizer must
-- verify the bytes before anything is copied into a final application bucket.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'solaris-upload-quarantine',
  'solaris-upload-quarantine',
  false,
  15728640,
  array[
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
    'application/octet-stream'
  ]::text[]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.studio2_upload_authorizations (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  domain text not null
    check (domain in ('country_media', 'edition_artwork', 'country_font', 'beta_feedback')),
  entity_id uuid,
  scope text,
  final_bucket text not null,
  quarantine_path text not null unique,
  final_path text not null unique,
  original_name text not null,
  declared_mime text not null,
  expected_size bigint not null check (expected_size > 0 and expected_size <= 15728640),
  authorization_secret text not null,
  status text not null default 'prepared'
    check (status in ('prepared', 'verified', 'rejected', 'expired')),
  context jsonb not null default '{}'::jsonb check (jsonb_typeof(context) = 'object'),
  detected_mime text,
  verified_metadata jsonb,
  rejection_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  finalized_at timestamptz,
  constraint studio2_upload_authorization_expiry_check check (expires_at > created_at)
);

create index if not exists studio2_upload_authorizations_active_idx
  on public.studio2_upload_authorizations (expires_at, domain)
  where status = 'prepared';

alter table public.studio2_upload_authorizations enable row level security;
revoke all on table public.studio2_upload_authorizations
  from public, anon, authenticated;
grant all on table public.studio2_upload_authorizations to service_role;

create or replace function private.studio2_upload_quarantine_path_allowed(
  p_actor uuid,
  p_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
  select exists (
    select 1
    from public.studio2_upload_authorizations authorization
    where authorization.quarantine_path = p_path
      and authorization.status = 'prepared'
      and authorization.expires_at > now()
      and (
        authorization.actor_id = p_actor
        or (authorization.actor_id is null and p_actor is null)
      )
  );
$allowed$;

revoke all on function private.studio2_upload_quarantine_path_allowed(uuid, text)
  from public, anon, service_role;
grant execute on function private.studio2_upload_quarantine_path_allowed(uuid, text)
  to anon, authenticated;

drop policy if exists "solaris unified upload quarantine insert" on storage.objects;
create policy "solaris unified upload quarantine insert"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'solaris-upload-quarantine'
  and private.studio2_upload_quarantine_path_allowed(auth.uid(), name)
);

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
begin
  if p_domain in ('country_media', 'edition_artwork', 'beta_feedback') then
    return case lower(p_mime)
      when 'image/jpeg' then 'jpg'
      when 'image/png' then 'png'
      when 'image/webp' then 'webp'
      when 'image/gif' then 'gif'
      else null
    end;
  end if;

  if p_domain = 'country_font' and v_ext in ('woff2', 'woff', 'ttf', 'otf') then
    return v_ext;
  end if;

  return null;
end
$extension$;

revoke all on function private.studio2_upload_extension(text, text, text)
  from public, anon, authenticated;

create or replace function public.studio2_prepare_upload(
  p_domain text,
  p_entity_id uuid,
  p_scope text,
  p_name text,
  p_mime text,
  p_size bigint,
  p_context jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $prepare$
declare
  v_actor uuid := auth.uid();
  v_domain text := lower(btrim(coalesce(p_domain, '')));
  v_scope text := lower(btrim(coalesce(p_scope, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_mime text := lower(btrim(coalesce(p_mime, '')));
  v_context jsonb := case when jsonb_typeof(p_context) = 'object' then p_context else '{}'::jsonb end;
  v_token_id uuid := gen_random_uuid();
  v_secret text := gen_random_uuid()::text || gen_random_uuid()::text;
  v_extension text;
  v_final_bucket text;
  v_final_path text;
  v_quarantine_path text;
  v_admin_beta boolean := coalesce((v_context ->> 'admin')::boolean, false);
begin
  if v_name = '' or length(v_name) > 220 then
    raise exception 'A valid upload file name is required' using errcode = '22023';
  end if;
  if p_size is null or p_size <= 0 then
    raise exception 'Upload must contain at least one byte' using errcode = '22023';
  end if;

  v_extension := private.studio2_upload_extension(v_domain, v_name, v_mime);
  if v_extension is null then
    raise exception 'Unsupported file type for upload domain %', v_domain using errcode = '22023';
  end if;

  if v_domain = 'country_media' then
    if v_actor is null
       or p_entity_id is null
       or not private.studio2_can_upload_country_media(v_actor, p_entity_id) then
      raise exception 'Country media upload access required' using errcode = '42501';
    end if;
    if v_scope not in ('flags', 'gallery', 'backgrounds') then
      raise exception 'Unknown country media folder' using errcode = '22023';
    end if;
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
       or p_size > 8388608 then
      raise exception 'Country media must be an allowed image no larger than 8 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'country-media';
    v_final_path := p_entity_id::text || '/' || v_scope || '/' || v_token_id::text || '.' || v_extension;

  elsif v_domain = 'edition_artwork' then
    if v_actor is null
       or p_entity_id is null
       or not public.studio2_access_allowed('edition.manage', p_entity_id, false) then
      raise exception 'Edition design access required' using errcode = '42501';
    end if;
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp')
       or p_size > 15728640 then
      raise exception 'Edition artwork must be JPG, PNG or WebP and no larger than 15 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'edition-artwork';
    v_final_path := p_entity_id::text || '/' || v_token_id::text || '.' || v_extension;

  elsif v_domain = 'country_font' then
    if v_actor is null
       or p_entity_id is null
       or not private.studio2_can_upload_country_media(v_actor, p_entity_id) then
      raise exception 'Country font upload access required' using errcode = '42501';
    end if;
    if v_mime not in (
      'font/woff2',
      'font/woff',
      'font/ttf',
      'font/otf',
      'application/font-woff',
      'application/x-font-ttf',
      'application/x-font-opentype',
      'application/octet-stream'
    ) or p_size > 4194304 then
      raise exception 'Custom fonts must be WOFF2, WOFF, TTF or OTF and no larger than 4 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'country-fonts';
    v_final_path := v_actor::text || '/' || p_entity_id::text || '/' || v_token_id::text || '.' || v_extension;

  elsif v_domain = 'beta_feedback' then
    if v_admin_beta and v_actor is null then
      raise exception 'Authenticated Organizer session required for admin beta feedback'
        using errcode = '42501';
    end if;
    if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
       or p_size > 8388608 then
      raise exception 'Beta screenshots must be an allowed image no larger than 8 MB'
        using errcode = '22023';
    end if;
    v_final_bucket := 'beta-feedback';
    v_final_path :=
      case when v_admin_beta then 'admin/' else 'public/' end
      || v_token_id::text || '.' || v_extension;

  else
    raise exception 'Unknown upload domain' using errcode = '22023';
  end if;

  v_quarantine_path := v_token_id::text || '/' || v_token_id::text || '.' || v_extension;

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
    v_token_id,
    v_actor,
    v_domain,
    p_entity_id,
    nullif(v_scope, ''),
    v_final_bucket,
    v_quarantine_path,
    v_final_path,
    v_name,
    v_mime,
    p_size,
    v_secret,
    v_context
  );

  return jsonb_build_object(
    'token_id', v_token_id,
    'upload_secret', v_secret,
    'bucket', 'solaris-upload-quarantine',
    'object_path', v_quarantine_path,
    'final_bucket', v_final_bucket,
    'expires_at', now() + interval '10 minutes'
  );
end
$prepare$;

revoke all on function public.studio2_prepare_upload(
  text, uuid, text, text, text, bigint, jsonb
) from public;
grant execute on function public.studio2_prepare_upload(
  text, uuid, text, text, text, bigint, jsonb
) to anon, authenticated, service_role;

-- Final application buckets are service-published only. Existing public read
-- and owner/admin delete policies remain intact.
drop policy if exists "country media bucket owner insert" on storage.objects;
drop policy if exists "country media bucket owner update" on storage.objects;
drop policy if exists "country media tokenized insert" on storage.objects;
drop policy if exists "country media tokenized update" on storage.objects;

drop policy if exists "organizers upload edition artwork" on storage.objects;
drop policy if exists "organizers update edition artwork" on storage.objects;

drop policy if exists "country fonts authenticated upload" on storage.objects;
drop policy if exists "country fonts owner update" on storage.objects;

drop policy if exists "Public beta testers can upload screenshots" on storage.objects;

-- The older country-media token RPCs are superseded by the unified quarantine
-- capability and may no longer be called directly from authenticated clients.
revoke execute on function public.studio2_create_country_media_upload(
  uuid, text, text, text, bigint
) from authenticated;
revoke execute on function public.studio2_finalize_country_media_upload(uuid)
  from authenticated;

notify pgrst, 'reload schema';

commit;
