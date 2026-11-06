import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gateSource = () =>
  readFileSync(
    resolve(process.cwd(), "src/components/v3/V3LiveRouteGate.tsx"),
    "utf8",
  );

describe("Public V3 Live route reconnect boundary", () => {
  it("uses legacy only when rollout explicitly disables V3, never because authority is missing", () => {
    const gate = gateSource();

    expect(gate).toContain("if (!rollout.data) {");
    expect(gate).toContain("if (!v3Enabled) {");
    expect(gate).toContain("if (!bundle.data) {");
    expect(gate).not.toContain("if (!rollout.data || !v3Enabled)");
    expect(gate).toContain("Official Live rollout state could not be verified");
    expect(gate).toContain("Official Live state could not be verified");
    expect(gate.match(/return <>{fallback}<\\/>;/g)?.length).toBe(1);
  });

  it("fails closed with manual retry when rollout or V3 bundle is absent", () => {
    const gate = gateSource();
    const rolloutError = gate.indexOf("if (rollout.isError && !rollout.data)");
    const rolloutMissing = gate.indexOf("if (!rollout.data) {");
    const serverDisabled = gate.indexOf("if (!v3Enabled) {");
    const bundleError = gate.indexOf("if (bundle.isError && !bundle.data)");
    const bundleMissing = gate.indexOf("if (!bundle.data) {");

    expect(rolloutError).toBeGreaterThan(0);
    expect(rolloutError).toBeLessThan(rolloutMissing);
    expect(rolloutMissing).toBeLessThan(serverDisabled);
    expect(bundleError).toBeGreaterThan(0);
    expect(bundleError).toBeLessThan(bundleMissing);
    expect(gate).toContain('onRetry={() => { void rollout.refetch(); }}');
    expect(gate).toContain('onRetry={() => { void bundle.refetch(); }}');
    expect(gate).toContain('refreshing={rollout.isFetching}');
    expect(gate).toContain('refreshing={bundle.isFetching}');
    expect(gate).toContain('disabled={refreshing}');
    expect(gate).toContain('refreshing ? "Retrying Live…" : "Retry Live"');
    expect(gate).toContain("instead of mounting legacy archive queries");
  });

  it("keeps cached rollout and Live authority mounted when a refetch fails", () => {
    const gate = gateSource();

    expect(gate).toContain("rollout.data?.enabled === true");
    expect(gate).not.toContain("rollout.isSuccess &&");
    expect(gate).toContain("const degraded = rollout.isError || bundle.isError");
    expect(gate).toContain("experience={bundle.data.experience}");
    expect(gate).toContain("degraded={degraded}");
    expect(gate).toContain("refreshing={refreshing}");
  });

  it("reconciles both rollout and Live snapshots from the retry action", () => {
    const gate = gateSource();

    expect(gate).toContain("Promise.all([rollout.refetch(), bundle.refetch()])");
    expect(gate).toContain("rollout.isFetching || bundle.isFetching");
  });

  it("does not add a second polling or browser-owned live-state mechanism", () => {
    const gate = gateSource();

    expect(gate).toContain("useV3LiveBundle(v3Enabled)");
    expect(gate).not.toContain("setInterval(");
    expect(gate).not.toContain("Date.now()");
    expect(gate).not.toContain("window.setTimeout");
  });
});
