import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gate = readFileSync("src/components/v3/V3PrimaryRouteGate.tsx", "utf8");

describe("V3 Participate authoritative-read failure state", () => {
  it("keeps an enabled V3 route fail-closed instead of silently showing legacy UI", () => {
    expect(gate).toContain("V3PrimarySurfaceReadError");
    expect(gate).toContain('data-v3-primary-read-state="error"');
    expect(gate).toContain("No responsibility, deadline, completion or voting state has been assumed from stale browser data.");
    expect(gate).toContain("bundleQuery.refetch()");
  });

  it("retains the compatibility fallback for rollout-disabled and unauthenticated boundaries", () => {
    expect(gate).toContain("if (rollout.isError || rollout.data?.enabled !== true) return safeLegacyFallback;");
    expect(gate).toContain('if (effectiveSurface === "participate" && !rollout.data.userId) return safeLegacyFallback;');
  });
});
