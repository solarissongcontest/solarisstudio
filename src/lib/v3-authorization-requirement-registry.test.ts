import { describe, expect, it } from "vitest";
import { V3_SYSTEM_DOMAIN_REGISTRY } from "./v3-system-domain-registry";
import {
  V3_AUTHORIZATION_KNOWN_GAPS,
  V3_AUTHORIZATION_REQUIREMENT_REGISTRY,
  V3_AUTHORIZATION_RESOLVED_GAPS,
  v3AuthorizationRequirement,
  validateV3AuthorizationRequirementRegistry,
} from "./v3-authorization-requirement-registry";

describe("System V3 S7 authorization requirement registry", () => {
  it("covers every canonical mutation command without creating a second command inventory", () => {
    const expected = [...new Set(V3_SYSTEM_DOMAIN_REGISTRY.flatMap((domain) => domain.mutationCommands))].sort();
    const actual = V3_AUTHORIZATION_REQUIREMENT_REGISTRY.map((item) => item.command).sort();
    expect(actual).toEqual(expected);
    expect(validateV3AuthorizationRequirementRegistry()).toEqual([]);
  });

  it("keeps unverified commands declared instead of inferring permissions from names", () => {
    const declared = V3_AUTHORIZATION_REQUIREMENT_REGISTRY.filter((item) => item.state === "declared");
    expect(declared.length).toBeGreaterThan(0);
    expect(declared.every((item) => item.requiredCapability === null)).toBe(true);
    expect(declared.every((item) => item.serverBoundary === null)).toBe(true);
  });

  it("binds Entry review authorization to the exact entry-derived edition", () => {
    for (const command of ["entry.review", "entry.request_changes"]) {
      expect(v3AuthorizationRequirement(command)).toMatchObject({
        ownerDomain: "entry",
        state: "verified",
        requiredCapability: "confirmation.manage",
        scope: "object",
        objectResolution: "entry -> submission -> edition",
        serverBoundary: "public.studio2_apply_confirmation_entry_review",
      });
    }
  });

  it("binds Jury lifecycle authorization to show-derived edition scope", () => {
    for (const command of ["jury.open", "jury.close"]) {
      const requirement = v3AuthorizationRequirement(command);
      expect(requirement).toMatchObject({
        ownerDomain: "jury",
        state: "verified",
        requiredCapability: "voting.manage",
        scope: "show",
        objectResolution: "show -> edition",
        serverBoundary: "public.studio2_apply_jury_voting_status",
      });
      expect(requirement?.negativePaths).toContain("show outside authorized edition");
    }
  });

  it("uses one verified Results authorization contract across the canonical lifecycle", () => {
    for (const command of ["results.calculate", "results.verify", "results.lock", "results.unlock"]) {
      expect(v3AuthorizationRequirement(command)).toMatchObject({
        ownerDomain: "results",
        state: "verified",
        requiredCapability: "results.verify",
        scope: "show",
        objectResolution: "show -> edition",
        serverBoundary: "public.studio2_execute_result_operation",
        serviceRoleAllowed: true,
      });
    }
  });

  it("records the repaired country-entry defect as resolved rather than an open S7 gap", () => {
    expect(V3_AUTHORIZATION_KNOWN_GAPS).toEqual([]);
    expect(V3_AUTHORIZATION_RESOLVED_GAPS).toContainEqual(
      expect.objectContaining({
        id: "country-entry-participant-edition-confusion",
        status: "fixed",
        capability: "entry.edit",
      }),
    );
    const resolved = V3_AUTHORIZATION_RESOLVED_GAPS[0];
    expect(resolved.functions).toEqual([
      "public.admin_upsert_country_entry",
      "public.admin_update_country_entry_listen_links",
    ]);
    expect(resolved.resolution).toContain("resolve participant target edition first");
    expect(resolved.evidence).toContain(
      "supabase/migrations/20261016070000_v3_s7_entry_object_authorization.sql",
    );
  });

  it("fails closed for unknown command identities", () => {
    expect(v3AuthorizationRequirement("not.a.real.command")).toBeNull();
  });
});
