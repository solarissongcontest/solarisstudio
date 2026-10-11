import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildAdminNavigation } from "../components/admin/admin-navigation";

const flatten = (slug?: string) => buildAdminNavigation(slug).flatMap((group) => group.items);

describe("Organizer navigation availability", () => {
  it("assigns every item one unique semantic identity", () => {
    const items = flatten("ssc22");
    const ids = items.map((item) => item.id);

    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("preserves item identity while edition routes become available", () => {
    const unavailable = new Map(flatten().map((item) => [item.label, item]));
    const ready = new Map(flatten("ssc22").map((item) => [item.label, item]));

    for (const label of [
      "Contest",
      "Publish",
      "Broadcast",
      "Jury voting",
      "Voting rules",
      "Televote totals",
    ]) {
      expect(unavailable.get(label)?.id).toBe(ready.get(label)?.id);
      expect(unavailable.get(label)).toMatchObject({
        availability: "requires-edition",
        to: null,
        unavailableReason: "Select an edition first",
      });
      expect(ready.get(label)?.availability).toBe("ready");
      expect(ready.get(label)?.to).not.toBe("/admin");
    }
  });

  it("never substitutes Organizer home for an edition-required destination", () => {
    const items = flatten();
    const editionRequired = items.filter((item) => item.availability === "requires-edition");

    expect(editionRequired).toHaveLength(6);
    expect(editionRequired.every((item) => item.to === null)).toBe(true);
    expect(
      items.filter((item) => item.availability === "ready").some((item) => item.to === "/admin"),
    ).toBe(false);
  });

  it("renders unavailable command-palette items without a navigation link", () => {
    const source = readFileSync("src/components/admin/AdminCommandPalette.tsx", "utf8");

    expect(source).toContain("item.available && item.href ? (");
    expect(source).toContain('aria-disabled="true"');
    expect(source).toContain("item.unavailableReason");
  });
});
