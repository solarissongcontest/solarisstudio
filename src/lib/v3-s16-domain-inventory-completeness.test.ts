import { describe, expect, it } from "vitest";

import { V3_S16_CRITICAL_DOMAINS, type V3S16Report } from "./v3-s16-mutation-authority";
import { classifyV3S16ReleaseAuthority } from "./v3-s16-release-risk";

const sha = "c".repeat(40);
const catalog = {
  schemaVersion: 2 as const,
  candidateSha: sha,
  collection: "effective-postgresql-catalog-v2",
  roles: { roles: [{ name: "anon" }, { name: "authenticated" }, { name: "service_role" }] },
  uncertainties: [],
  negativeTests: { candidateSha: sha, passed: true, domains: [] },
  tables: [],
  functions: [],
};

const canonicalDomains: V3S16Report["domains"] = V3_S16_CRITICAL_DOMAINS.map((domain) => ({
  id: domain.id,
  canonicalOwner: domain.canonicalOwner,
  canonicalTables: domain.canonicalTables,
  canonicalCommands: domain.canonicalCommands,
  sanctionedInternalWriters: domain.sanctionedInternalWriters ?? [],
  sanctionedWriteTriggers: domain.sanctionedWriteTriggers ?? [],
  ownerBoundary: domain.resultsFrozenOwner ? "results_pr_1400" : "shared",
}));

const classify = (domains: V3S16Report["domains"], staticOnly = false) =>
  classifyV3S16ReleaseAuthority({
    baseFindings: [],
    domains,
    files: [],
    catalog,
    staticOnly,
    candidateSha: sha,
  });

describe("S16 complete critical-domain certification inventory", () => {
  it("cannot certify an empty but syntactically valid catalog/domain projection", () => {
    const result = classify([]);
    expect(result.s16Passed).toBe(false);
    expect(result.riskTotals.hard_blocker).toBe(V3_S16_CRITICAL_DOMAINS.length);
    expect(result.findings.filter((finding) => finding.kind === "critical_domain_inventory_invalid")).toHaveLength(
      V3_S16_CRITICAL_DOMAINS.length,
    );
  });

  it("rejects omitted and duplicated critical domains instead of trusting reduced evidence", () => {
    const missing = classify(canonicalDomains.filter((domain) => domain.id !== "results"));
    expect(missing.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        domain: "results",
        kind: "critical_domain_inventory_invalid",
        releaseRisk: "hard_blocker",
        ownerBoundary: "results_pr_1400",
      }),
    ]));

    const duplicated = classify([...canonicalDomains, canonicalDomains[0]]);
    expect(duplicated.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        domain: canonicalDomains[0].id,
        kind: "critical_domain_inventory_invalid",
      }),
    ]));
  });

  it("rejects altered table, command, owner and unknown-domain inventories", () => {
    const altered: V3S16Report["domains"] = canonicalDomains.map((domain) =>
      domain.id === "jury"
        ? { ...domain, canonicalTables: [], canonicalCommands: [], canonicalOwner: "browser" }
        : domain,
    );
    const result = classify([...altered, { ...canonicalDomains[0], id: "invented-domain" }]);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ domain: "jury", kind: "critical_domain_inventory_invalid" }),
      expect.objectContaining({ domain: "invented-domain", kind: "critical_domain_inventory_invalid" }),
    ]));
  });

  it("does not invent inventory failures for the generated canonical domain registry", () => {
    const result = classify(canonicalDomains);
    expect(result.findings.filter((finding) => finding.kind === "critical_domain_inventory_invalid")).toEqual([]);
    // The synthetic catalog deliberately has no tables or functions. S16 still fails.
    expect(result.s16Passed).toBe(false);
  });

  it("preserves targeted static-only unit inspections as diagnostic, never certified", () => {
    const result = classify([canonicalDomains[0]], true);
    expect(result.findings.some((finding) => finding.kind === "critical_domain_inventory_invalid")).toBe(false);
    expect(result.s16Passed).toBe(false);
  });
});
