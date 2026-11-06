import { describe, expect, it } from "vitest";

import { TERRA_GOVERNANCE_DOMAIN_REGISTRY } from "./terra-governance-domain-registry";
import { authorizationPolicyForCapability } from "./v3-s7-authorization-matrix";

describe("Terra Solaris Governance authorization registration", () => {
  it("registers every implemented world capability in the fail-closed S7 authorization matrix", () => {
    const capabilities = new Set(
      TERRA_GOVERNANCE_DOMAIN_REGISTRY.filter((domain) =>
        domain.wave === "TG2" || domain.wave === "TG4",
      ).flatMap((domain) => domain.capabilities),
    );

    for (const capability of capabilities) {
      const policy = authorizationPolicyForCapability(capability);
      expect(policy.domain).toBe("world");
      expect(policy.operationScope).toBe("global");
      expect(policy.scopeLevels).toEqual(["platform", "object"]);
      expect(policy.domainSafeguards).toContain("organization/object scope");
      expect(policy.domainSafeguards).toContain("world capability grant scope");
    }
  });

  it("classifies private organization viewing as read-only authorization metadata", () => {
    const policy = authorizationPolicyForCapability("world.organization.view_private");

    expect(policy.effect).toBe("read");
    expect(policy.riskTier).toBe(1);
    expect(policy.serverAuthoritativeMutationRequired).toBe(false);
  });

  it("classifies membership review as a governed review effect", () => {
    const policy = authorizationPolicyForCapability("world.membership.review");

    expect(policy.effect).toBe("review");
    expect(policy.riskTier).toBe(2);
    expect(policy.serverAuthoritativeMutationRequired).toBe(true);
  });

  it("classifies document publication as critical server-authoritative publication", () => {
    const policy = authorizationPolicyForCapability("world.document.publish");

    expect(policy.objectTypes).toContain("world_document");
    expect(policy.effect).toBe("publish");
    expect(policy.riskTier).toBe(4);
    expect(policy.serverAuthoritativeMutationRequired).toBe(true);
  });
});
