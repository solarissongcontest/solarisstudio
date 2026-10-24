import { describe, expect, it } from "vitest";
import {
  V3_DOMAIN_CONSEQUENCE_REGISTRY,
  V3_ORGANIZER_CAPABILITY_REGISTRY,
  V3_PUBLIC_CAPABILITIES,
  V3_SYSTEM_DOMAIN_REGISTRY,
} from "./v3-capability-registry";
import { assessV3S16StaticReleaseReadiness } from "./v3-s16-static-release-readiness";

describe("V3 S16 static release readiness", () => {
  it("derives release blockers from canonical registries instead of a second status inventory", () => {
    const readiness = assessV3S16StaticReleaseReadiness();

    expect(readiness.publicCutoverRemaining).toBe(
      V3_PUBLIC_CAPABILITIES.filter(
        (item) => !["cutover", "retired"].includes(item.specificationStatus),
      ).length,
    );
    expect(readiness.organizerCutoverRemaining).toBe(
      V3_ORGANIZER_CAPABILITY_REGISTRY.filter(
        (item) => !["cutover", "retired"].includes(item.migrationStatus),
      ).length,
    );
    expect(readiness.pendingPhysicalDomains).toBe(
      V3_SYSTEM_DOMAIN_REGISTRY.filter((item) => item.physicalAuditStatus === "pending").length,
    );
    expect(readiness.declarationOnlyConsequences).toBe(
      V3_DOMAIN_CONSEQUENCE_REGISTRY.filter(
        (item) => item.implementationState !== "event-backed",
      ).length,
    );
    expect(readiness.publicParityMissingEvidence).toBe(
      V3_PUBLIC_CAPABILITIES.filter(
        (item) =>
          ["parity", "cutover", "retired"].includes(item.specificationStatus) &&
          !("migrationEvidence" in item && item.migrationEvidence?.trim()),
      ).length,
    );
  });

  it("cannot report ready while any canonical static blocker remains", () => {
    const readiness = assessV3S16StaticReleaseReadiness();
    const expectedReady =
      readiness.authorization.ready &&
      readiness.publicCutoverRemaining === 0 &&
      readiness.organizerCutoverRemaining === 0 &&
      readiness.pendingPhysicalDomains === 0 &&
      readiness.declarationOnlyConsequences === 0 &&
      readiness.publicParityMissingEvidence === 0;

    expect(readiness.ready).toBe(expectedReady);
    expect(readiness.ready).toBe(readiness.blockers.length === 0);
  });

  it("keeps blocker messages deterministic for release diagnostics", () => {
    const first = assessV3S16StaticReleaseReadiness();
    const second = assessV3S16StaticReleaseReadiness();
    expect(second.blockers).toEqual(first.blockers);
  });
});
