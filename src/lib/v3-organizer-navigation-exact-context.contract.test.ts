import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildAdminContextualSection } from "@/components/admin/admin-contextual-navigation";
import { buildAdminDomainNavigation } from "@/components/admin/admin-domains";
import { buildAdminNavigation } from "@/components/admin/admin-navigation";

const CONSUMERS = [
  "src/components/admin/AdminNav.tsx",
  "src/components/admin/AdminSectionNav.tsx",
  "src/components/admin/AdminCommandPalette.tsx",
  "src/components/admin/OrganizerV3MobileChrome.tsx",
  "src/components/admin/OrganizerV6MobileChrome.tsx",
] as const;

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Organizer navigation exact-edition context", () => {
  it("routes every shared Organizer navigation consumer through the fail-closed resolver", () => {
    for (const path of CONSUMERS) {
      const content = source(path);
      expect(content, path).toContain("resolveAdminEditionContext(editions, editionId)");
      expect(content, path).not.toContain("[...editions].sort");
    }
  });

  it("keeps the permanent Edition destination disabled without an exact edition", () => {
    const edition = buildAdminDomainNavigation(undefined, "Edition").find(
      (item) => item.id === "edition",
    );

    expect(edition).toMatchObject({
      label: "Edition",
      availability: "requires-edition",
      to: null,
      unavailableReason: "Select an edition first",
    });
  });

  it("keeps edition-scoped command-palette destinations disabled without context", () => {
    const items = buildAdminNavigation(undefined).flatMap((group) => group.items);

    for (const id of [
      "current-edition-contest",
      "current-edition-publish",
      "current-edition-broadcast",
    ]) {
      expect(items.find((item) => item.id === id), id).toMatchObject({
        availability: "requires-edition",
        to: null,
        unavailableReason: "Select an edition first",
      });
    }
  });

  it("does not manufacture contextual edition links from an edition-shaped pathname", () => {
    const section = buildAdminContextualSection("/admin/shows/stale-edition", undefined, "Edition");

    expect(section?.domain).toMatchObject({
      id: "edition",
      availability: "requires-edition",
      to: null,
    });
    expect(section?.tabs.find((tab) => tab.label === "Overview")).toMatchObject({
      availability: "requires-edition",
      to: null,
    });
    expect(section?.tabs.find((tab) => tab.label === "Contest")).toMatchObject({
      availability: "requires-edition",
      to: null,
    });
  });

  it("keeps V6 mobile Edition explicitly disabled without a resolved slug", () => {
    const mobile = source("src/components/admin/OrganizerV6MobileChrome.tsx");

    expect(mobile).toContain('availability: slug ? "ready" : "requires-edition"');
    expect(mobile).toContain('item.availability === "requires-edition" ? "Select an edition first"');
  });
});
