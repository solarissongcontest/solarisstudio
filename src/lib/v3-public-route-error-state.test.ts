import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/v3/V3PrimaryRouteGate.tsx", "utf8");

describe("V3 primary route error state", () => {
  it("does not infer stale participation truth after a failed authoritative read", () => {
    expect(source).toContain("Authoritative read unavailable");
    expect(source).toContain("Retry authoritative read");
    expect(source).toContain("bundleQuery.refetch()");
  });
});
