import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/televote/$slug.tsx", "utf8");

describe("V3 Organizer Televote totals context", () => {
  it("binds the read-only view to the exact selected Organizer edition", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain('key={editionId || "unscoped"}');
    expect(route).toContain(
      "const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined",
    );
    expect(route).toContain("useShows(scopedEditionId)");
    expect(route).toContain("useParticipants(scopedEditionId)");
    expect(route).toContain("useContestEntities(scopedEditionId)");
    expect(route).toContain(
      "const contextMismatch = Boolean(edition && organizerEditionId !== edition.id)",
    );
    expect(route).toContain('title="Edition context mismatch"');
    expect(route).toContain("Reads and saves stay blocked until the contexts match");
  });

  it("does not expose a direct Televote projection writer", () => {
    expect(route).not.toContain(".update({ points:");
    expect(route).not.toContain(".insert({");
    expect(route).not.toContain("setDraft");
  });
});
