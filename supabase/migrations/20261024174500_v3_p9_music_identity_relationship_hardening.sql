begin;

-- P9 relationship hardening: a globally visible Artist must not make an
-- otherwise hidden Song -> Artist relationship public. Credit projection is
-- permitted only when a publication-safe appearance of this same resolved Song
-- exposes both the Song and Artist fields.
select public.v3_register_migration_contract(
  'v3.public.p9-music-identity-relationship-hardening',
  1,
  'forward_fix_only',
  false,
  null,
  'Bind public Song Artist credits to publication-safe evidence for the same resolved Song.'
);

create or replace function private.v3_public_music_song_artist_credits(p_song_id uuid)
returns table (
  artist_id uuid,
  display_name text,
  credit_label text,
  credit_position integer
)
language sql
stable
security definer
set search_path = pg_catalog
as $credits$
  with candidates as (
    select
      artist.id as artist_id,
      artist.canonical_name as display_name,
      relation.credit_label,
      relation.credit_position as original_position,
      relation.song_id as source_song_id,
      relation.artist_id as source_artist_id
    from private.v3_music_song_artists relation
    join private.v3_music_artists artist
      on artist.id = private.v3_resolve_music_artist(relation.artist_id)
    where private.v3_resolve_music_song(relation.song_id) = p_song_id
      and artist.state = 'active'
      and exists (
        select 1
        from private.v3_music_entry_links link
        join private.v3_public_music_entry_evidence() evidence
          on evidence.entry_id = link.entry_id
        where private.v3_resolve_music_song(link.song_id) = p_song_id
          and evidence.song_label is not null
          and evidence.artist_label is not null
      )
  ), deduped as (
    select distinct on (artist_id)
      artist_id,
      display_name,
      credit_label,
      original_position,
      source_song_id,
      source_artist_id
    from candidates
    order by artist_id, original_position, source_song_id, source_artist_id
  ), ranked as (
    select
      artist_id,
      display_name,
      credit_label,
      row_number() over (
        order by original_position, artist_id, source_song_id, source_artist_id
      )::integer as credit_position
    from deduped
  )
  select ranked.artist_id,
         ranked.display_name,
         ranked.credit_label,
         ranked.credit_position
  from ranked
  order by ranked.credit_position;
$credits$;

revoke all on function private.v3_public_music_song_artist_credits(uuid)
  from public, anon, authenticated;

comment on function private.v3_public_music_song_artist_credits(uuid) is
  'Canonical merge-safe public credits for one resolved Song. Requires same-Song publication evidence exposing both Artist and Song fields before serializing the relationship.';

notify pgrst, 'reload schema';

commit;
