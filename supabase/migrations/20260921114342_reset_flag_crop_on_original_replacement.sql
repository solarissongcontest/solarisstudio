-- A replacement source is a different flag and must not inherit its predecessor's
-- manually chosen focal point. The previous original URL remains in history/media.
create or replace function private.reset_country_flag_crop_on_replace()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
begin
  if new.flag_image is distinct from old.flag_image then
    new.flag_crop_x := 50;
    new.flag_crop_y := 50;
    new.flag_crop_zoom := 1;
  end if;
  return new;
end;
$function$;

create trigger reset_country_flag_crop_on_replace
before update of flag_image on public.countries
for each row execute function private.reset_country_flag_crop_on_replace();
