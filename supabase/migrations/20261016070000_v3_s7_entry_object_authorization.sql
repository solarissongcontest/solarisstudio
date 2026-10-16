begin;

-- System V3 S7: bind every browser-callable country-entry mutation to the
-- exact participant/edition/country object before authorization or mutation.
-- Internal writers remain service-role-only compatibility authorities.

create or replace function private.v3_resolve_country_entry_target_edition(
  p_country_id uuid,
  p_participant_id uuid,
  p_claimed_edition_id uuid
)
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $resolve$
declare
  v_target_edition_id uuid;
begin
  if p_country_id is null or p_claimed_edition_id is null then
    raise exception 'Country and edition are required' using errcode = '22023';
  end if;

  if not exists (select 1 from public.countries country where country.id = p_country_id) then
    raise exception 'Country not found' using errcode = '22023';
  end if;

  if p_participant_id is null then
    if not exists (select 1 from public.editions edition where edition.id = p_claimed_edition_id) then
      raise exception 'Edition not found' using errcode = '22023';
    end if;
    return p_claimed_edition_id;
  end if;

  select participant.edition_id
  into v_target_edition_id
  from public.participants participant
  left join public.contest_entities entity on entity.id = participant.contest_entity_id
  where participant.id = p_participant_id
    and (participant.country_id = p_country_id or entity.country_id = p_country_id)
  limit 1;

  if v_target_edition_id is null then
    raise exception 'Entry not found for that country' using errcode = '22023';
  end if;

  if v_target_edition_id is distinct from p_claimed_edition_id then
    raise exception 'Entry does not belong to the authorized edition' using errcode = '42501';
  end if;

  return v_target_edition_id;
end
$resolve$;

revoke all on function private.v3_resolve_country_entry_target_edition(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.v3_resolve_country_entry_target_edition(uuid, uuid, uuid)
  to service_role;

create or replace function public.admin_upsert_country_entry(
  _country_id uuid,
  _participant_id uuid,
  _edition_id uuid,
  _show_id uuid,
  _artist text,
  _song text,
  _notes text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $rpc$
declare
  v_edition_id uuid;
begin
  v_edition_id := private.v3_resolve_country_entry_target_edition(
    _country_id, _participant_id, _edition_id
  );
  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;
  return public.upsert_country_edition_entry_internal(
    _country_id, _participant_id, v_edition_id, _artist, _song, _notes
  );
end
$rpc$;

create or replace function public.admin_update_country_entry_listen_links(
  _country_id uuid,
  _participant_id uuid,
  _edition_id uuid,
  _youtube_url text,
  _spotify_url text,
  _apple_music_url text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $rpc$
declare
  v_edition_id uuid;
begin
  v_edition_id := private.v3_resolve_country_entry_target_edition(
    _country_id, _participant_id, _edition_id
  );
  if not public.studio2_access_allowed('entry.edit', v_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;
  return public.update_country_entry_listen_links_internal(
    _country_id, _participant_id, v_edition_id, _youtube_url, _spotify_url, _apple_music_url
  );
end
$rpc$;

create or replace function public.upsert_owned_country_entry(
  _participant_id uuid,
  _edition_id uuid,
  _show_id uuid,
  _artist text,
  _song text,
  _notes text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $rpc$
declare
  v_country_id uuid;
  v_edition_id uuid;
begin
  select account.country_id into v_country_id
  from public.country_accounts account
  where account.user_id = auth.uid() and account.status = 'active';
  if v_country_id is null then
    raise exception 'This country account is unavailable or suspended.' using errcode = '42501';
  end if;
  v_edition_id := private.v3_resolve_country_entry_target_edition(
    v_country_id, _participant_id, _edition_id
  );
  return public.upsert_country_edition_entry_internal(
    v_country_id, _participant_id, v_edition_id, _artist, _song, _notes
  );
end
$rpc$;

create or replace function public.update_owned_country_entry_listen_links(
  _participant_id uuid,
  _edition_id uuid,
  _youtube_url text,
  _spotify_url text,
  _apple_music_url text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $rpc$
declare
  v_country_id uuid;
  v_edition_id uuid;
begin
  select account.country_id into v_country_id
  from public.country_accounts account
  where account.user_id = auth.uid() and account.status = 'active';
  if v_country_id is null then
    raise exception 'This country account is unavailable or suspended.' using errcode = '42501';
  end if;
  v_edition_id := private.v3_resolve_country_entry_target_edition(
    v_country_id, _participant_id, _edition_id
  );
  return public.update_country_entry_listen_links_internal(
    v_country_id, _participant_id, v_edition_id, _youtube_url, _spotify_url, _apple_music_url
  );
end
$rpc$;

revoke all on function public.admin_upsert_country_entry(uuid,uuid,uuid,uuid,text,text,text) from public, anon;
grant execute on function public.admin_upsert_country_entry(uuid,uuid,uuid,uuid,text,text,text) to authenticated, service_role;
revoke all on function public.admin_update_country_entry_listen_links(uuid,uuid,uuid,text,text,text) from public, anon;
grant execute on function public.admin_update_country_entry_listen_links(uuid,uuid,uuid,text,text,text) to authenticated, service_role;
revoke all on function public.upsert_owned_country_entry(uuid,uuid,uuid,text,text,text) from public, anon;
grant execute on function public.upsert_owned_country_entry(uuid,uuid,uuid,text,text,text) to authenticated, service_role;
revoke all on function public.update_owned_country_entry_listen_links(uuid,uuid,text,text,text) from public, anon;
grant execute on function public.update_owned_country_entry_listen_links(uuid,uuid,text,text,text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
