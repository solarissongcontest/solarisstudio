import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20261024174500_v3_p9_music_identity_relationship_hardening.sql",
  ),
  "utf8",
);

describe("System V3 P9 Song/Artist relationship publication", () => {
  it("registers a semantic forward-only hardening migration", () => {
    expect(migration).toContain(
      "'v3.public.p9-music-identity-relationship-hardening'",
    );
    expect(migration).toContain("'forward_fix_only'");
  });

  it("requires publication-safe Artist and Song evidence on the same resolved Song", () => {
    expect(migration).toContain(
      "private.v3_resolve_music_song(relation.song_id) = p_song_id",
    );
    expect(migration).toContain("private.v3_music_entry_links link");
    expect(migration).toContain("private.v3_public_music_entry_evidence() evidence");
    expect(migration).toContain(
      "private.v3_resolve_music_song(link.song_id) = p_song_id",
    );
    expect(migration).toContain("evidence.song_label is not null");
    expect(migration).toContain("evidence.artist_label is not null");
    expect(migration).not.toContain(
      "private.v3_public_music_artist_is_visible(artist.id)",
    );
  });

  it("still canonicalizes and deterministically re-ranks merged credits", () => {
    expect(migration).toContain("select distinct on (artist_id)");
    expect(migration).toContain("row_number() over (");
    expect(migration).toContain(
      "order by original_position, artist_id, source_song_id, source_artist_id",
    );
  });

  it("keeps the relationship helper private", () => {
    expect(migration).toContain(
      "revoke all on function private.v3_public_music_song_artist_credits(uuid)",
    );
    expect(migration).not.toContain(
      "grant execute on function private.v3_public_music_song_artist_credits",
    );
  });
});
