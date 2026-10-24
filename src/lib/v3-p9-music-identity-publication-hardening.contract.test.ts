import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024173500_v3_p9_music_identity_publication_hardening.sql",
  ),
  "utf8",
);

function functionBody(name: string, nextMarker: string) {
  const start = migration.indexOf(`create or replace function ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = migration.indexOf(nextMarker, start);
  expect(end).toBeGreaterThan(start);
  return migration.slice(start, end);
}

describe("System V3 P9 music identity publication hardening", () => {
  it("registers as a forward-only semantic S13 migration", () => {
    expect(migration).toContain("'v3.public.p9-music-identity-publication-hardening'");
    expect(migration).toContain("'forward_fix_only'");
    expect(migration).not.toContain("ALLOW_NONLOCAL_REHEARSAL");
  });

  it("preserves independent Artist and Song publication evidence", () => {
    const evidence = functionBody(
      "private.v3_public_music_entry_evidence()",
      "revoke all on function private.v3_public_music_entry_evidence()",
    );
    const songVisibility = functionBody(
      "private.v3_public_music_song_is_visible(p_song_id uuid)",
      "create or replace function private.v3_public_music_artist_is_visible",
    );
    const artistVisibility = functionBody(
      "private.v3_public_music_artist_is_visible(p_artist_id uuid)",
      "revoke all on function private.v3_public_music_song_is_visible",
    );

    expect(evidence).toContain("public.public_safe_participants(null, null)");
    expect(evidence).toContain("nullif(btrim(row ->> 'artist'), '') is not null");
    expect(evidence).toContain("or nullif(btrim(row ->> 'song'), '') is not null");
    expect(songVisibility).toContain("evidence.song_label is not null");
    expect(artistVisibility).toContain("evidence.artist_label is not null");
    expect(songVisibility).not.toContain("evidence.artist_label is not null");
    expect(artistVisibility).not.toContain("evidence.song_label is not null");
  });

  it("gates edition aliases on publication-safe Artist evidence", () => {
    const aliasVisibility = functionBody(
      "private.v3_public_music_artist_alias_is_visible(",
      "revoke all on function private.v3_public_music_artist_alias_is_visible",
    );
    const artist = functionBody(
      "public.v3_public_artist(p_artist_id uuid)",
      "create or replace function public.v3_public_song",
    );
    const artists = functionBody(
      "public.v3_public_artists(",
      "create or replace function public.v3_public_songs",
    );

    expect(aliasVisibility).toContain("when p_edition_id is null then true");
    expect(aliasVisibility).toContain("evidence.edition_id = p_edition_id");
    expect(aliasVisibility).toContain("evidence.artist_label is not null");
    expect(artist).toContain(
      "private.v3_public_music_artist_alias_is_visible(v_artist.id, alias.edition_id)",
    );
    expect(artists).toContain(
      "private.v3_public_music_artist_alias_is_visible(artist.id, alias.edition_id)",
    );
  });

  it("does not serialize partially hidden appearance labels into strict Public consumers", () => {
    const artist = functionBody(
      "public.v3_public_artist(p_artist_id uuid)",
      "create or replace function public.v3_public_song",
    );
    const song = functionBody(
      "public.v3_public_song(p_song_id uuid)",
      "create or replace function public.v3_public_artists",
    );

    for (const projection of [artist, song]) {
      expect(projection).toContain("evidence.artist_label is not null");
      expect(projection).toContain("evidence.song_label is not null");
    }
  });

  it("canonicalizes merged credits to one Artist and one deterministic public position", () => {
    const credits = functionBody(
      "private.v3_public_music_song_artist_credits(p_song_id uuid)",
      "revoke all on function private.v3_public_music_song_artist_credits",
    );
    const song = functionBody(
      "public.v3_public_song(p_song_id uuid)",
      "create or replace function public.v3_public_artists",
    );
    const songs = functionBody(
      "public.v3_public_songs(",
      "comment on function private.v3_public_music_entry_evidence",
    );

    expect(credits).toContain("private.v3_resolve_music_song(relation.song_id) = p_song_id");
    expect(credits).toContain("artist.id = private.v3_resolve_music_artist(relation.artist_id)");
    expect(credits).toContain("select distinct on (artist_id)");
    expect(credits).toContain("row_number() over (");
    expect(credits).toContain("order by original_position, artist_id, source_song_id, source_artist_id");
    expect(song).toContain("private.v3_public_music_song_artist_credits(v_song.id)");
    expect(songs).toContain("private.v3_public_music_song_artist_credits(song.id)");
  });

  it("keeps every new private helper inaccessible to browser roles", () => {
    expect(migration).toContain(
      "revoke all on function private.v3_public_music_artist_alias_is_visible(uuid, uuid)",
    );
    expect(migration).toContain(
      "revoke all on function private.v3_public_music_song_artist_credits(uuid)",
    );
    expect(migration).not.toContain("grant execute on function private.v3_public_music_");
  });
});
