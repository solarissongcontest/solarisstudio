import { describe, expect, it } from "vitest";
import { V3_SYSTEM_DOMAIN_REGISTRY } from "./v3-system-domain-registry";
import {
  V3_PROJECTION_RECONCILIATION_REGISTRY,
  v3ProjectionReconciliation,
  v3ProjectionsInvalidatedByEvent,
  validateV3ProjectionReconciliationRegistry,
} from "./v3-projection-reconciliation-registry";

describe("System V3 S6 projection reconciliation registry", () => {
  it("covers every projection declared by the canonical System domain registry exactly once", () => {
    const expected = [...new Set(V3_SYSTEM_DOMAIN_REGISTRY.flatMap((domain) => domain.projections))].sort();
    const actual = V3_PROJECTION_RECONCILIATION_REGISTRY.map((item) => item.projection).sort();
    expect(actual).toEqual(expected);
    expect(validateV3ProjectionReconciliationRegistry()).toEqual([]);
  });

  it("derives invalidation from canonical domain events instead of handwritten UI ownership", () => {
    const jury = v3ProjectionsInvalidatedByEvent("jury.opened");
    expect(jury.length).toBeGreaterThan(0);
    expect(jury.every((projection) => projection.canonicalDomains.includes("jury"))).toBe(true);
    expect(jury.every((projection) => projection.invalidatingEvents.includes("jury.opened"))).toBe(true);
  });

  it("classifies live and operational projections without inventing staleness durations", () => {
    const televote = V3_PROJECTION_RECONCILIATION_REGISTRY.filter((projection) =>
      projection.canonicalDomains.includes("televote"),
    );
    const confirmation = V3_PROJECTION_RECONCILIATION_REGISTRY.filter((projection) =>
      projection.canonicalDomains.includes("confirmation"),
    );
    expect(televote.length).toBeGreaterThan(0);
    expect(televote.every((projection) => projection.freshnessClass === "live")).toBe(true);
    expect(confirmation.length).toBeGreaterThan(0);
    expect(confirmation.every((projection) => projection.freshnessClass === "operational")).toBe(true);
  });

  it("records bounded real repair paths only where current infrastructure proves them", () => {
    const taskProjection = V3_PROJECTION_RECONCILIATION_REGISTRY.find((projection) =>
      projection.canonicalDomains.includes("task"),
    );
    expect(taskProjection?.repair.state).toBe("rebuildable");
    expect(taskProjection?.repair.scope).toBe("edition");
    expect(taskProjection?.repair.rebuildPath).toContain("studio2_reconcile_all_organizer_tasks");
    expect(taskProjection?.repair.boundedBy).toContain("one edition");

    const receiptProjection = V3_PROJECTION_RECONCILIATION_REGISTRY.find((projection) =>
      projection.canonicalDomains.includes("receipt"),
    );
    expect(receiptProjection?.repair.state).toBe("rebuildable");
    expect(receiptProjection?.repair.scope).toBe("operation");
    expect(receiptProjection?.repair.rebuildPath).toContain("studio2_reconcile_operation");
  });

  it("keeps partial repair evidence below rebuildable instead of manufacturing completion", () => {
    const entry = V3_PROJECTION_RECONCILIATION_REGISTRY.filter((projection) =>
      projection.canonicalDomains.includes("entry"),
    );
    expect(entry.length).toBeGreaterThan(0);
    expect(entry.every((projection) => projection.repair.state === "foundation")).toBe(true);
    expect(entry.every((projection) => projection.repair.rebuildPath === null)).toBe(true);

    const unrelatedDeclared = V3_PROJECTION_RECONCILIATION_REGISTRY.find(
      (projection) => projection.repair.state === "declared",
    );
    expect(unrelatedDeclared).toBeDefined();
    expect(unrelatedDeclared?.repair.rebuildPath).toBeNull();
    expect(unrelatedDeclared?.repair.evidence).toEqual([]);
  });

  it("fails closed for unknown event or projection identities", () => {
    expect(v3ProjectionReconciliation("not-a-real-projection")).toBeNull();
    expect(v3ProjectionsInvalidatedByEvent("not.a_real_event")).toEqual([]);
  });
});
