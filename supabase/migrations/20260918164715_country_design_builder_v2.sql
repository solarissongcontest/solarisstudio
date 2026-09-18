begin;

alter table public.country_themes
  add column if not exists design_version smallint not null default 1,
  add column if not exists design_v2 jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='country_themes_design_version_check'
      and conrelid='public.country_themes'::regclass
  ) then
    alter table public.country_themes
      add constraint country_themes_design_version_check
      check (design_version in (1,2));
  end if;
end;
$$;

create table if not exists public.country_design_presets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source_country_id uuid references public.countries(id) on delete set null,
  name text not null,
  is_public boolean not null default false,
  design_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint country_design_presets_name_check check (char_length(trim(name)) between 1 and 80),
  constraint country_design_presets_design_check check (
    jsonb_typeof(design_json)='object'
    and coalesce((design_json->>'version')::integer,0)=2
  )
);

alter table public.country_design_presets enable row level security;

grant select on table public.country_design_presets to anon, authenticated;
grant insert, update, delete on table public.country_design_presets to authenticated;
grant all on table public.country_design_presets to service_role;

drop policy if exists "country design presets readable" on public.country_design_presets;
create policy "country design presets readable"
on public.country_design_presets
for select
to anon, authenticated
using (is_public or owner_user_id=(select auth.uid()));

drop policy if exists "country design presets owner insert" on public.country_design_presets;
create policy "country design presets owner insert"
on public.country_design_presets
for insert
to authenticated
with check (owner_user_id=(select auth.uid()));

drop policy if exists "country design presets owner update" on public.country_design_presets;
create policy "country design presets owner update"
on public.country_design_presets
for update
to authenticated
using (owner_user_id=(select auth.uid()))
with check (owner_user_id=(select auth.uid()));

drop policy if exists "country design presets owner delete" on public.country_design_presets;
create policy "country design presets owner delete"
on public.country_design_presets
for delete
to authenticated
using (owner_user_id=(select auth.uid()));

create table if not exists public.country_font_assets (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  name text not null,
  family_key text not null,
  storage_path text not null unique,
  public_url text not null,
  mime_type text not null,
  created_at timestamptz not null default now(),
  constraint country_font_assets_name_check check (char_length(trim(name)) between 1 and 80),
  constraint country_font_assets_family_check check (family_key ~ '^Solaris Custom [0-9a-f-]{8,36}$')
);

alter table public.country_font_assets enable row level security;

grant select, insert, delete on table public.country_font_assets to authenticated;
grant all on table public.country_font_assets to service_role;

drop policy if exists "country font assets owner or capability read" on public.country_font_assets;
create policy "country font assets owner or capability read"
on public.country_font_assets
for select
to authenticated
using (
  owner_user_id=(select auth.uid())
  or public.owns_country(country_id)
  or public.studio2_access_allowed('delegation.manage'::text, null::uuid, true)
);

drop policy if exists "country font assets owner or capability insert" on public.country_font_assets;
create policy "country font assets owner or capability insert"
on public.country_font_assets
for insert
to authenticated
with check (
  owner_user_id=(select auth.uid())
  and (
    public.owns_country(country_id)
    or public.studio2_access_allowed('delegation.manage'::text, null::uuid, true)
  )
);

drop policy if exists "country font assets owner delete" on public.country_font_assets;
create policy "country font assets owner delete"
on public.country_font_assets
for delete
to authenticated
using (owner_user_id=(select auth.uid()));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'country-fonts',
  'country-fonts',
  true,
  4194304,
  array[
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
set public=excluded.public,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "country fonts authenticated upload" on storage.objects;
create policy "country fonts authenticated upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id='country-fonts'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "country fonts owner update" on storage.objects;
create policy "country fonts owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id='country-fonts'
  and (storage.foldername(name))[1]=(select auth.uid())::text
)
with check (
  bucket_id='country-fonts'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

drop policy if exists "country fonts owner delete" on storage.objects;
create policy "country fonts owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id='country-fonts'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

alter table public.country_profile_sections
  drop constraint if exists country_profile_sections_type_check;

alter table public.country_profile_sections
  add constraint country_profile_sections_type_check
  check (section_type in ('rich_text','image','quote','facts','gallery','divider','timeline'));

notify pgrst, 'reload schema';
commit;
