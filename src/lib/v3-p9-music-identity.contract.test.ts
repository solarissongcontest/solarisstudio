import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024172500_v3_p9_music_identity_foundation.sql",
  ),
  "utf8",
);

function functionBody(name: string, nextMarker: string) {
  const start = migration.indexOf(`create or replace function ${name}`);
  const end = migration.indexOf(nextMarker, start);
  return migration.slice(start, end);
}

describe("System V3 P9 durable Artist/Song identity", () => {
  it("registers an additive S13 migration with a current semantic key and never backfills identity from labels", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.public.p9-music-identity-foundation'");
    expect(migration).not.toContain("'20261020002743_v3_p9_music_identity_foundation'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).toContain("false");

    expect(migration).not.toMatch(/insert\s+into\s+private\.v3_music_artists[\s\S]*from\s+public\.participants/i);
    expect(migration).not.toMatch(/insert\s+into\s+private\.v3_music_songs[\s\S]*from\s+public\.entries/i);
    expect(migration).not.toContain("lower(btrim(entry.artist))");
    expect(migration).not.toContain("lower(btrim(entry.song_title))");
  });

  it("uses opaque UUID identity so namesakes and same-title songs remain distinct", () => {
    expect(migration).toContain("create table if not exists private.v3_music_artists");
    expect(migration).toContain("id uuid primary key default gen_random_uuid()");
    expect(migration).toContain("create table if not exists private.v3_music_songs");
    expect(migration).not.toContain("unique (canonical_name)");
    expect(migration).not.toContain("unique (canonical_title)");
    expect(migration).not.toContain("canonical_name text primary key");
    expect(migration).not.toContain("canonical_title text primary key");
  });

  it("models many-artist songs and durable Entry appearances without copying media truth", () => {
    expect(migration).toContain("private.v3_music_song_artists");
    expect(migration).toContain("primary key (song_id, artist_id)");
    expect(migration).toContain("unique (song_id, credit_position)");
    expect(migration).toContain("private.v3_music_entry_links");
    expect(migration).toContain("entry_id uuid primary key references public.entries(id)");
    expect(migration).not.toContain("youtube_url text");
    expect(migration).not.toContain("spotify_url text");
    expect(migration).not.toContain("apple_music_url text");
  });

  it("keeps raw identity tables inaccessible to browser roles", () => {
    for (const table of [
      "v3_music_artists",
      "v3_music_artist_aliases",
      "v3_music_songs",
      "v3_music_song_artists",
      "v3_music_entry_links",
      "v3_music_identity_corrections",
    ]) {
      expect(migration).toContain(
        `revoke all on table private.${table} from public, anon, authenticated`,
      );
    }
    expect(migration).not.toContain("grant select on table private.v3_music_");
    expect(migration).not.toContain("grant insert on table private.v3_music_");
  });

  it("delegates every public entity visibility decision to canonical public participant publication truth", () => {
    const evidence = functionBody(
      "private.v3_public_music_entry_evidence()",
      "revoke all on function private.v3_public_music_entry_evidence()",
    );

    expect(evidence).toContain("public.public_safe_participants(null, null)");
    expect(evidence).toContain("join public.entries entry");
    expect(evidence).not.toContain("auth.uid()");
    expect(evidence).not.toContain("has_role");
    expect(evidence).not.toContain("studio2_user_has_capability");
    expect(evidence).not.toContain("publication_status = 'published'");
    expect(evidence).not.toContain("scheduled_publish_at <= now()");
  });

  it("uses the same caller-invariant visibility helpers for direct, list and search reads", () => {
    const artistDirect = functionBody("public.v3_public_artist(p_artist_id uuid)", "create or replace function public.v3_public_song");
    const songDirect = functionBody("public.v3_public_song(p_song_id uuid)", "create or replace function public.v3_public_artists");
    const artistList = functionBody("public.v3_public_artists(", "create or replace function public.v3_public_songs");
    const songList = functionBody("public.v3_public_songs(", "comment on function public.v3_public_artist");

    expect(artistDirect).toContain("private.v3_public_music_artist_is_visible(v_target)");
    expect(songDirect).toContain("private.v3_public_music_song_is_visible(v_target)");
    expect(artistList).toContain("private.v3_public_music_artist_is_visible(artist.id)");
    expect(songList).toContain("private.v3_public_music_song_is_visible(song.id)");

    for (const source of [artistDirect, songDirect, artistList, songList]) {
      expect(source).not.toContain("auth.uid()");
      expect(source).not.toContain("has_role");
      expect(source).not.toContain("studio2_user_has_capability");
    }
  });

  it("fails closed for hidden/tombstoned identities and exposes no private reason on public reads", () => {
    const artistDirect = functionBody("public.v3_public_artist(p_artist_id uuid)", "create or replace function public.v3_public_song");
    const songDirect = functionBody("public.v3_public_song(p_song_id uuid)", "create or replace function public.v3_public_artists");

    expect(artistDirect).toContain("return null");
    expect(songDirect).toContain("return null");
    expect(artistDirect).not.toContain("reason");
    expect(songDirect).not.toContain("reason");
    expect(artistDirect).not.toContain("operation_id");
    expect(songDirect).not.toContain("operation_id");
  });

  it("defines deterministic merge redirect and correction evidence without rewriting durable ids", () => {
    expect(migration).toContain("state in ('active', 'merged', 'tombstoned')");
    expect(migration).toContain("redirect_artist_id uuid references private.v3_music_artists(id)");
    expect(migration).toContain("redirect_song_id uuid references private.v3_music_songs(id)");
    expect(migration).toContain("correction_kind in ('merge', 'tombstone', 'split_relink')");
    expect(migration).toContain("private.v3_resolve_music_artist");
    expect(migration).toContain("private.v3_resolve_music_song");
    expect(migration).toContain("'type', 'artist_redirect'");
    expect(migration).toContain("'type', 'song_redirect'");
    expect(migration).toContain("'redirect_to', v_target");
  });

  it("preserves edition-specific public aliases without making them identity", () => {
    expect(migration).toContain("private.v3_music_artist_aliases");
    expect(migration).toContain("edition_id uuid references public.editions(id)");
    expect(migration).toContain("display_name text not null");
    expect(migration).not.toContain("display_name uuid");
  });

  it("bounds discovery queries and grants only the publication-safe RPC surface", () => {
    expect(migration).toContain("least(greatest(coalesce(p_limit, 50), 1), 100)");
    expect(migration).toContain("length(v_query) > 120");

    for (const fn of [
      "public.v3_public_artist(uuid)",
      "public.v3_public_song(uuid)",
      "public.v3_public_artists(text, integer)",
      "public.v3_public_songs(text, integer)",
    ]) {
      expect(migration).toContain(`grant execute on function ${fn} to anon, authenticated`);
    }
  });
});
