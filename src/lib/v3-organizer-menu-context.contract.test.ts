import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/menu.tsx"),
  "utf8",
);

describe("V3 Organizer specialist menu context safety", () => {
  it("never substitutes the newest edition for missing or stale Organizer context", () => {
    expect(route).toContain("selectOrganizerEdition(editions, editionId)");
    expect(route).not.toContain("sort((a, b) => (b.edition_number");
    expect(route).toContain("Solaris will not substitute the newest edition");
  });

  it("renders edition-scoped domain and specialist destinations as unavailable", () => {
    expect(route.match(/availability === "requires-edition"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(route).toContain('aria-disabled="true"');
    expect(route).toContain("domain.unavailableReason");
    expect(route).toContain("item.unavailableReason");
    expect(route).toContain("buildAdminNavigation(activeEdition?.slug)");
    expect(route).toContain("buildAdminDomainNavigation(");
  });

  it("keeps non-edition specialist tools searchable instead of blocking the whole menu", () => {
    expect(route).toContain("filterGroups(buildAdminNavigation(activeEdition?.slug), query)");
    expect(route).toContain("All specialist pages");
    expect(route).toContain("Search organizer pages");
  });
});
