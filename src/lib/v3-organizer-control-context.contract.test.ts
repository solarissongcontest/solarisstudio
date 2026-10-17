import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildV3OrganizerControlGroups } from "./v3-organizer";

const controlSource = readFileSync(
  "src/routes/_authenticated/admin/control.tsx",
  "utf8",
);

describe("V3 Organizer Control exact-edition contract", () => {
  it("fails closed when OrganizerContext has no edition", () => {
    const groups = buildV3OrganizerControlGroups(null);
    expect(groups.flatMap((group) => group.items).every((item) => item.href === null)).toBe(true);

    expect(controlSource).toContain("editionId ? editions.find((edition) => edition.id === editionId) ?? null : null");
    expect(controlSource).not.toContain("ordered[0]");
    expect(controlSource).not.toContain("sort((a, b) => (b.edition_number");
    expect(controlSource).toContain("Selected edition unavailable");
  });

  it("groups Control by the canonical operational domains", () => {
    expect(buildV3OrganizerControlGroups("ssc-22").map((group) => group.key)).toEqual([
      "delegations",
      "contest",
      "voting",
      "results",
      "communications",
      "production",
    ]);
  });

  it("keeps Entry Review separate from Running Order", () => {
    const items = buildV3OrganizerControlGroups("ssc-22").flatMap((group) => group.items);

    expect(items.find((item) => item.key === "entry-review")?.href).toBe(
      "/confirmations/admin/responses",
    );
    expect(items.find((item) => item.key === "running-order")?.href).toBe(
      "/admin/entries/ssc-22",
    );
  });

  it("consumes the canonical OrganizerProjection instead of inventing Control state", () => {
    expect(controlSource).toContain("useV3OrganizerProjection(activeEdition?.id)");
    expect(controlSource).toContain("projection?.domains[group.key]");
    expect(controlSource).toContain("summary.blockingIssueCount");
    expect(controlSource).toContain("summary.recommendedAction");
  });
});
