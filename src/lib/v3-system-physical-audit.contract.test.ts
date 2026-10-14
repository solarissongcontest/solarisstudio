import { describe, expect, it } from "vitest";

import { SOLARIS_V6_DOMAINS } from "./solaris-v6-domain-registry";
import { V3_API_CAPABILITY_REGISTRY } from "./v3-api-capability-registry";
import { V3_SYSTEM_DOMAIN_REGISTRY, v3SystemDomain } from "./v3-system-domain-registry";
import {
  V3_SYSTEM_PHYSICAL_AUDIT_SOURCE,
  V3_VERIFIED_DOMAIN_TABLES,
} from "./v3-system-physical-audit";

describe("V3 System physical ownership audit", () => {
  it("records the production schema audit as read-only evidence", () => {
    expect(V3_SYSTEM_PHYSICAL_AUDIT_SOURCE.projectId).toBe("dkxmnvekiopyesuzggeu");
    expect(V3_SYSTEM_PHYSICAL_AUDIT_SOURCE.method).toContain("read-only");
    expect(V3_SYSTEM_PHYSICAL_AUDIT_SOURCE.inspectedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("has verified physical tables for every inherited V6 canonical domain", () => {
    for (const domain of SOLARIS_V6_DOMAINS) {
      expect(V3_VERIFIED_DOMAIN_TABLES[domain.id]?.length ?? 0, domain.id).toBeGreaterThan(0);
    }
  });

  it("only records schema-qualified physical table names", () => {
    for (const [domain, tables] of Object.entries(V3_VERIFIED_DOMAIN_TABLES)) {
      expect(v3SystemDomain(domain), domain).not.toBeNull();
      for (const table of tables) {
        expect(table, `${domain}: ${table}`).toMatch(/^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/);
      }
    }
  });

  it("hydrates canonical System owners from the verified physical inventory", () => {
    for (const [domain, tables] of Object.entries(V3_VERIFIED_DOMAIN_TABLES)) {
      const owner = v3SystemDomain(domain);
      expect(owner, domain).not.toBeNull();
      expect(owner?.physicalAuditStatus, domain).toBe("verified");
      expect(owner?.primaryTables, domain).toEqual(tables);
      expect(
        owner?.ownershipEvidence.some((item) => item.includes(V3_SYSTEM_PHYSICAL_AUDIT_SOURCE.projectId)),
        domain,
      ).toBe(true);
    }
  });

  it("keeps pending physical ownership explicit instead of inventing a table", () => {
    const pending = V3_SYSTEM_DOMAIN_REGISTRY.filter((domain) => domain.physicalAuditStatus === "pending");
    for (const domain of pending) {
      expect(domain.primaryTables, domain.domain).toEqual([]);
      expect(V3_VERIFIED_DOMAIN_TABLES[domain.domain], domain.domain).toBeUndefined();
    }
  });

  it("attaches every API route to a live canonical System domain", () => {
    for (const api of V3_API_CAPABILITY_REGISTRY) {
      expect(v3SystemDomain(api.ownerDomain), `${api.route} -> ${api.ownerDomain}`).not.toBeNull();
      if (api.mutation) {
        expect(api.riskTier, api.route).toBeGreaterThan(0);
      }
    }
  });
});
