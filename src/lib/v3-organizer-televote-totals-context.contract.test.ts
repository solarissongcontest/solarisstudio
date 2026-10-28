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

  it("reasserts edition, show and frozen review scope before the canonical aggregate command", () => {
    expect(route).toContain("validateEditionCommandScope");
    expect(route).toContain("routeEditionId: edition.id");
    expect(route).toContain("commandEditionId: review?.editionId ?? organizerEditionId");
    expect(route).toContain("entityEditionId: review?.showEditionId ?? selectedShow.edition_id");
    expect(route).toContain("capabilityEditionId: organizerEditionId");
    expect(route).toContain("review.editionId !== edition.id || review.showId !== selectedShow.id");
    expect(route).toContain("const commandEditionId = assertTelevoteEditionScope(review)");
    expect(route).toContain("editionId: commandEditionId");
    expect(route.indexOf("validateEditionCommandScope")).toBeLessThan(
      route.indexOf("await applyTelevoteAggregateCommand({"),
    );
  });

  it("routes writes through canonical aggregate authority without browser DML", () => {
    expect(route).toContain("applyTelevoteAggregateCommand");
    expect(route).not.toContain('supabase.from("televote_votes")');
    expect(route).toContain("operationId: review.operationId");
    expect(route).toContain("snapshot: review.snapshot");
  });
});
