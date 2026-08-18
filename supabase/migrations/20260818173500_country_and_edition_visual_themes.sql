begin;

create table if not exists public.country_themes (
  country_id uuid primary key references public.countries(id) on delete cascade,
  background_primary text not null default '#0b2330',
  background_secondary text not null default '#153c46',
  accent text not null default '#7dcfc4',
  text_primary text not null default '#f5f7f8',
  text_muted text not null default '#b7c4c8',
  surface text not null default '#102b35',
  updated_at timestamptz not null default now(),
  constraint country_themes_background_primary_hex check (background_primary ~ '^#[0-9A-Fa-f]{6}$'),
  constraint country_themes_background_secondary_hex check (background_secondary ~ '^#[0-9A-Fa-f]{6}$'),
  constraint country_themes_accent_hex check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  constraint country_themes_text_primary_hex check (text_primary ~ '^#[0-9A-Fa-f]{6}$'),
  constraint country_themes_text_muted_hex check (text_muted ~ '^#[0-9A-Fa-f]{6}$'),
  constraint country_themes_surface_hex check (surface ~ '^#[0-9A-Fa-f]{6}$')
);

alter table public.country_themes enable row level security;
grant select on public.country_themes to anon, authenticated;
grant insert, update, delete on public.country_themes to authenticated;
grant all on public.country_themes to service_role;

drop policy if exists "country themes public read" on public.country_themes;
create policy "country themes public read"
on public.country_themes for select using (true);

drop policy if exists "country themes owner write" on public.country_themes;
create policy "country themes owner write"
on public.country_themes for all to authenticated
using (public.owns_country(country_id) or public.has_role(auth.uid(), 'organizer'))
with check (public.owns_country(country_id) or public.has_role(auth.uid(), 'organizer'));

drop trigger if exists touch_country_themes_updated_at on public.country_themes;
create trigger touch_country_themes_updated_at
before update on public.country_themes
for each row execute function public.touch_country_content_updated_at();

alter table public.editions
  add column if not exists artwork_url text,
  add column if not exists artwork_storage_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('edition-artwork','edition-artwork',true,15728640,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "edition artwork public read" on storage.objects;
create policy "edition artwork public read"
on storage.objects for select
using (bucket_id = 'edition-artwork');

drop policy if exists "organizers upload edition artwork" on storage.objects;
create policy "organizers upload edition artwork"
on storage.objects for insert to authenticated
with check (bucket_id = 'edition-artwork' and public.has_role(auth.uid(), 'organizer'));

drop policy if exists "organizers update edition artwork" on storage.objects;
create policy "organizers update edition artwork"
on storage.objects for update to authenticated
using (bucket_id = 'edition-artwork' and public.has_role(auth.uid(), 'organizer'))
with check (bucket_id = 'edition-artwork' and public.has_role(auth.uid(), 'organizer'));

drop policy if exists "organizers delete edition artwork" on storage.objects;
create policy "organizers delete edition artwork"
on storage.objects for delete to authenticated
using (bucket_id = 'edition-artwork' and public.has_role(auth.uid(), 'organizer'));

commit;
