import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gateSource = () =>
  readFileSync(
    resolve(process.cwd(), "src/components/v3/V3LiveRouteGate.tsx"),
    "utf8",
  );

describe("Public V3 Live route reconnect boundary", () => {
  it("falls back only when an initial authoritative rollout or Live snapshot is absent", () => {
    const gate = gateSource();

    expect(gate).toContain("if (!rollout.data || !v3Enabled)");
    expect(gate).toContain("if (!bundle.data)");
    expect(gate).not.toContain("rollout.isError || !rollout.data");
    expect(gate).not.toContain("bundle.isError || !bundle.data");
    // The intentional rollout-off fallback stays, but read failures must
    // take the retry branch before either fallback can mount legacy queries.
    expect(gate.indexOf("if (rollout.isError && !rollout.data)")).toBeLessThan(
      gate.indexOf("if (!rollout.data || !v3Enabled)"),
    );
    expect(gate.indexOf("if (bundle.isError && !bundle.data)")).toBeLessThan(
      gate.indexOf("if (!bundle.data)"),
    );
  });

  it("fails closed with manual retry before an initial server read is available", () => {
    const gate = gateSource();
    const rolloutError = gate.indexOf("if (rollout.isError && !rollout.data)");
    const rolloutFallback = gate.indexOf("if (!rollout.data || !v3Enabled)");
    const bundleError = gate.indexOf("if (bundle.isError && !bundle.data)");
    const bundleFallback = gate.indexOf("if (!bundle.data)");

    expect(rolloutError).toBeGreaterThan(0);
    expect(bundleError).toBeGreaterThan(0);
    expect(rolloutError).toBeLessThan(rolloutFallback);
    expect(bundleError).toBeLessThan(bundleFallback);
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
