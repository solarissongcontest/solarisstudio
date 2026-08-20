begin;

-- Clean HOD-facing wrappers around the canonical edition-entry implementation.
-- The backwards-compatible RPCs still exist for old clients, but new Solaris
-- Studio code cannot express a show-specific artist/song write at all.
create or replace function public.upsert_owned_country_edition_entry(
  _edition_id uuid,
  _artist text,
  _song text,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_country_id uuid;
begin
  select ca.country_id
    into v_country_id
  from public.country_accounts ca
  where ca.user_id = auth.uid()
    and ca.status = 'active';

  if v_country_id is null then
    raise exception 'This country account is unavailable or suspended.' using errcode = '42501';
  end if;

  return public.upsert_country_edition_entry_internal(
    v_country_id,
    null,
    _edition_id,
    _artist,
    _song,
    _notes
  );
end;
$$;

revoke all on function public.upsert_owned_country_edition_entry(uuid, text, text, text) from public, anon;
grant execute on function public.upsert_owned_country_edition_entry(uuid, text, text, text) to authenticated, service_role;

create or replace function public.admin_upsert_country_edition_entry(
  _country_id uuid,
  _edition_id uuid,
  _artist text,
  _song text,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'organizer') then
    raise exception 'Organizer access required.' using errcode = '42501';
  end if;

  return public.upsert_country_edition_entry_internal(
    _country_id,
    null,
    _edition_id,
    _artist,
    _song,
    _notes
  );
end;
$$;

revoke all on function public.admin_upsert_country_edition_entry(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.admin_upsert_country_edition_entry(uuid, uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
