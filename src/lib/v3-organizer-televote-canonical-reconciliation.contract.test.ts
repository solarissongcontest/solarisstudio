import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/televote/$slug.tsx", "utf8");
const command = readFileSync("src/integrations/televoting/televote-totals.functions.ts", "utf8");

describe("V3 Organizer Televote canonical reconciliation", () => {
  it("uses the service-role-only recovery command rather than a client-side writer", () => {
    expect(route).toContain("reconcileOrganizerTelevoteTotals");
    expect(route).not.toContain('.from("televote_votes") as any');
    expect(route).not.toContain('.update({ points: change.points })');
    expect(route).not.toContain(".insert({\n            edition_id:");
    expect(command).toContain('"studio2_televote_projection_status"');
    expect(command).toContain('"v3_reconcile_published_televote"');
  });

  it("rejects a canonical receipt that resolves another edition or show", () => {
    expect(command).toContain('status.showId !== data.showId');
    expect(command).toContain('status.editionId !== data.editionId');
    expect(command).toContain('receipt.showId !== data.showId');
    expect(command).toContain('receipt.editionId !== data.editionId');
  });
});
