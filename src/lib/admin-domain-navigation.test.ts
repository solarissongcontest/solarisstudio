import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildAdminDomainNavigation } from "../components/admin/admin-domains";
import { buildAdminNavigation } from "../components/admin/admin-navigation";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const adminNav = source("src/components/admin/AdminNav.tsx");
const detailedNavigation = source("src/components/admin/admin-navigation.ts");
const sectionNav = source("src/components/admin/AdminSectionNav.tsx");
const palette = source("src/components/admin/AdminCommandPalette.tsx");

describe("Organizer domain navigation", () => {
  it("keeps the permanent sidebar at seven stable domains", () => {
    const domains = buildAdminDomainNavigation("ssc-21");
    expect(domains).toHaveLength(7);
    expect(domains.map((domain) => domain.label)).toEqual([
      "Overview",
      "Contest",
      "Operations",
      "Voting & Results",
      "Rules & Integrity",
      "Publishing",
      "Administration",
    ]);
  });

  it("does not render the full specialist route registry in the permanent sidebar", () => {
    expect(adminNav).toContain("buildAdminDomainNavigation");
    expect(adminNav).not.toContain("buildAdminNavigation");
    expect(adminNav).not.toContain("groups.map");
    expect(adminNav).toContain("Specialist pages stay available");
  });

  it("keeps specialist routes available through contextual navigation and search", () => {
    expect(sectionNav).toContain("buildAdminNavigation");
    expect(palette).toContain("buildAdminNavigation(activeEdition?.slug).flatMap");
    for (const specialist of [
      '"Reveal Director"',
      '"Broadcast rundown"',
      '"Submission history"',
      '"Simulation Lab"',
      '"Voting Lab"',
      '"Feature rollout"',
    ]) {
      expect(detailedNavigation).toContain(specialist);
    }
  });

  it("assigns specialist route families to a stable primary domain", () => {
    const domains = buildAdminDomainNavigation("ssc-21");
    const domainFor = (path: string) => domains.find((domain) => domain.active(path))?.id;

    expect(domainFor("/admin/ssc-21")).toBe("contest");
    expect(domainFor("/admin/incidents")).toBe("operations");
    expect(domainFor("/admin/results-reveal")).toBe("voting-results");
    expect(domainFor("/admin/integrity-appeals")).toBe("rules-integrity");
    expect(domainFor("/admin/storytelling")).toBe("publishing");
    expect(domainFor("/admin/feature-rollout")).toBe("administration");
  });

  it("gives every internal destination in the detailed registry exactly one domain owner", () => {
    const domains = buildAdminDomainNavigation("ssc-21");
    const destinations = buildAdminNavigation("ssc-21")
      .flatMap((group) => group.items)
      .filter(
        (item) =>
          item.to.startsWith("/admin") ||
          item.to.startsWith("/televoting/admin") ||
          item.to.startsWith("/confirmations/admin"),
      );

    for (const destination of destinations) {
      const owners = domains.filter((domain) => domain.active(destination.to));
      expect(
        owners.map((owner) => owner.label),
        `${destination.label} (${destination.to}) should belong to exactly one Organizer domain`,
      ).toHaveLength(1);
    }
  });
});
