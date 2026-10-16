import { describe, expect, it } from "vitest";
import { V3_PROJECTION_RECONCILIATION_REGISTRY } from "./v3-projection-reconciliation-registry";
import { assessV3ProjectionFreshness } from "./v3-projection-freshness";

function projectionFor(domain: string) {
  const projection = V3_PROJECTION_RECONCILIATION_REGISTRY.find((item) =>
    item.canonicalDomains.includes(domain),
  );
  if (!projection) throw new Error(`Missing projection for ${domain}`);
  return projection.projection;
}

describe("System V3 S6 projection freshness", () => {
  it("marks an exact authoritative version match as fresh", () => {
    const result = assessV3ProjectionFreshness(
      {
        projection: projectionFor("receipt"),
        stateVersion: 7,
        generatedAt: "2026-10-16T04:00:00.000Z",
        serverTime: "2026-10-16T04:00:01.000Z",
      },
      { authoritativeStateVersion: 7 },
    );
    expect(result.state).toBe("fresh");
    expect(result.recovery).toBe("none");
  });

  it("detects version drift and points rebuildable projections at repair", () => {
    const result = assessV3ProjectionFreshness(
      {
        projection: projectionFor("receipt"),
        stateVersion: 7,
        generatedAt: "2026-10-16T04:00:00.000Z",
        serverTime: "2026-10-16T04:00:01.000Z",
      },
      { authoritativeStateVersion: 8 },
    );
    expect(result).toMatchObject({
      state: "stale",
      reason: "state_version_changed",
      recovery: "rebuild",
    });
    expect(result.repair?.rebuildPath).toContain("studio2_reconcile_operation");
  });

  it("detects an invalidating event after projection generation", () => {
    const result = assessV3ProjectionFreshness(
      {
        projection: projectionFor("confirmation"),
        stateVersion: "12",
        generatedAt: "2026-10-16T04:00:00.000Z",
        serverTime: "2026-10-16T04:01:00.000Z",
      },
      { latestInvalidatingEventAt: "2026-10-16T04:00:30.000Z" },
    );
    expect(result).toMatchObject({
      state: "stale",
      reason: "invalidating_event_after_generation",
      recovery: "reconciliation_required",
    });
  });

  it("does not call a projection fresh merely because no contradiction is known", () => {
    const result = assessV3ProjectionFreshness(
      {
        projection: projectionFor("entry"),
        stateVersion: "5",
        generatedAt: "2026-10-16T04:00:00.000Z",
        serverTime: "2026-10-16T05:00:00.000Z",
      },
      {},
    );
    expect(result).toMatchObject({
      state: "unknown",
      reason: "no_authoritative_comparison",
      recovery: "reconciliation_required",
    });
  });

  it("fails closed on client-future or malformed projection metadata", () => {
    expect(
      assessV3ProjectionFreshness(
        {
          projection: projectionFor("jury"),
          stateVersion: 1,
          generatedAt: "2026-10-16T05:00:00.000Z",
          serverTime: "2026-10-16T04:00:00.000Z",
        },
        { authoritativeStateVersion: 1 },
      ),
    ).toMatchObject({ state: "unknown", reason: "invalid_metadata" });

    expect(
      assessV3ProjectionFreshness(
        {
          projection: projectionFor("jury"),
          stateVersion: 1,
          generatedAt: "not-a-date",
          serverTime: "2026-10-16T04:00:00.000Z",
        },
        { latestInvalidatingEventAt: "2026-10-16T03:00:00.000Z" },
      ),
    ).toMatchObject({ state: "unknown", reason: "invalid_metadata" });
  });

  it("fails closed for unknown projection identity", () => {
    expect(
      assessV3ProjectionFreshness(
        {
          projection: "not-a-real-projection",
          stateVersion: 1,
          generatedAt: "2026-10-16T04:00:00.000Z",
          serverTime: "2026-10-16T04:00:01.000Z",
        },
        { authoritativeStateVersion: 1 },
      ),
    ).toEqual({
      state: "unknown",
      reason: "unknown_projection",
      recovery: "reconciliation_required",
      repair: null,
    });
  });
});
