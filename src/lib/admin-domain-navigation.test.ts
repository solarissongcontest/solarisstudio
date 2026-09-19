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
  it("keeps the permanent shell at five stable destinations", () => {
    const domains = buildAdminDomainNavigation("ssc-21", "SSC21");
    expect(domains).toHaveLength(5);
    expect(domains.map((domain) => domain.label)).toEqual([
      "Home",
      "Inbox",
      "SSC21",
      "Rules & Cases",
      "Administration",
    ]);
  });

  it("does not render the full specialist route registry in the permanent sidebar", () => {
    expect(adminNav).toContain("buildAdminDomainNavigation");
    expect(adminNav).not.toContain("buildAdminNavigation");
    expect(adminNav).not.toContain("groups.map");
    expect(adminNav).toContain("Core workflows are visible in their workspaces");
    expect(adminNav).toContain('to="/admin/menu"');
  });

  it("keeps the Organizer menu small while preserving the searchable specialist directory", () => {
    expect(organizerMenu).toContain("buildAdminDomainNavigation");
    expect(organizerMenu).toContain("Work domains");
    expect(organizerMenu).toContain("All specialist pages");
    expect(organizerMenu).toContain("buildAdminNavigation(activeEdition?.slug)");
  });

  it("uses the five-destination model for contextual navigation too", () => {
    expect(sectionNav).toContain("buildAdminContextualSection");
    expect(sectionNav).not.toContain("buildAdminNavigation");

    const publish = buildAdminContextualSection("/admin/communications", "ssc-21", "SSC21");
    expect(publish?.domain.label).toBe("SSC21");
    expect(publish?.tabs.map((tab) => tab.label)).toContain("Publish");

    const governance = buildAdminContextualSection("/admin/integrity-appeals", "ssc-21");
    expect(governance?.domain.label).toBe("Rules & Cases");
    expect(governance?.tabs.map((tab) => tab.label)).toContain("Appeals");
  });

  it("exposes the six current-edition workspaces without relying on search", () => {
    const edition = buildAdminContextualSection("/admin/ssc-21", "ssc-21", "SSC21");
    expect(edition?.tabs.map((tab) => tab.label)).toEqual([
      "Overview",
      "Delegations",
      "Contest",
      "Voting & results",
      "Live",
      "Publish",
    ]);

    const countries = buildAdminContextualSection("/admin/countries", "ssc-21", "SSC21");
    expect(countries?.tabs.map((tab) => tab.label)).toContain("Delegations");
    expect(countries?.workflow?.tabs.map((tab) => tab.label)).toContain("Confirmations");
  });

  it("keeps deep workflow navigation only where the workflow needs it", () => {
    const delegations = buildAdminContextualSection("/confirmations/admin/rounds", "ssc-21");
    expect(delegations?.domain.id).toBe("edition");
    expect(delegations?.workflow?.label).toBe("Delegations workflow");
    expect(delegations?.workflow?.tabs.map((tab) => tab.label)).toEqual([
      "Countries",
      "Confirmations",
      "Responses",
      "Rounds",
      "Schedule",
      "More",
    ]);

    const live = buildAdminContextualSection("/admin/incidents", "ssc-21");
    expect(live?.workflow?.label).toBe("Live workflow");
    expect(live?.workflow?.tabs.map((tab) => tab.label)).toEqual([
      "Control room",
      "Workflows",
      "Incidents",
      "Rundown",
      "Reveal",
      "Rehearsal",
    ]);

    const publishWorkflow = buildAdminContextualSection("/admin/communications", "ssc-21");
    expect(publishWorkflow?.workflow?.label).toBe("Publish workflow");
    expect(publishWorkflow?.workflow?.tabs.map((tab) => tab.label)).toEqual([
      "Release",
      "Communications",
      "Media",
      "Stories",
      "Design",
    ]);

    const voting = buildAdminContextualSection("/televoting/admin/intelligence", "ssc-21");
    expect(voting?.domain.id).toBe("edition");
    expect(voting?.workflow?.label).toBe("Voting workflow");
    expect(voting?.workflow?.tabs.map((tab) => tab.label)).toEqual([
      "Overview",
      "Rules",
      "Jury",
      "Public vote",
      "Integrity",
      "Results",
    ]);

    expect(buildAdminContextualSection("/admin/communications", "ssc-21")?.workflow?.label).toBe("Publish workflow");
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

  it("assigns specialist route families to one stable primary destination", () => {
    const domains = buildAdminDomainNavigation("ssc-21", "SSC21");
    const domainFor = (path: string) => domains.find((domain) => domain.active(path))?.id;

    expect(domainFor("/admin/operations")).toBe("home");
    expect(domainFor("/admin/inbox")).toBe("inbox");
    expect(domainFor("/admin/ssc-21")).toBe("edition");
    expect(domainFor("/admin/incidents")).toBe("edition");
    expect(domainFor("/admin/results-reveal")).toBe("edition");
    expect(domainFor("/admin/integrity-appeals")).toBe("rules-cases");
    expect(domainFor("/admin/feature-rollout")).toBe("administration");
  });

  it("gives every internal destination in the detailed registry exactly one primary owner", () => {
    const domains = buildAdminDomainNavigation("ssc-21", "SSC21");
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
        `${destination.label} (${destination.to}) should belong to exactly one Organizer destination`,
      ).toHaveLength(1);
    }
  });
});
