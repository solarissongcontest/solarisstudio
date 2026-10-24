begin;

-- P9 follow-up: keep Artist and Song visibility independent, prevent
-- edition-scoped aliases from crossing the publication boundary, and
-- canonicalise credits after supported identity merges.
select public.v3_register_migration_contract(
  'v3.public.p9-music-identity-publication-hardening',
  1,
  'forward_fix_only',
  false,
  null,
  'Harden P9 Artist/Song publication independence, edition alias visibility, and merge-safe credit projection.'
);

create or replace function private.v3_public_music_entry_evidence()
returns table (
  entry_id uuid,
  edition_id uuid,
  country_id uuid,
  artist_label text,
  song_label text
)
language sql
stable
security definer
set search_path = pg_catalog
as $evidence$
  with safe_rows as (
    select element.value as row
    from jsonb_array_elements(public.public_safe_participants(null, null)) element(value)
  ), normalized as (
    select distinct
      nullif(row ->> 'edition_id', '')::uuid as edition_id,
      nullif(row ->> 'country_id', '')::uuid as country_id,
      nullif(btrim(row ->> 'artist'), '') as artist_label,
      nullif(btrim(row ->> 'song'), '') as song_label
    from safe_rows
    where nullif(row ->> 'edition_id', '') is not null
      and nullif(row ->> 'country_id', '') is not null
      and (
        nullif(btrim(row ->> 'artist'), '') is not null
        or nullif(btrim(row ->> 'song'), '') is not null
      )
  )
  select entry.id,
         entry.edition_id,
         entry.country_id,
         normalized.artist_label,
         normalized.song_label
  from normalized
  join public.entries entry
    on entry.edition_id = normalized.edition_id
   and entry.country_id = normalized.country_id;
$evidence$;

revoke all on function private.v3_public_music_entry_evidence() from public, anon, authenticated;

create or replace function private.v3_public_music_song_is_visible(p_song_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $visible$
  select exists (
    select 1
    from private.v3_music_entry_links link
    join private.v3_public_music_entry_evidence() evidence
      on evidence.entry_id = link.entry_id
    where private.v3_resolve_music_song(link.song_id) = p_song_id
      and evidence.song_label is not null
  );
$visible$;

create or replace function private.v3_public_music_artist_is_visible(p_artist_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $visible$
  select exists (
    select 1
    from private.v3_music_song_artists relation
    join private.v3_music_entry_links link
      on private.v3_resolve_music_song(link.song_id) = private.v3_resolve_music_song(relation.song_id)
    join private.v3_public_music_entry_evidence() evidence
      on evidence.entry_id = link.entry_id
    where private.v3_resolve_music_artist(relation.artist_id) = p_artist_id
      and evidence.artist_label is not null
  );
$visible$;

revoke all on function private.v3_public_music_song_is_visible(uuid) from public, anon, authenticated;
revoke all on function private.v3_public_music_artist_is_visible(uuid) from public, anon, authenticated;

create or replace function private.v3_public_music_artist_alias_is_visible(
  p_artist_id uuid,
  p_edition_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $visible$
  select case
    when p_edition_id is null then true
    else exists (
      select 1
      from private.v3_music_song_artists relation
      join private.v3_music_entry_links link
        on private.v3_resolve_music_song(link.song_id) = private.v3_resolve_music_song(relation.song_id)
      join private.v3_public_music_entry_evidence() evidence
        on evidence.entry_id = link.entry_id
      where private.v3_resolve_music_artist(relation.artist_id) = p_artist_id
        and evidence.edition_id = p_edition_id
        and evidence.artist_label is not null
    )
  end;
$visible$;

revoke all on function private.v3_public_music_artist_alias_is_visible(uuid, uuid)
  from public, anon, authenticated;

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
      and private.v3_public_music_artist_is_visible(artist.id)
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

create or replace function public.v3_public_artist(p_artist_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $artist$
declare
  v_target uuid;
  v_artist private.v3_music_artists%rowtype;
  v_payload jsonb;
begin
  if p_artist_id is null then
    return null;
  end if;

  v_target := private.v3_resolve_music_artist(p_artist_id);
  if v_target is null or not private.v3_public_music_artist_is_visible(v_target) then
    return null;
  end if;

  if v_target <> p_artist_id then
    return jsonb_build_object(
      'schema_version', 1,
      'type', 'artist_redirect',
      'requested_id', p_artist_id,
      'redirect_to', v_target,
      'server_time', now()
    );
  end if;

  select artist.* into v_artist
  from private.v3_music_artists artist
  where artist.id = v_target
    and artist.state = 'active';

  if v_artist.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'schema_version', 1,
    'type', 'artist',
    'id', v_artist.id,
    'display_name', v_artist.canonical_name,
    'bio', v_artist.public_bio,
    'aliases', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', alias.display_name,
        'edition_id', alias.edition_id
      ) order by alias.edition_id nulls last, alias.display_name)
      from private.v3_music_artist_aliases alias
      where private.v3_resolve_music_artist(alias.artist_id) = v_artist.id
        and alias.is_public
        and private.v3_public_music_artist_alias_is_visible(v_artist.id, alias.edition_id)
    ), '[]'::jsonb),
    'songs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', song.id,
        'title', song.canonical_title
      ) order by song.canonical_title, song.id)
      from private.v3_music_songs song
      where song.state = 'active'
        and private.v3_public_music_song_is_visible(song.id)
        and exists (
          select 1
          from private.v3_music_song_artists relation
          where private.v3_resolve_music_song(relation.song_id) = song.id
            and private.v3_resolve_music_artist(relation.artist_id) = v_artist.id
        )
    ), '[]'::jsonb),
    'appearances', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'entry_id', evidence.entry_id,
        'edition_id', evidence.edition_id,
        'country_id', evidence.country_id,
        'artist_label', evidence.artist_label,
        'song_label', evidence.song_label
      ))
      from private.v3_music_song_artists relation
      join private.v3_music_entry_links link
        on private.v3_resolve_music_song(link.song_id) = private.v3_resolve_music_song(relation.song_id)
      join private.v3_public_music_entry_evidence() evidence
        on evidence.entry_id = link.entry_id
      where private.v3_resolve_music_artist(relation.artist_id) = v_artist.id
        and evidence.artist_label is not null
        and evidence.song_label is not null
    ), '[]'::jsonb),
    'server_time', now()
  ) into v_payload;

  return v_payload;
end
$artist$;

create or replace function public.v3_public_song(p_song_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $song$
declare
  v_target uuid;
  v_song private.v3_music_songs%rowtype;
  v_payload jsonb;
begin
  if p_song_id is null then
    return null;
  end if;

  v_target := private.v3_resolve_music_song(p_song_id);
  if v_target is null or not private.v3_public_music_song_is_visible(v_target) then
    return null;
  end if;

  if v_target <> p_song_id then
    return jsonb_build_object(
      'schema_version', 1,
      'type', 'song_redirect',
      'requested_id', p_song_id,
      'redirect_to', v_target,
      'server_time', now()
    );
  end if;

  select song.* into v_song
  from private.v3_music_songs song
  where song.id = v_target
    and song.state = 'active';

  if v_song.id is null then
    return null;
  end if;

  select jsonb_build_object(
    'schema_version', 1,
    'type', 'song',
    'id', v_song.id,
    'title', v_song.canonical_title,
    'artists', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', credit.artist_id,
        'display_name', credit.display_name,
        'credit_label', credit.credit_label,
        'position', credit.credit_position
      ) order by credit.credit_position)
      from private.v3_public_music_song_artist_credits(v_song.id) credit
    ), '[]'::jsonb),
    'appearances', coalesce((
      select jsonb_agg(distinct jsonb_build_object(
        'entry_id', evidence.entry_id,
        'edition_id', evidence.edition_id,
        'country_id', evidence.country_id,
        'artist_label', evidence.artist_label,
        'song_label', evidence.song_label
      ))
      from private.v3_music_entry_links link
      join private.v3_public_music_entry_evidence() evidence
        on evidence.entry_id = link.entry_id
      where private.v3_resolve_music_song(link.song_id) = v_song.id
        and evidence.artist_label is not null
        and evidence.song_label is not null
    ), '[]'::jsonb),
    'server_time', now()
  ) into v_payload;

  return v_payload;
end
$song$;

create or replace function public.v3_public_artists(
  p_query text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $artists$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if v_query is not null and length(v_query) > 120 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  return jsonb_build_object(
    'schema_version', 1,
    'items', coalesce((
      select jsonb_agg(item.payload order by item.sort_name, item.id)
      from (
        select artist.id,
               lower(artist.canonical_name) as sort_name,
               jsonb_build_object(
                 'id', artist.id,
                 'display_name', artist.canonical_name
               ) as payload
        from private.v3_music_artists artist
        where artist.state = 'active'
          and private.v3_public_music_artist_is_visible(artist.id)
          and (
            v_query is null
            or artist.canonical_name ilike '%' || v_query || '%'
            or exists (
              select 1
              from private.v3_music_artist_aliases alias
              where private.v3_resolve_music_artist(alias.artist_id) = artist.id
                and alias.is_public
                and private.v3_public_music_artist_alias_is_visible(artist.id, alias.edition_id)
                and alias.display_name ilike '%' || v_query || '%'
            )
          )
        order by lower(artist.canonical_name), artist.id
        limit v_limit
      ) item
    ), '[]'::jsonb),
    'server_time', now()
  );
end
$artists$;

create or replace function public.v3_public_songs(
  p_query text default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $songs$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  if v_query is not null and length(v_query) > 120 then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  return jsonb_build_object(
    'schema_version', 1,
    'items', coalesce((
      select jsonb_agg(item.payload order by item.sort_title, item.id)
      from (
        select song.id,
               lower(song.canonical_title) as sort_title,
               jsonb_build_object(
                 'id', song.id,
                 'title', song.canonical_title,
                 'artists', coalesce((
                   select jsonb_agg(jsonb_build_object(
                     'id', credit.artist_id,
                     'display_name', credit.display_name,
                     'position', credit.credit_position
                   ) order by credit.credit_position)
                   from private.v3_public_music_song_artist_credits(song.id) credit
                 ), '[]'::jsonb)
               ) as payload
        from private.v3_music_songs song
        where song.state = 'active'
          and private.v3_public_music_song_is_visible(song.id)
          and (v_query is null or song.canonical_title ilike '%' || v_query || '%')
        order by lower(song.canonical_title), song.id
        limit v_limit
      ) item
    ), '[]'::jsonb),
    'server_time', now()
  );
end
$songs$;

comment on function private.v3_public_music_entry_evidence() is
  'P9 publication evidence preserving independent Artist/Song field visibility from public_safe_participants.';
comment on function private.v3_public_music_artist_alias_is_visible(uuid, uuid) is
  'Allows global aliases for a visible Artist and edition aliases only when that Artist has publication-safe evidence in the edition.';
comment on function private.v3_public_music_song_artist_credits(uuid) is
  'Canonical merge-safe ordered public Artist credits for one resolved Song; deduplicates resolved Artist identities and re-ranks positions deterministically.';

notify pgrst, 'reload schema';

commit;
