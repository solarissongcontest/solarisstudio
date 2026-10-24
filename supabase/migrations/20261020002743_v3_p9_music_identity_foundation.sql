begin;

-- Public V3 P9 durable Artist/Song identity foundation (#976).
--
-- IMPORTANT: this migration deliberately does NOT derive Artist or Song identity
-- from mutable display text. Existing Entry/participant artist and song strings
-- remain presentation evidence until a trusted System process explicitly links
-- an Entry to an opaque Song identity and that Song to opaque Artist identities.
-- This keeps namesakes, aliases, collaborations and duplicate song titles safe.
select public.v3_register_migration_contract(
  'v3.public.p9-music-identity-foundation',
  1,
  'forward_fix_only',
  false,
  null,
  'Additive opaque Artist/Song identity registry and caller-invariant publication-safe projections; no label-derived identity backfill.'
);

create table if not exists private.v3_music_artists (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  public_bio text,
  state text not null default 'active'
    check (state in ('active', 'merged', 'tombstoned')),
  redirect_artist_id uuid references private.v3_music_artists(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v3_music_artists_name_check
    check (length(btrim(canonical_name)) between 1 and 200),
  constraint v3_music_artists_bio_check
    check (public_bio is null or length(public_bio) <= 12000),
  constraint v3_music_artists_redirect_shape_check
    check (
      (state = 'merged' and redirect_artist_id is not null and redirect_artist_id <> id)
      or (state <> 'merged' and redirect_artist_id is null)
    )
);

create table if not exists private.v3_music_artist_aliases (
  id uuid primary key default gen_random_uuid(),
  artist_id uuid not null references private.v3_music_artists(id) on delete restrict,
  display_name text not null,
  edition_id uuid references public.editions(id) on delete restrict,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  constraint v3_music_artist_aliases_name_check
    check (length(btrim(display_name)) between 1 and 200),
  unique (artist_id, edition_id, display_name)
);

create table if not exists private.v3_music_songs (
  id uuid primary key default gen_random_uuid(),
  canonical_title text not null,
  state text not null default 'active'
    check (state in ('active', 'merged', 'tombstoned')),
  redirect_song_id uuid references private.v3_music_songs(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint v3_music_songs_title_check
    check (length(btrim(canonical_title)) between 1 and 300),
  constraint v3_music_songs_redirect_shape_check
    check (
      (state = 'merged' and redirect_song_id is not null and redirect_song_id <> id)
      or (state <> 'merged' and redirect_song_id is null)
    )
);

create table if not exists private.v3_music_song_artists (
  song_id uuid not null references private.v3_music_songs(id) on delete restrict,
  artist_id uuid not null references private.v3_music_artists(id) on delete restrict,
  credit_position integer not null check (credit_position between 1 and 50),
  credit_label text,
  created_at timestamptz not null default now(),
  primary key (song_id, artist_id),
  unique (song_id, credit_position),
  constraint v3_music_song_artists_credit_label_check
    check (credit_label is null or length(btrim(credit_label)) between 1 and 240)
);

-- One canonical edition/country Entry can point at one durable Song identity.
-- The Entry remains the owner of credits/media/publication truth; this table is
-- identity linkage only and intentionally contains no copied media URLs.
create table if not exists private.v3_music_entry_links (
  entry_id uuid primary key references public.entries(id) on delete restrict,
  song_id uuid not null references private.v3_music_songs(id) on delete restrict,
  linked_at timestamptz not null default now(),
  linked_by uuid references auth.users(id) on delete set null,
  provenance text not null default 'curated'
    check (provenance in ('curated', 'migration', 'verified_import')),
  note text,
  constraint v3_music_entry_links_note_check
    check (note is null or length(note) <= 2000)
);

-- Durable correction evidence. Public reads resolve through entity state +
-- redirect ids; this ledger exists so identity corrections remain explainable
-- without mutating historical display labels into a new identity.
create table if not exists private.v3_music_identity_corrections (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('artist', 'song')),
  source_id uuid not null,
  target_id uuid,
  correction_kind text not null check (correction_kind in ('merge', 'tombstone', 'split_relink')),
  reason text not null,
  actor_id uuid references auth.users(id) on delete set null,
  operation_id uuid,
  created_at timestamptz not null default now(),
  constraint v3_music_identity_corrections_reason_check
    check (length(btrim(reason)) between 8 and 2000),
  constraint v3_music_identity_corrections_target_check
    check (
      (correction_kind = 'merge' and target_id is not null and target_id <> source_id)
      or (correction_kind = 'tombstone' and target_id is null)
      or (correction_kind = 'split_relink' and target_id is not null and target_id <> source_id)
    )
);

create index if not exists v3_music_artist_aliases_artist_idx
  on private.v3_music_artist_aliases (artist_id, edition_id);
create index if not exists v3_music_song_artists_artist_idx
  on private.v3_music_song_artists (artist_id, song_id);
create index if not exists v3_music_entry_links_song_idx
  on private.v3_music_entry_links (song_id, entry_id);
create index if not exists v3_music_identity_corrections_source_idx
  on private.v3_music_identity_corrections (entity_type, source_id, created_at desc);

alter table private.v3_music_artists enable row level security;
alter table private.v3_music_artist_aliases enable row level security;
alter table private.v3_music_songs enable row level security;
alter table private.v3_music_song_artists enable row level security;
alter table private.v3_music_entry_links enable row level security;
alter table private.v3_music_identity_corrections enable row level security;

revoke all on table private.v3_music_artists from public, anon, authenticated;
revoke all on table private.v3_music_artist_aliases from public, anon, authenticated;
revoke all on table private.v3_music_songs from public, anon, authenticated;
revoke all on table private.v3_music_song_artists from public, anon, authenticated;
revoke all on table private.v3_music_entry_links from public, anon, authenticated;
revoke all on table private.v3_music_identity_corrections from public, anon, authenticated;

-- Resolve redirects without trusting display text. A cycle or tombstone resolves
-- to NULL and therefore fails closed on public reads.
create or replace function private.v3_resolve_music_artist(p_artist_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $resolve$
  with recursive chain as (
    select artist.id, artist.state, artist.redirect_artist_id, array[artist.id]::uuid[] as path, 0 as depth
    from private.v3_music_artists artist
    where artist.id = p_artist_id

    union all

    select next_artist.id,
           next_artist.state,
           next_artist.redirect_artist_id,
           chain.path || next_artist.id,
           chain.depth + 1
    from chain
    join private.v3_music_artists next_artist
      on next_artist.id = chain.redirect_artist_id
    where chain.state = 'merged'
      and chain.depth < 31
      and not next_artist.id = any(chain.path)
  )
  select chain.id
  from chain
  where chain.state = 'active'
  order by chain.depth desc
  limit 1;
$resolve$;

create or replace function private.v3_resolve_music_song(p_song_id uuid)
returns uuid
language sql
stable
security definer
set search_path = pg_catalog
as $resolve$
  with recursive chain as (
    select song.id, song.state, song.redirect_song_id, array[song.id]::uuid[] as path, 0 as depth
    from private.v3_music_songs song
    where song.id = p_song_id

    union all

    select next_song.id,
           next_song.state,
           next_song.redirect_song_id,
           chain.path || next_song.id,
           chain.depth + 1
    from chain
    join private.v3_music_songs next_song
      on next_song.id = chain.redirect_song_id
    where chain.state = 'merged'
      and chain.depth < 31
      and not next_song.id = any(chain.path)
  )
  select chain.id
  from chain
  where chain.state = 'active'
  order by chain.depth desc
  limit 1;
$resolve$;

revoke all on function private.v3_resolve_music_artist(uuid) from public, anon, authenticated;
revoke all on function private.v3_resolve_music_song(uuid) from public, anon, authenticated;

-- This helper is the publication boundary for P9. It intentionally delegates to
-- public_safe_participants(), whose server-time schedule and show/edition policy
-- are already canonical for public artist/song labels. Organizer capabilities do
-- not widen public_safe_participants, so an Organizer using the public app sees
-- the same music entity set as an anonymous viewer.
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
      and nullif(btrim(row ->> 'artist'), '') is not null
      and nullif(btrim(row ->> 'song'), '') is not null
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
  );
$visible$;

revoke all on function private.v3_public_music_song_is_visible(uuid) from public, anon, authenticated;
revoke all on function private.v3_public_music_artist_is_visible(uuid) from public, anon, authenticated;

-- Direct Artist projection. A merged source id returns only a durable redirect
-- to a currently publishable target; it never leaks the hidden source label.
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
        'id', artist.id,
        'display_name', artist.canonical_name,
        'credit_label', relation.credit_label,
        'position', relation.credit_position
      ) order by relation.credit_position)
      from private.v3_music_song_artists relation
      join private.v3_music_artists artist
        on artist.id = private.v3_resolve_music_artist(relation.artist_id)
      where private.v3_resolve_music_song(relation.song_id) = v_song.id
        and artist.state = 'active'
        and private.v3_public_music_artist_is_visible(artist.id)
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
    ), '[]'::jsonb),
    -- Credits/media remain owned by canonical Entry/media surfaces. The durable
    -- Entry ids above are the safe join keys; no copied URL is created here.
    'server_time', now()
  ) into v_payload;

  return v_payload;
end
$song$;

-- Bounded list/search projections use the exact same visibility helpers as the
-- direct endpoints. No auth/capability branch exists, so Organizer sessions do
-- not widen public discovery.
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
                     'id', artist.id,
                     'display_name', artist.canonical_name,
                     'position', relation.credit_position
                   ) order by relation.credit_position)
                   from private.v3_music_song_artists relation
                   join private.v3_music_artists artist
                     on artist.id = private.v3_resolve_music_artist(relation.artist_id)
                   where private.v3_resolve_music_song(relation.song_id) = song.id
                     and artist.state = 'active'
                     and private.v3_public_music_artist_is_visible(artist.id)
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

comment on function public.v3_public_artist(uuid) is
  'Caller-invariant P9 Artist projection. Returns NULL for non-public identities; merged public ids return only a durable redirect to a visible target.';
comment on function public.v3_public_song(uuid) is
  'Caller-invariant P9 Song projection. Entry/publication truth remains owned by public_safe_participants; no copied media authority.';
comment on function public.v3_public_artists(text, integer) is
  'Bounded caller-invariant P9 Artist list/search projection over publishable linked Entries only.';
comment on function public.v3_public_songs(text, integer) is
  'Bounded caller-invariant P9 Song list/search projection over publishable linked Entries only.';

revoke all on function public.v3_public_artist(uuid) from public;
revoke all on function public.v3_public_song(uuid) from public;
revoke all on function public.v3_public_artists(text, integer) from public;
revoke all on function public.v3_public_songs(text, integer) from public;
grant execute on function public.v3_public_artist(uuid) to anon, authenticated;
grant execute on function public.v3_public_song(uuid) to anon, authenticated;
grant execute on function public.v3_public_artists(text, integer) to anon, authenticated;
grant execute on function public.v3_public_songs(text, integer) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
