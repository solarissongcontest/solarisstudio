begin;

-- Participation status is an edition-level state. Keep the historical result
-- row intact so marking a country withdrawn/disqualified never destroys old
-- points, ranks or custom televote-component data. Public result consumers
-- filter those rows by participant status instead.

drop trigger if exists participants_sync_results on public.participants;
create trigger participants_sync_results
after insert or delete or update of show_id, country_id, contest_entity_id, running_order
on public.participants
for each row execute function public.sync_results_after_participant_change();

create or replace function public.admin_set_participation_status(
  _edition_id uuid,
  _country_id uuid default null,
  _contest_entity_id uuid default null,
  _status text default 'confirmed'
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_updated integer := 0;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'organizer'::public.app_role) then
    raise exception 'Organizer access required';
  end if;

  if _edition_id is null then
    raise exception 'Edition is required';
  end if;

  if _status not in ('confirmed', 'withdrawn', 'disqualified') then
    raise exception 'Invalid participation status';
  end if;

  if _country_id is null and _contest_entity_id is null then
    raise exception 'Country or contest entity is required';
  end if;

  update public.participants p
  set participation_status = _status,
      updated_at = now()
  where p.edition_id = _edition_id
    and (
      (_country_id is not null and p.country_id = _country_id)
      or (
        _country_id is null
        and _contest_entity_id is not null
        and p.country_id is null
        and p.contest_entity_id = _contest_entity_id
      )
    );

  get diagnostics v_updated = row_count;

  -- Keep the canonical edition entry aligned for global countries. Custom
  -- edition-only entities do not have an entries row because entries.country_id
  -- is intentionally global-country-only.
  if _country_id is not null then
    update public.entries
    set status = _status,
        updated_at = now()
    where edition_id = _edition_id
      and country_id = _country_id;
  end if;

  return v_updated;
end;
$$;

revoke all on function public.admin_set_participation_status(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.admin_set_participation_status(uuid, uuid, uuid, text) to authenticated;

-- Public participant lists must retain withdrawn/disqualified countries so the
-- archive can say what happened. Pending/waitlist rows remain private.
create or replace function public.public_safe_participants(
  _edition_id uuid default null,
  _show_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select
      p.*,
      s.published as show_published,
      s.publication_config as show_publication_config,
      e.published as edition_published,
      (
        p.publication_status = 'published'
        or (
          p.publication_status = 'scheduled'
          and p.scheduled_publish_at is not null
          and p.scheduled_publish_at <= now()
        )
      ) as entry_visible,
      case
        when p.show_id is null then exists (
          select 1
          from public.shows sx
          where sx.edition_id = p.edition_id
            and sx.published = true
            and coalesce((sx.publication_config->>'participants')::boolean, true)
        )
        else coalesce((s.publication_config->>'participants')::boolean, s.published, false)
      end as participants_visible,
      case
        when p.show_id is null then exists (
          select 1 from public.shows sx
          where sx.edition_id = p.edition_id
            and sx.published = true
            and coalesce((sx.publication_config->>'artists')::boolean, sx.published, false)
        )
        else coalesce((s.publication_config->>'artists')::boolean, s.published, false)
      end as artists_visible,
      case
        when p.show_id is null then exists (
          select 1 from public.shows sx
          where sx.edition_id = p.edition_id
            and sx.published = true
            and coalesce((sx.publication_config->>'songs')::boolean, sx.published, false)
        )
        else coalesce((s.publication_config->>'songs')::boolean, s.published, false)
      end as songs_visible,
      case
        when p.show_id is null then false
        else coalesce((s.publication_config->>'running_order')::boolean, s.published and s.publication_config is null, false)
      end as running_order_visible,
      case
        when p.show_id is null then false
        else coalesce((s.publication_config->>'qualifiers')::boolean, s.published and s.publication_config is null, false)
      end as qualifiers_visible
    from public.participants p
    left join public.shows s on s.id = p.show_id
    join public.editions e on e.id = p.edition_id
    where (_edition_id is null or p.edition_id = _edition_id)
      and (_show_id is null or p.show_id = _show_id)
      and coalesce(p.participation_status, 'confirmed') in ('confirmed', 'withdrawn', 'disqualified')
  ), safe as (
    select *
    from rows
    where participants_visible
      and edition_published = true
      and (show_id is null or show_published = true)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'edition_id', edition_id,
      'show_id', show_id,
      'country_id', country_id,
      'contest_entity_id', contest_entity_id,
      'artist', case when entry_visible and artists_visible then artist else null end,
      'song', case when entry_visible and songs_visible then song else null end,
      'running_order', case when running_order_visible then running_order else null end,
      'semi_final', semi_final,
      'qualified', case when qualifiers_visible then qualified else null end,
      'notes', null,
      'youtube_url', case when entry_visible and songs_visible then youtube_url else null end,
      'spotify_url', case when entry_visible and songs_visible then spotify_url else null end,
      'apple_music_url', case when entry_visible and songs_visible then apple_music_url else null end,
      'publication_status', publication_status,
      'scheduled_publish_at', scheduled_publish_at,
      'published_at', published_at,
      'publication_source', publication_source,
      'publication_overridden', publication_overridden,
      'participation_status', participation_status
    )
    order by show_id nulls first, running_order nulls last, id
  ), '[]'::jsonb)
  from safe;
$$;

revoke all on function public.public_safe_participants(uuid, uuid) from public;
grant execute on function public.public_safe_participants(uuid, uuid) to anon, authenticated;

commit;
