import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/televote/$slug.tsx"),
  "utf8",
);

describe("V3 Organizer Televote totals boundary", () => {
  it("does not present a false editable correction flow", () => {
    expect(route).toContain("Read-only canonical aggregate Televote points");
    expect(route).toContain('to="/televoting/admin/combined"');
    expect(route).toContain("<output");
    expect(route).not.toContain("onChange={(event) => setDraft");
    expect(route).not.toContain("setPendingReview");
  });

  it("keeps negative canonical sanctions visible without writing them", () => {
    expect(route).toContain("points < 0");
    expect(route).toContain("Sanction");
    expect(route).toContain("this screen never writes the canonical projection");
    expect(route).not.toContain(".update({ points:");
    expect(route).not.toContain(".insert({");
  });

  it("reads the exact selected show and edition scope", () => {
    expect(route).toContain('useShows(scopedEditionId)');
    expect(route).toContain('useParticipants(scopedEditionId)');
    expect(route).toContain('useTelevotes(selectedShow?.id)');
  });
});
