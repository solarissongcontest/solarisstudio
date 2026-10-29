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

  it("falls back only when rollout authority is absent/disabled or Participate is unauthenticated", () => {
    expect(gate).toContain("if (!rollout.data || rollout.data.enabled !== true) return safeLegacyFallback;");
    expect(gate).toContain('if (effectiveSurface === "participate" && !rollout.data.userId) return safeLegacyFallback;');
  });

  it("keeps cached authoritative V3 data mounted across background refetch failures", () => {
    expect(gate).toContain("if (rollout.isLoading && !rollout.data)");
    expect(gate).toContain("if (bundleQuery.isLoading && !bundleQuery.data)");
    expect(gate).toContain("if (!bundleQuery.data)");
    expect(gate).not.toContain("if (rollout.isError || rollout.data?.enabled !== true)");
    expect(gate).not.toContain("if (bundleQuery.isError || !bundleQuery.data)");
  });
});
