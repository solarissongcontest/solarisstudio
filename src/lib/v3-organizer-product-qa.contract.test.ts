import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { capabilityForOrganizerPath } from "./permission-route-map";
import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";

const more = readFileSync("src/routes/_authenticated/admin/more.tsx", "utf8");
const studies = readFileSync("src/routes/_authenticated/admin/feedback-studies.tsx", "utf8");
const legacyRedirect = readFileSync("src/routes/_authenticated/admin/beta-feedback.tsx", "utf8");
const beta1 = readFileSync("src/routes/_authenticated/admin/beta1-feedback.tsx", "utf8");
const beta2 = readFileSync("src/routes/_authenticated/admin/beta2-feedback.tsx", "utf8");
const beta3 = readFileSync("src/routes/_authenticated/admin/beta3-feedback.tsx", "utf8");
const legacyRls = readFileSync(
  "supabase/migrations/20260918192719_permission_engine_v2_public_legacy_rls_cutover.sql",
  "utf8",
);
const beta3Rls = readFileSync(
  "supabase/migrations/20260919112558_beta3_navigation_feedback.sql",
  "utf8",
);
const beta3Evidence = readFileSync(
  "supabase/migrations/20260919131748_beta3_first_click_evidence.sql",
  "utf8",
);
const uploadQuarantine = readFileSync(
  "supabase/migrations/20261003211000_organisation_os_v5_unified_upload_quarantine.sql",
  "utf8",
);

describe("V3 Organizer Product QA information architecture", () => {
  it("exposes one canonical Feedback Studies entry from Product QA", () => {
    expect(more).toContain('title: "Product QA"');
    expect(more).toContain('label: "Feedback Studies"');
    expect(more).toContain('to: "/admin/feedback-studies"');
    expect(more).not.toContain('label: "Beta 3 feedback"');
    expect(more).not.toContain('label: "Beta 2 feedback"');
    expect(more).not.toContain('label: "Beta 1 archive"');
  });

  it("preserves Beta 1, Beta 2 and Beta 3 as separate historical evidence instead of rewriting datasets", () => {
    expect(studies).toContain('id: "beta-1"');
    expect(studies).toContain('id: "beta-2"');
    expect(studies).toContain('id: "beta-3"');
    expect(studies).toContain('to: "/admin/beta1-feedback"');
    expect(studies).toContain('to: "/admin/beta2-feedback"');
    expect(studies).toContain('to: "/admin/beta3-feedback"');
    expect(studies).toContain("The V3 workspace consolidates navigation, not source data.");
    expect(beta1).toContain('.from("beta_test_submissions" as never)');
    expect(beta1).toContain('.eq("form_version", 2)');
    expect(beta2).toContain('.from("beta2_test_submissions" as never)');
    expect(beta3).toContain('.from("beta3_test_submissions" as never)');
  });

  it("keeps the old generic feedback URL compatible with the V3 hub", () => {
    expect(legacyRedirect).toContain('<Navigate to="/admin/feedback-studies" replace />');
  });

  it("proves the three preserved study readers through rollout.manage, including Beta 3 telemetry", () => {
    for (const route of [
      "/admin/feedback-studies",
      "/admin/beta1-feedback",
      "/admin/beta2-feedback",
      "/admin/beta3-feedback",
    ]) {
      expect(capabilityForOrganizerPath(route)).toBe("rollout.manage");
    }

    expect(legacyRls).toContain('on public.beta2_test_submissions');
    expect(legacyRls).toContain('on public.beta_test_submissions');
    expect(legacyRls).toContain("studio2_access_allowed('rollout.manage', null, false)");
    expect(beta3Rls).toContain('on public.beta3_test_submissions');
    expect(beta3Rls).toContain("studio2_access_allowed('rollout.manage', null, false)");
    expect(beta3Evidence).toContain("admin_beta3_first_click_evidence");
    expect(beta3Evidence).toContain("studio2_access_allowed('rollout.manage', null, false)");
  });

  it("advances only the three evidence-complete historical study capabilities to parity", () => {
    const byId = new Map(
      V3_ORGANIZER_CAPABILITY_REGISTRY.map((item) => [item.legacyId, item]),
    );

    for (const id of [
      "workspace-beta-3-feedback",
      "workspace-beta-2-feedback",
      "workspace-beta-1-archive",
    ]) {
      expect(byId.get(id)?.ownerCapability).toBe("rollout.manage");
      expect(byId.get(id)?.migrationStatus).toBe("parity");
    }

    expect(byId.get("workspace-acceptance-test")?.migrationStatus).toBe("building");
    expect(byId.get("workspace-beta-coverage")?.migrationStatus).toBe("building");
  });

  it("keeps Acceptance Test building until admin screenshot upload authority matches rollout.manage", () => {
    expect(uploadQuarantine).toContain("elsif v_domain = 'beta_feedback' then");
    expect(uploadQuarantine).toContain("if v_admin_beta and v_actor is null then");
    expect(uploadQuarantine).toContain("Authenticated Organizer session required for admin beta feedback");
    const betaStart = uploadQuarantine.indexOf("elsif v_domain = 'beta_feedback' then");
    const betaEnd = uploadQuarantine.indexOf("else\n    raise exception 'Unknown upload domain'", betaStart);
    expect(betaStart).toBeGreaterThanOrEqual(0);
    expect(betaEnd).toBeGreaterThan(betaStart);
    expect(uploadQuarantine.slice(betaStart, betaEnd)).not.toContain("rollout.manage");
  });

  it("keeps acceptance, coverage and public UX as separate QA authorities", () => {
    expect(more).toContain('label: "Organizer Acceptance Test"');
    expect(more).toContain('label: "QA Coverage"');
    expect(more).toContain('label: "Public UX"');
    expect(studies).toContain('to="/admin/beta-test"');
    expect(studies).toContain('to="/admin/admin-beta-feedback"');
    expect(studies).toContain('to="/admin/public-ux"');
  });
});
