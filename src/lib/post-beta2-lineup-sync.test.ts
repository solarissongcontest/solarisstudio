import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("post-Beta2 lineup sync", () => {
  it("provides one-click confirmation round to show sync", () => {
    const route = source("src/routes/confirmations/admin/sync.tsx");
    expect(route).toContain("Sync line-ups");
    expect(route).toContain("syncConfirmationSnapshotToSolaris");
    expect(route).toContain("addCountriesToShow");
    expect(route).toContain("Confirmation round");
    expect(route).toContain("Add to show");
  });

  it("copies the canonical entry and listening links into show appearances", () => {
    const functions = source("src/lib/admin-lineup.functions.ts");
    for (const field of ["artist", "song", "youtube_url", "spotify_url", "apple_music_url"]) {
      expect(functions).toContain(field);
    }
    expect(functions).toContain('.is("show_id", null)');
    expect(functions).toContain('.eq("participation_status", "confirmed")');
  });

  it("keeps confirmation YouTube URLs in the dedicated listening field", () => {
    const migration = source("supabase/migrations/20260821205500_sync_confirmation_youtube_links.sql");
    expect(migration).toContain("entries_sync_confirmation_youtube");
    expect(migration).toContain("set youtube_url = new.song_url");
    expect(migration).toContain("youtube\\.com");
    expect(migration).toContain("youtu\\.be");
  });

  it("shows national-final running orders as one-based and keeps result order separate", () => {
    const component = source("src/components/country/CountryNationalFinals.tsx");
    expect(component).toContain("runningOrder.map((entry, index)");
    expect(component).toContain("humanPosition(entry.position, index + 1)");
    expect(component).toContain("resultRows.map((entry, index)");
    expect(component).toContain("humanPosition(entry.result_position, entry.winner ? 1 : index + 1)");
    expect(component).not.toContain('{entry.position ?? "·"}');
  });
});