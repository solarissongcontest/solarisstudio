import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/televote/$slug.tsx"),
  "utf8",
);
const combined = readFileSync(
  resolve(process.cwd(), "src/routes/televoting/admin/combined.tsx"),
  "utf8",
);

describe("V3 S08 Organizer official Televote projection read-only boundary", () => {
  it("retires the non-atomic legacy Televote totals editor and review sheet", () => {
    expect(route).not.toContain('supabase.from("televote_votes")');
    expect(route).not.toMatch(/\.from\(["']televote_votes["']\)[\s\S]{0,180}\.(insert|update|delete|upsert)\(/);
    expect(route).not.toContain("mutationPhaseStarted");
    expect(route).not.toContain("saveChanges");
    expect(route).not.toContain("requestSave");
    expect(route).not.toContain("pendingReview");
    expect(route).not.toContain("onChange={(event) => setEdit");
    expect(route).toContain("Read-only canonical aggregate Televote points");
  });

  it("routes meaningful corrections to the existing Televoting-owned editor instead of inventing authority", () => {
    expect(route).toContain('to="/televoting/admin/combined"');
    expect(route).toContain("Corrections, sanctions and deductions must be created and published through the Televoting correction workflow.");
    expect(combined).toContain('["correction", "Correction"]');
    expect(combined).toContain("setMergedCombinedStatus");
    expect(combined).toContain("recalculateMergedCombined");
    expect(route).not.toContain("reconcileOrganizerTelevoteTotals");
  });

  it("does not silently select another show from a stale or moved direct link", () => {
    expect(route).toContain("const invalidShowLink = Boolean(search.show)");
    expect(route).toContain("orderedShows.some((show) => show.id === search.show)");
    expect(route).toContain("orderedShows.find((show) => show.id === search.show) ?? null");
    expect(route).toContain("if (invalidShowLink)");
    expect(route).toContain('title="Show link is no longer valid"');
    expect(route).toContain("No other show's totals were selected or changed.");
  });

  it("preserves the selected Organizer edition, permissioned reads and public-result status", () => {
    expect(route).toContain('key={editionId || "unscoped"}');
    expect(route).toContain("organizerEditionId === edition.id");
    expect(route).toContain("useShows(scopedEditionId)");
    expect(route).toContain("useParticipants(scopedEditionId)");
    expect(route).toContain("useTelevotes(selectedShow?.id)");
    expect(route).toContain('title="Edition context mismatch"');
    expect(route).toContain("resolveShowPublication(selectedShow)");
    expect(route).toContain("Negative sanctions remain");
  });

  it("never claims a client confirmation screen is the official mutation authority", () => {
    expect(route).not.toContain("type-to-confirm");
    expect(route).not.toContain("executeGovernedTelevoteTotalsCommand");
    expect(route).toContain("this screen never writes the canonical");
  });
});
