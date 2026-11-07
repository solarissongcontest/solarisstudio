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

  it("keeps Entry identity server-owned in bounded public search results", () => {
    const implementation = route();

    expect(implementation).toContain('type ResultKind = "edition" | "country" | "entry" | "show";');
    // Search row parsing moved into the tested shared helper. Verify identity at
    // the actual parsing boundary rather than requiring an inline route parser.
    const parser = readFileSync(resolve(root, "src/lib/v3-reference-search-rows.ts"), "utf8");
    expect(implementation).toContain("const parseSearchRows = parseReferenceSearchRows");
    expect(parser).toContain('"entry",');
    expect(parser).toContain('row.result_type as ReferenceResultKind');
    expect(parser).toContain("const id = typeof row.result_id");
    expect(implementation).toContain("to={item.href as any}");
    expect(implementation).not.toContain("participant.artist");
    expect(implementation).not.toContain("participant.song");
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

  it("keeps publication filtering on server-owned public projections", () => {
    const implementation = route();

    expect(implementation).toContain('"solaris_public_search"');
    expect(implementation).toContain('"v3_public_explore_counts"');
    expect(implementation).not.toContain("buildPublicCountryArchive");
    expect(implementation).not.toContain("supabaseAdmin");
    expect(implementation).not.toContain('.from("');
    expect(implementation).not.toContain(".from('");
  });
});
