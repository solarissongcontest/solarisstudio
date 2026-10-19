import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const route = () =>
  readFileSync(resolve(root, "src/routes/encyclopedia/index.tsx"), "utf8");

describe("Public Encyclopedia durable identity boundary", () => {
  it("does not manufacture Artist entities from mutable presentation text", () => {
    const implementation = route();

    expect(implementation).not.toContain('kind: "artist"');
    expect(implementation).not.toContain("artistCounts");
    expect(implementation).not.toContain("id: `artist:${key}`");
    expect(implementation).not.toContain(
      "participant.artist.trim().toLocaleLowerCase()",
    );
  });

  it("keeps artist and song text discoverable through durable Entry context", () => {
    const implementation = route();

    expect(implementation).toContain('kind: "entry"');
    expect(implementation).toContain("participant.artist");
    expect(implementation).toContain("participant.song");
    expect(implementation).toContain('href: `/countries/${country.short_code}`');
  });

  it("preserves old artist query bookmarks as search input without treating them as identity", () => {
    const implementation = route();

    expect(implementation).toContain(
      'artist: typeof search.artist === "string" ? search.artist : undefined',
    );
    expect(implementation).toContain('useState(search.artist ?? "")');
    expect(implementation).not.toContain(
      'href: `/encyclopedia?artist=${encodeURIComponent(artist.name)}`',
    );
  });

  it("keeps the public archive publication filter in front of reference discovery", () => {
    const implementation = route();

    expect(implementation).toContain("buildPublicCountryArchive");
    expect(implementation).not.toContain("supabaseAdmin");
  });
});
