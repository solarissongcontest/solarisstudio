import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const gateSource = () =>
  readFileSync(
    resolve(process.cwd(), "src/components/v3/V3LiveRouteGate.tsx"),
    "utf8",
  );

describe("Public V3 Live route reconnect boundary", () => {
  it("falls back to legacy Show Mode only when no authoritative V3 snapshot exists", () => {
    const gate = gateSource();

    expect(gate).toContain("if (!bundle.data)");
    expect(gate).not.toContain("if (bundle.isError || !bundle.data)");
    expect(gate).toContain("legacy Show Mode is a reversible fallback only when the initial V3 read");
  });

  it("keeps cached authoritative V3 state mounted when a refresh fails", () => {
    const gate = gateSource();

    expect(gate).toContain("experience={bundle.data.experience}");
    expect(gate).toContain("degraded={bundle.isError}");
    expect(gate).toContain("refreshing={bundle.isFetching}");
    expect(gate).toContain("void bundle.refetch()");
  });

  it("does not add a second polling or browser-owned live-state mechanism", () => {
    const gate = gateSource();

    expect(gate).toContain("useV3LiveBundle(v3Enabled)");
    expect(gate).not.toContain("setInterval(");
    expect(gate).not.toContain("Date.now()");
    expect(gate).not.toContain("window.setTimeout");
  });
});
