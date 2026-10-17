import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { capabilityForOrganizerPath } from "./permission-route-map";

const source = (path: string) => readFileSync(path, "utf8");

describe("Organizer V3 O16 QA Coverage contract", () => {
  it("renders the canonical capability/scenario/environment evidence dimensions", () => {
    const page = source("src/components/admin/AdminQaCoveragePage.tsx");

    expect(page).toContain('title="QA Coverage"');
    expect(page).toContain('title="Capability × scenario × environment"');
    expect(page).toContain('label="Phone"');
    expect(page).toContain('label="Desktop"');
    expect(page).toContain('label="Keyboard"');
    expect(page).toContain('label="Two-admin"');
    expect(page).toContain('label="Offline / reconnect"');
    expect(page).toContain('label="Passed SHA"');
  });

  it("keeps unsupported evidence explicitly unknown instead of inventing passes", () => {
    const model = source("src/lib/admin-qa-coverage.ts");
    const page = source("src/components/admin/AdminQaCoveragePage.tsx");

    expect(model).toContain('state: "unknown"');
    expect(model).toContain("does not capture capability-specific keyboard evidence");
    expect(model).toContain("does not capture capability-specific offline/reconnect evidence");
    expect(model).toContain("not bound to an exact tested commit SHA");
    expect(page).toContain("Unknown stays unknown");
    expect(page).toContain("block a parity claim");
  });

  it("preserves the raw acceptance evidence and bug-review workflow", () => {
    const page = source("src/components/admin/AdminQaCoveragePage.tsx");

    expect(page).toContain('from("admin_beta_test_submissions" as never)');
    expect(page).toContain('.from("beta-feedback")');
    expect(page).toContain("Export responses");
    expect(page).toContain("Full response");
    expect(page).toContain("Bug reports");
  });

  it("uses rollout.manage for Product QA routes to match the backend RLS authority", () => {
    const routes = [
      "/admin/feedback-studies",
      "/admin/beta-test",
      "/admin/admin-beta-feedback",
      "/admin/beta1-feedback",
      "/admin/beta2-feedback",
      "/admin/beta3-feedback",
    ];

    for (const route of routes) {
      expect(capabilityForOrganizerPath(route)).toBe("rollout.manage");
    }
  });

  it("advances only QA Coverage to building without claiming parity", () => {
    const registry = source("src/lib/v3-organizer-capability-registry.ts");
    const qaBuilding = /id === "workspace-beta-coverage"\s*\|\|/;

    expect(registry).toMatch(qaBuilding);
    expect(registry).not.toMatch(/id === "workspace-beta-coverage"[^]*return "parity"/);
  });

  it("keeps the legacy route stable while presenting the canonical workspace", () => {
    const route = source("src/routes/_authenticated/admin/admin-beta-feedback.tsx");

    expect(route).toContain('createFileRoute("/_authenticated/admin/admin-beta-feedback")');
    expect(route).toContain("AdminQaCoveragePage");
    expect(route).toContain("QA Coverage — Solaris Organizer");
  });
});
