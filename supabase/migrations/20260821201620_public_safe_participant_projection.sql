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
      and coalesce(p.participation_status, 'confirmed') = 'confirmed'
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
