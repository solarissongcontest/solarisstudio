import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/media-assets.tsx"),
  "utf8",
);

describe("V3 Organizer Media Review exact-edition safety", () => {
  it("fails closed instead of selecting a newest fallback edition", () => {
    expect(route).toContain("selectOrganizerEdition(editions, editionId)");
    expect(route).not.toContain("sort((a, b) => (b.edition_number");
    expect(route).toContain("enabled: Boolean(resolvedEditionId)");
    expect(route).toContain("will not substitute the newest edition");
  });

  it("rejects cross-edition review evidence and clears stale bulk state", () => {
    expect(route).toContain("review.editionId !== resolvedEditionId");
    expect(route).toContain("setSelectedKeys(new Set())");
    expect(route).toContain("setReviewReason('')");
    expect(route).toContain("item.editionId !== commandEditionId");
  });

  it("binds review mutation and reconciliation to the captured edition", () => {
    expect(route).toContain("selectedEdition.id !== commandEditionId || editionId !== commandEditionId");
    expect(route).toContain("editionId: commandEditionId");
    expect(route).toContain("variables.commandEditionId");
    expect(route).toContain("if (editionId !== variables.commandEditionId) return;");
  });
});
