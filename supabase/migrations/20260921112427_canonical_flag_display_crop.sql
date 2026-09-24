-- The original flag_image remains untouched. All public factual flag media
-- use these canonical 3:2 crop coordinates and a uniform zoom.
alter table public.countries
  add column flag_crop_x numeric(5,2) not null default 50
    constraint countries_flag_crop_x_range check (flag_crop_x between 0 and 100),
  add column flag_crop_y numeric(5,2) not null default 50
    constraint countries_flag_crop_y_range check (flag_crop_y between 0 and 100),
  add column flag_crop_zoom numeric(4,2) not null default 1
    constraint countries_flag_crop_zoom_range check (flag_crop_zoom between 1 and 2);

comment on column public.countries.flag_crop_x is 'Horizontal focal point in percent for 3:2 presentation; original flag_image is preserved.';
comment on column public.countries.flag_crop_y is 'Vertical focal point in percent for 3:2 presentation.';
comment on column public.countries.flag_crop_zoom is 'Uniform crop zoom; independent X/Y stretching is never used.';
