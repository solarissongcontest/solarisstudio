begin;

create or replace function public.admin_update_country_identity(
  _country_id uuid,
  _name text,
  _native_name text,
  _region text,
  _description text,
  _accent_color text,
  _flag_image text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(btrim(_name), '');
  v_native_name text := nullif(btrim(_native_name), '');
  v_region text := coalesce(nullif(btrim(_region), ''), 'Terra Solaris');
  v_description text := nullif(btrim(_description), '');
  v_accent text := coalesce(nullif(btrim(_accent_color), ''), '#7dd3fc');
  v_flag text := nullif(btrim(_flag_image), '');
  v_result jsonb;
begin
  if not public.has_role(auth.uid(), 'organizer') then
    raise exception 'Organizer access required.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.countries where id = _country_id) then
    raise exception 'Country not found.' using errcode = '22023';
  end if;

  if v_name is null or length(v_name) > 80 then
    raise exception 'Country name must be between 1 and 80 characters.' using errcode = '22023';
  end if;

  if v_accent !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Accent colour must use a six-digit hex value.' using errcode = '22023';
  end if;

  update public.countries
  set name = v_name,
      native_name = v_native_name,
      region = v_region,
      description = v_description,
      accent_color = v_accent,
      flag_image = v_flag
  where id = _country_id;

  update public.contest_entities
  set display_name = v_name,
      flag_image = v_flag,
      region = v_region,
      updated_at = now()
  where country_id = _country_id
    and entity_type = 'global';

  update public.voters v
  set name = v_name,
      flag_image = v_flag,
      accent_color = v_accent
  where v.country_id = _country_id
     or exists (
       select 1
       from public.contest_entities ce
       where ce.id = v.contest_entity_id
         and ce.country_id = _country_id
         and ce.entity_type = 'global'
     );

  select to_jsonb(c) into v_result
  from public.countries c
  where c.id = _country_id;

  return v_result;
end;
$$;

revoke all on function public.admin_update_country_identity(uuid, text, text, text, text, text, text) from public;
grant execute on function public.admin_update_country_identity(uuid, text, text, text, text, text, text) to authenticated, service_role;

commit;
