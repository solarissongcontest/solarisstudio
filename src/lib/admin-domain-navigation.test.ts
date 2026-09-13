import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { buildAdminContextualSection } from "../components/admin/admin-contextual-navigation";
import { buildAdminDomainNavigation } from "../components/admin/admin-domains";
import { buildAdminNavigation } from "../components/admin/admin-navigation";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const adminNav = source("src/components/admin/AdminNav.tsx");
const detailedNavigation = source("src/components/admin/admin-navigation.ts");
const sectionNav = source("src/components/admin/AdminSectionNav.tsx");
const palette = source("src/components/admin/AdminCommandPalette.tsx");
const organizerMenu = source("src/routes/_authenticated/admin/menu.tsx");

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

  it("keeps the mobile menu domain-first without deleting the specialist directory", () => {
    expect(organizerMenu).toContain("buildAdminDomainNavigation");
    expect(organizerMenu).toContain("Work domains");
    expect(organizerMenu).toContain("All specialist pages");
    expect(organizerMenu).toContain("buildAdminNavigation(activeEdition?.slug)");
  });

  it("uses the seven-domain model for contextual navigation too", () => {
    expect(sectionNav).toContain("buildAdminContextualSection");
    expect(sectionNav).not.toContain("buildAdminNavigation");

    const operations = buildAdminContextualSection("/admin/communications", "ssc-21");
    expect(operations?.domain.label).toBe("Operations");
    expect(operations?.tabs.map((tab) => tab.label)).toContain("Communications");

    const governance = buildAdminContextualSection("/admin/integrity-appeals", "ssc-21");
    expect(governance?.domain.label).toBe("Rules & Integrity");
    expect(governance?.tabs.map((tab) => tab.label)).toContain("Appeals");
  });

  it("keeps deep workflow navigation only where the workflow needs it", () => {
    const delegations = buildAdminContextualSection("/confirmations/admin/rounds", "ssc-21");
    expect(delegations?.domain.label).toBe("Contest");
    expect(delegations?.workflow?.label).toBe("Delegations workflow");
    expect(delegations?.workflow?.tabs.map((tab) => tab.label)).toEqual([
      "Overview",
      "Responses",
      "Rounds",
      "Calendar",
      "Access",
    ]);

    const voting = buildAdminContextualSection("/televoting/admin/intelligence", "ssc-21");
    expect(voting?.domain.label).toBe("Voting & Results");
    expect(voting?.workflow?.label).toBe("Voting workflow");
    expect(voting?.workflow?.tabs.map((tab) => tab.label)).toContain("Friend voting");

    expect(buildAdminContextualSection("/admin/communications", "ssc-21")?.workflow).toBeNull();
  });

  it("keeps every specialist route searchable even when it is not a contextual tab", () => {
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
