begin;

-- System V3 S7: harden object-level authorization for legacy Organizer country
-- entry mutation RPCs. Both RPCs historically authorized caller-supplied
-- _edition_id and then, when _participant_id was present, let the internal writer
-- derive a different target edition from that participant. An organizer scoped to
-- edition A could therefore present edition A to the capability check while
-- targeting a participant owned by edition B. Resolve the exact object scope
-- first, reject contradictory scope, then authorize that authoritative edition.

create or replace function private.studio2_resolve_country_entry_edition(
  p_country_id uuid,
  p_participant_id uuid,
  p_claimed_edition_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $resolve$
declare
  v_target_edition_id uuid;
begin
  if p_country_id is null then
    raise exception 'Country id is required' using errcode = '22023';
  end if;

  if p_participant_id is not null then
    select participant.edition_id
      into v_target_edition_id
    from public.participants participant
    left join public.contest_entities entity
      on entity.id = participant.contest_entity_id
    where participant.id = p_participant_id
      and (
        participant.country_id = p_country_id
        or entity.country_id = p_country_id
      )
    limit 1;

    if v_target_edition_id is null then
      raise exception 'Entry not found for that country' using errcode = '22023';
    end if;

    if p_claimed_edition_id is not null
       and p_claimed_edition_id is distinct from v_target_edition_id then
      raise exception 'Entry is outside the requested edition scope'
        using errcode = '42501';
    end if;
  else
    v_target_edition_id := p_claimed_edition_id;
  end if;

  if v_target_edition_id is null
     or not exists (
       select 1
       from public.editions edition
       where edition.id = v_target_edition_id
     ) then
    raise exception 'Choose a valid edition' using errcode = '22023';
  end if;

  return v_target_edition_id;
end
$resolve$;

revoke all on function private.studio2_resolve_country_entry_edition(uuid, uuid, uuid)
  from public, anon, authenticated;

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
as $listen_links$
declare
  v_target_edition_id uuid;
begin
  v_target_edition_id := private.studio2_resolve_country_entry_edition(
    _country_id,
    _participant_id,
    _edition_id
  );

  if not public.studio2_access_allowed('entry.edit', v_target_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;

  return public.update_country_entry_listen_links_internal(
    _country_id,
    _participant_id,
    v_target_edition_id,
    _youtube_url,
    _spotify_url,
    _apple_music_url
  );
end
$listen_links$;

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
as $upsert_entry$
declare
  v_target_edition_id uuid;
begin
  -- _show_id remains a compatibility argument for the legacy RPC signature.
  -- The canonical edition-level entry writer does not use show identity.
  v_target_edition_id := private.studio2_resolve_country_entry_edition(
    _country_id,
    _participant_id,
    _edition_id
  );

  if not public.studio2_access_allowed('entry.edit', v_target_edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;

  return public.upsert_country_edition_entry_internal(
    _country_id,
    _participant_id,
    v_target_edition_id,
    _artist,
    _song,
    _notes
  );
end
$upsert_entry$;

revoke all on function public.admin_update_country_entry_listen_links(
  uuid, uuid, uuid, text, text, text
) from public, anon;
grant execute on function public.admin_update_country_entry_listen_links(
  uuid, uuid, uuid, text, text, text
) to authenticated, service_role;

revoke all on function public.admin_upsert_country_entry(
  uuid, uuid, uuid, uuid, text, text, text
) from public, anon;
grant execute on function public.admin_upsert_country_entry(
  uuid, uuid, uuid, uuid, text, text, text
) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
