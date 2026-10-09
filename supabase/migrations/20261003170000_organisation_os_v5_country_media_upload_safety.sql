begin;

-- Organisation OS V5 unified upload safety for country media.
--
-- Country media previously relied on broad owner-folder Storage policies plus
-- client-only MIME/size checks. V5 moves it onto the same server-authorized
-- descriptor pattern used by protected evidence: request one exact path, upload
-- with upsert disabled, then finalize that token.

create table if not exists public.studio2_country_media_upload_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  folder text not null check (folder in ('flags', 'gallery', 'backgrounds')),
  object_path text not null unique,
  original_name text not null,
  mime_type text not null check (
    mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/gif')
  ),
  expected_size bigint not null check (expected_size > 0 and expected_size <= 8388608),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz,
  constraint studio2_country_media_upload_expiry_check
    check (expires_at > created_at)
);

create index if not exists studio2_country_media_upload_tokens_active_idx
  on public.studio2_country_media_upload_tokens (user_id, expires_at)
  where consumed_at is null;

alter table public.studio2_country_media_upload_tokens enable row level security;
revoke all on table public.studio2_country_media_upload_tokens
  from public, anon, authenticated;
grant all on table public.studio2_country_media_upload_tokens to service_role;

create or replace function private.studio2_can_upload_country_media(
  p_user_id uuid,
  p_country_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $allowed$
  select
    p_user_id is not null
    and p_country_id is not null
    and (
      exists (
        select 1
        from public.country_accounts account
        where account.user_id = p_user_id
          and account.country_id = p_country_id
          and account.status = 'active'
      )
      or private.studio2_user_has_capability(
        p_user_id,
        'delegation.manage',
        null
      )
    );
$allowed$;

revoke all on function private.studio2_can_upload_country_media(uuid, uuid)
  from public, anon, authenticated;


create or replace function private.studio2_country_media_upload_token_valid(
  p_user_id uuid,
  p_object_path text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $valid$
  select exists (
    select 1
    from public.studio2_country_media_upload_tokens token
    where token.user_id = p_user_id
      and token.object_path = p_object_path
      and token.consumed_at is null
      and token.expires_at > now()
  );
$valid$;

revoke all on function private.studio2_country_media_upload_token_valid(uuid, text)
  from public, anon, service_role;
grant execute on function private.studio2_country_media_upload_token_valid(uuid, text)
  to authenticated;

create or replace function public.studio2_create_country_media_upload(
  p_country_id uuid,
  p_folder text,
  p_name text,
  p_mime text,
  p_size bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $prepare$
declare
  v_actor uuid := auth.uid();
  v_folder text := lower(btrim(coalesce(p_folder, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_mime text := lower(btrim(coalesce(p_mime, '')));
  v_safe_name text;
  v_path text;
  v_token public.studio2_country_media_upload_tokens;
begin
  if not private.studio2_can_upload_country_media(v_actor, p_country_id) then
    raise exception 'Country media upload access required' using errcode = '42501';
  end if;

  if v_folder not in ('flags', 'gallery', 'backgrounds') then
    raise exception 'Unknown country media folder' using errcode = '22023';
  end if;

  if v_name = '' or length(v_name) > 220 then
    raise exception 'A valid file name is required' using errcode = '22023';
  end if;

  if v_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/gif') then
    raise exception 'Use a JPG, PNG, WebP or GIF image' using errcode = '22023';
  end if;

  if p_size is null or p_size <= 0 or p_size > 8388608 then
    raise exception 'Country media must be between 1 byte and 8 MB'
      using errcode = '22023';
  end if;

  v_safe_name := lower(regexp_replace(v_name, '[^a-zA-Z0-9._-]+', '-', 'g'));
  v_safe_name := regexp_replace(v_safe_name, '(^-+|-+$)', '', 'g');
  if v_safe_name = '' then
    v_safe_name := 'image';
  end if;
  v_safe_name := left(v_safe_name, 120);

  v_path :=
    p_country_id::text
    || '/'
    || v_folder
    || '/'
    || gen_random_uuid()::text
    || '-'
    || v_safe_name;

  insert into public.studio2_country_media_upload_tokens (
    user_id,
    country_id,
    folder,
    object_path,
    original_name,
    mime_type,
    expected_size
  )
  values (
    v_actor,
    p_country_id,
    v_folder,
    v_path,
    v_name,
    v_mime,
    p_size
  )
  returning * into v_token;

  return jsonb_build_object(
    'token_id', v_token.id,
    'bucket', 'country-media',
    'object_path', v_token.object_path,
    'expires_at', v_token.expires_at
  );
end
$prepare$;

revoke all on function public.studio2_create_country_media_upload(
  uuid, text, text, text, bigint
) from public, anon;
grant execute on function public.studio2_create_country_media_upload(
  uuid, text, text, text, bigint
) to authenticated, service_role;

create or replace function public.studio2_finalize_country_media_upload(
  p_token_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, storage
as $finalize$
declare
  v_actor uuid := auth.uid();
  v_token public.studio2_country_media_upload_tokens;
begin
  select *
  into v_token
  from public.studio2_country_media_upload_tokens token
  where token.id = p_token_id
    and token.user_id = v_actor
  for update;

  if v_token.id is null then
    raise exception 'Country media upload token not found' using errcode = 'P0002';
  end if;

  if v_token.consumed_at is not null then
    return jsonb_build_object(
      'ok', true,
      'token_id', v_token.id,
      'bucket', 'country-media',
      'object_path', v_token.object_path,
      'already_finalized', true
    );
  end if;

  if v_token.expires_at <= now() then
    raise exception 'Country media upload token expired' using errcode = '22023';
  end if;

  if not private.studio2_can_upload_country_media(v_actor, v_token.country_id) then
    raise exception 'Country media upload access is no longer valid'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from storage.objects object
    where object.bucket_id = 'country-media'
      and object.name = v_token.object_path
  ) then
    raise exception 'Country media object is missing; upload before finalizing'
      using errcode = '22023';
  end if;

  update public.studio2_country_media_upload_tokens
  set consumed_at = now()
  where id = v_token.id;

  return jsonb_build_object(
    'ok', true,
    'token_id', v_token.id,
    'bucket', 'country-media',
    'object_path', v_token.object_path,
    'already_finalized', false
  );
end
$finalize$;

revoke all on function public.studio2_finalize_country_media_upload(uuid)
  from public, anon;
grant execute on function public.studio2_finalize_country_media_upload(uuid)
  to authenticated, service_role;

-- Direct folder ownership is no longer enough to upload/replace bytes. A live,
-- actor-bound token for the exact object path is required. Public reads and
-- authorized deletes remain unchanged.
drop policy if exists "country media bucket owner insert" on storage.objects;
create policy "country media tokenized insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'country-media'
  and private.studio2_country_media_upload_token_valid(auth.uid(), name)
);

drop policy if exists "country media bucket owner update" on storage.objects;
create policy "country media tokenized update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'country-media'
  and private.studio2_country_media_upload_token_valid(auth.uid(), name)
)
with check (
  bucket_id = 'country-media'
  and private.studio2_country_media_upload_token_valid(auth.uid(), name)
);

notify pgrst, 'reload schema';

commit;
