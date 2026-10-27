import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRootRoute, createRoute, createRouter, createMemoryHistory, RouterProvider, Outlet } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { Route as MoreRoute } from "@/routes/_authenticated/admin/more";
import { Route as GuideRoute } from "@/routes/_authenticated/admin/guide";
import { Route as IntelligenceAlias } from "@/routes/televoting/admin/intelligence";
import { Route as AntiAbuseAlias } from "@/routes/televoting/admin/anti-abuse";
import { capabilityForOrganizerPath } from "./permission-route-map";
import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";
import { V3_ORGANIZER_OBSERVATIONAL_CUTOVERS } from "./v3-organizer-observational-cutovers";

async function renderProductionPage(path: string, component: ComponentType) {
  const root = createRootRoute({ component: Outlet });
  const page = createRoute({ getParentRoute: () => root, path, component: () => createElement(component) });
  const router = createRouter({ routeTree: root.addChildren([page]), history: createMemoryHistory({ initialEntries: [path] }) });
  await router.load();
  return renderToStaticMarkup(createElement(RouterProvider, { router }));
}

function redirectTarget(route: typeof IntelligenceAlias | typeof AntiAbuseAlias) {
  try { (route.options.beforeLoad as () => void)(); }
  catch (redirect) { return (redirect as { options: { to: string } }).options.to; }
  throw new Error("Compatibility alias did not redirect");
}

describe("accepted canonical Organizer observational family", () => {
  it("executes all real server read owners with denied/authorized callers and zero writes or network", () => {
    const report = JSON.parse(execFileSync(process.execPath, ["--env-file=/dev/null", "run", "scripts/fixtures/v3-organizer-observational-proof.ts"], {
      encoding: "utf8", env: process.env,
    }));
    expect(report).toEqual({ passed: true, unauthorizedOwners: 4, auditBound: 1000, historicalRoundBound: 100, scopedBallots: 1, officialWrites: 0, networkAttempts: 0 });
  });

  it("executes the real laboratory pages and engines without canonical writes, source mutation or network", () => {
    const report = JSON.parse(execFileSync(process.execPath, ["--env-file=/dev/null", "run", "scripts/fixtures/v3-organizer-lab-proof.tsx"], {
      encoding: "utf8", env: process.env,
    }));
    expect(report).toEqual({ passed: true, productionPages: 2, routeCases: 5, sourceSnapshotUnchanged: true, syntheticBallotsUnchanged: true, officialWrites: 0, networkAttempts: 0 });
  });

  it("executes exact-edition canonical Overview composition and refuses denied, cross-scope or unverified state", () => {
    const report = JSON.parse(execFileSync(process.execPath, ["--env-file=/dev/null", "run", "scripts/fixtures/v3-organizer-overview-proof.tsx"], {
      encoding: "utf8", env: process.env,
    }));
    expect(report).toEqual({ passed: true, deniedBeforeRead: true, selectedEdition: true, crossEditionRejected: true, unverifiableScheduleRejected: true, productionRouteCases: 2, networkAttempts: 0 });
  });

  it("resolves both retained specialist aliases to one canonical evidence owner with the same read capability", () => {
    expect(redirectTarget(IntelligenceAlias)).toBe("/admin/friend-voting");
    expect(redirectTarget(AntiAbuseAlias)).toBe("/televoting/admin/intelligence");
    for (const route of ["/admin/friend-voting", "/televoting/admin/intelligence", "/televoting/admin/anti-abuse"]) {
      expect(capabilityForOrganizerPath(route)).toBe("voting.read");
    }
    const source = readFileSync("src/routes/_authenticated/admin/friend-voting.tsx", "utf8");
    expect(source).toContain("evidence signals, not findings");
    expect(source).not.toContain("useMutation(");
  });

  it("renders the real More directory with contextual governed owners rather than a duplicate mutation surface", async () => {
    const html = await renderProductionPage("/admin/more", MoreRoute.options.component as ComponentType);
    for (const href of ["/admin/access-permissions", "/admin/sync-health", "/admin/system-operations", "/admin/feedback-studies", "/admin/guide", "/admin/menu"]) {
      expect(html).toContain(`href="${href}"`);
    }
    expect(html).toContain("All Organizer tools");
    expect(html).not.toContain("<form");
  });

  it("renders the real Guide's workflow boundaries and canonical next actions without introducing mutations", async () => {
    const html = await renderProductionPage("/admin/guide", GuideRoute.options.component as ComponentType);
    for (const label of ["How to use the organizer tools", "Overview", "Tasks", "Control", "Live", "More"]) expect(html).toContain(label);
    expect(html).toContain('href="/admin/operations"');
    expect(html).toContain('href="/admin/control"');
    expect(html).not.toContain("<form");
  });

  it("attaches this proof only to observational capabilities and retains all genuine mutation blockers", () => {
    for (const [id, proof] of Object.entries(V3_ORGANIZER_OBSERVATIONAL_CUTOVERS)) {
      const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find((row) => row.legacyId === id);
      expect(capability?.ownerCapability).toBe(proof.owner);
      expect(capabilityForOrganizerPath(proof.route)).toBe(proof.owner);
      expect(capability?.migrationStatus).toBe("cutover");
      expect(capability?.migrationEvidence).toContain("v3-organizer-private-read-isolation.test.ts");
    }
    for (const id of ["voting-public-results", "voting-combined-results", "voting-result-integrity", "workspace-hod-history", "workspace-system-settings", "operations-communications", "live-review-broadcast-rundown"]) {
      expect(V3_ORGANIZER_CAPABILITY_REGISTRY.find((row) => row.legacyId === id)?.migrationStatus).toBe("building");
    }
  });
});
