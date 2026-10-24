import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const route = readFileSync(
  resolve(process.cwd(), "src/routes/_authenticated/admin/beta2-feedback.tsx"),
  "utf8",
);

const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
  (item) => item.legacyId === "workspace-beta-2-feedback",
);

describe("V3 Organizer Beta 2 feedback data boundary", () => {
  it("requests only the Beta 2 fields the dashboard actually renders", () => {
    expect(route).toContain('.from("beta2_test_submissions" as never)');
    expect(route).toContain(
      '.select("id,tester_name,device,browser,answers,bug_reports,created_at")',
    );
    expect(route).not.toContain('.select("*")');
    expect(route).not.toContain("familiarity: string | null");
    expect(route).not.toContain("screenshot_paths");
  });

  it("keeps the Beta 1 comparison count metadata-only", () => {
    expect(route).toContain(
      'supabase.from("beta_test_submissions" as never).select("id", { count: "exact", head: true })',
    );
  });

  it("keeps the protected Organizer route out of crawler traversal", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
  });

  it("keeps the capability building while this focused hardening lands", () => {
    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
    expect(capability?.migrationStatus).not.toBe("parity");
    expect(capability?.targetDomain).toBe("product-qa");
    expect(capability?.legacyRoutes).toContain("/admin/beta2-feedback");
  });
});
