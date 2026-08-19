begin;

alter table public.country_themes
  add column if not exists background_mode text not null default 'gradient',
  add column if not exists gradient_style text not null default 'aurora',
  add column if not exists gradient_angle integer not null default 145,
  add column if not exists background_image_url text,
  add column if not exists background_image_storage_path text,
  add column if not exists background_position_x integer not null default 50,
  add column if not exists background_position_y integer not null default 50,
  add column if not exists background_overlay numeric(4,3) not null default 0.360,
  add column if not exists background_blur integer not null default 0,
  add column if not exists hero_layout text not null default 'classic';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='country_themes_background_mode_check' and conrelid='public.country_themes'::regclass) then
    alter table public.country_themes add constraint country_themes_background_mode_check check (background_mode in ('solid','gradient','image'));
  end if;
  if not exists (select 1 from pg_constraint where conname='country_themes_gradient_style_check' and conrelid='public.country_themes'::regclass) then
    alter table public.country_themes add constraint country_themes_gradient_style_check check (gradient_style in ('linear','radial','aurora'));
  end if;
  if not exists (select 1 from pg_constraint where conname='country_themes_gradient_angle_check' and conrelid='public.country_themes'::regclass) then
    alter table public.country_themes add constraint country_themes_gradient_angle_check check (gradient_angle between 0 and 360);
  end if;
  if not exists (select 1 from pg_constraint where conname='country_themes_background_position_x_check' and conrelid='public.country_themes'::regclass) then
    alter table public.country_themes add constraint country_themes_background_position_x_check check (background_position_x between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='country_themes_background_position_y_check' and conrelid='public.country_themes'::regclass) then
    alter table public.country_themes add constraint country_themes_background_position_y_check check (background_position_y between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='country_themes_background_overlay_check' and conrelid='public.country_themes'::regclass) then
    alter table public.country_themes add constraint country_themes_background_overlay_check check (background_overlay between 0 and 0.9);
  end if;
  if not exists (select 1 from pg_constraint where conname='country_themes_background_blur_check' and conrelid='public.country_themes'::regclass) then
    alter table public.country_themes add constraint country_themes_background_blur_check check (background_blur between 0 and 30);
  end if;
  if not exists (select 1 from pg_constraint where conname='country_themes_hero_layout_check' and conrelid='public.country_themes'::regclass) then
    alter table public.country_themes add constraint country_themes_hero_layout_check check (hero_layout in ('classic','editorial','minimal','flag-focus'));
  end if;
end;
$$;

alter table public.country_profile_sections
  add column if not exists section_type text not null default 'rich_text',
  add column if not exists kicker text,
  add column if not exists content_mode text not null default 'manual',
  add column if not exists visible_on_country boolean not null default true,
  add column if not exists visible_on_wiki boolean not null default true,
  add column if not exists image_layout text not null default 'wide',
  add column if not exists background_tint text,
  add column if not exists content_json jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='country_profile_sections_type_check' and conrelid='public.country_profile_sections'::regclass) then
    alter table public.country_profile_sections add constraint country_profile_sections_type_check check (section_type in ('rich_text','image','quote','facts','gallery','divider'));
  end if;
  if not exists (select 1 from pg_constraint where conname='country_profile_sections_content_mode_check' and conrelid='public.country_profile_sections'::regclass) then
    alter table public.country_profile_sections add constraint country_profile_sections_content_mode_check check (content_mode in ('manual','auto'));
  end if;
  if not exists (select 1 from pg_constraint where conname='country_profile_sections_image_layout_check' and conrelid='public.country_profile_sections'::regclass) then
    alter table public.country_profile_sections add constraint country_profile_sections_image_layout_check check (image_layout in ('wide','split','left','right','full'));
  end if;
  if not exists (select 1 from pg_constraint where conname='country_profile_sections_background_tint_check' and conrelid='public.country_profile_sections'::regclass) then
    alter table public.country_profile_sections add constraint country_profile_sections_background_tint_check check (background_tint is null or background_tint ~ '^#[0-9A-Fa-f]{6}$');
  end if;
end;
$$;

create or replace function public.reorder_country_profile_sections(
  _country_id uuid,
  _section_ids uuid[]
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_position integer := 0;
begin
  if not (public.owns_country(_country_id) or public.has_role(auth.uid(), 'organizer')) then
    raise exception 'Country editing access required.' using errcode='42501';
  end if;

  if coalesce(array_length(_section_ids, 1), 0) <> (
    select count(*)::integer from public.country_profile_sections where country_id=_country_id
  ) then
    raise exception 'Section order must contain every country section exactly once.' using errcode='22023';
  end if;

  if (select count(distinct value)::integer from unnest(_section_ids) as value) <> coalesce(array_length(_section_ids, 1), 0) then
    raise exception 'Section order contains duplicates.' using errcode='22023';
  end if;

  foreach v_id in array _section_ids loop
    if not exists (select 1 from public.country_profile_sections where id=v_id and country_id=_country_id) then
      raise exception 'Section does not belong to this country.' using errcode='22023';
    end if;
    update public.country_profile_sections set sort_order=v_position where id=v_id and country_id=_country_id;
    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.reorder_country_profile_sections(uuid, uuid[]) from public;
grant execute on function public.reorder_country_profile_sections(uuid, uuid[]) to authenticated, service_role;

-- Country background images share the existing owner-managed country-media
-- bucket. The bucket already enforces an 8 MB upload limit and the same safe
-- image MIME types used by the gallery/flag uploader.

notify pgrst, 'reload schema';

commit;
