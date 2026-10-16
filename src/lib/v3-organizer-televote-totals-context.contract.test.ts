import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync(
  "src/routes/_authenticated/admin/televote/$slug.tsx",
  "utf8",
);

describe("V3 Organizer Televote totals context", () => {
  it("binds route reads to the exact selected Organizer edition", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain('key={editionId || "unscoped"}');
    expect(route).toContain(
      "const scopedEditionId = edition && organizerEditionId === edition.id ? edition.id : undefined",
    );
    expect(route).toContain("useShows(scopedEditionId)");
    expect(route).toContain("useParticipants(scopedEditionId)");
    expect(route).toContain("useContestEntities(scopedEditionId)");
    expect(route).toContain("const contextMismatch = Boolean(edition && organizerEditionId !== edition.id)");
    expect(route).toContain('title="Edition context mismatch"');
    expect(route).toContain("Reads and saves stay blocked until the contexts match");
  });

  it("reasserts edition and show scope before any legacy aggregate write", () => {
    expect(route).toContain("validateEditionCommandScope");
    expect(route).toContain("routeEditionId: edition.id");
    expect(route).toContain("commandEditionId: organizerEditionId");
    expect(route).toContain("entityEditionId: selectedShow.edition_id");
    expect(route).toContain("capabilityEditionId: organizerEditionId");
    expect(route).toContain("const commandEditionId = assertTelevoteEditionScope()");
    expect(route).toContain("edition_id: commandEditionId");
    expect(route.indexOf("validateEditionCommandScope")).toBeLessThan(
      route.indexOf('supabase.from("televote_votes")'),
    );
  });

  it("does not claim the legacy direct-write surface is the final V3 authority", () => {
    expect(route).toContain('supabase.from("televote_votes")');
    expect(route).not.toContain("executeGovernedTelevoteTotalsCommand");
  });
});
