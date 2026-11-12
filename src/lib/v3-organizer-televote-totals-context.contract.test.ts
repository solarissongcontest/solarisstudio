import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/televote/$slug.tsx", "utf8");

describe("S08 read-only Organizer Televote edition/show scope", () => {
  it("resolves only the currently selected Organizer edition and show", () => {
    expect(route).toContain("useAdminContext()");
    expect(route).toContain('key={editionId || "unscoped"}');
    expect(route).toContain("organizerEditionId === edition.id");
    expect(route).toContain("useShows(scopedEditionId)");
    expect(route).toContain("useParticipants(scopedEditionId)");
    expect(route).toContain("useContestEntities(scopedEditionId)");
    expect(route).toContain("useTelevotes(selectedShow?.id)");
    expect(route).toContain("contextMismatch");
    expect(route).toContain('title="Edition context mismatch"');
    expect(route).toContain("Reads remain blocked until the contexts match");
  });

  it("refuses moved show links instead of rendering another show's totals", () => {
    expect(route).toContain("const selectedShow = search.show");
    expect(route).toContain("orderedShows.find((show) => show.id === search.show) ?? null");
    expect(route).toContain("if (search.show && !selectedShow)");
    expect(route).toContain('title="Show link is no longer valid"');
    expect(route).toContain("No other show's Televote totals were substituted");
    expect(route).toContain("useTelevotes(selectedShow?.id)");
    expect(route).not.toContain("orderedShows.find((show) => show.id === search.show) ?? orderedShows[0]");
  });

  it("requires a fresh explicit correction-context choice instead of trusting moved links", () => {
    expect(route).toContain('to="/televoting/admin/combined"');
    expect(route).toContain("This link does not pass");
    expect(route).toContain("an authoritative edition/show command context.");
    expect(route).not.toContain("p_expected_version");
    expect(route).not.toContain("setPendingReview");
    expect(route).not.toContain('supabase.from("televote_votes")');
  });
});
