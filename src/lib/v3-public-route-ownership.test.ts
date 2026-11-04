import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { V3_PUBLIC_CAPABILITIES } from "./v3-capability-registry";
import { V3_PUBLIC_ROUTE_OWNERSHIP } from "./v3-public-route-ownership";

describe("S15 explicit Public detail-route ownership", () => {
  it("maps every legacy alias to one existing V3 Public capability", () => {
    const publicIds = new Set(V3_PUBLIC_CAPABILITIES.map((item) => item.id));
    const routes = V3_PUBLIC_ROUTE_OWNERSHIP.map((item) => item.routePattern);
    expect(new Set(routes).size).toBe(routes.length);
    for (const alias of V3_PUBLIC_ROUTE_OWNERSHIP) {
      expect(publicIds.has(alias.ownerId), alias.routePattern).toBe(true);
      expect(alias.rationale.length, alias.routePattern).toBeGreaterThan(20);
    }
  });

  it("pins the legacy per-show broadcast URL to the Live capability", () => {
    expect(V3_PUBLIC_ROUTE_OWNERSHIP).toContainEqual(
      expect.objectContaining({ routePattern: "/broadcast/:showId", ownerId: "live-show" }),
    );
    const source = readFileSync("src/routes/broadcast/$showId.tsx", "utf8");
    expect(source).toMatch(/createFileRoute\s*\(\s*["']\/broadcast\/\$showId["']\s*,?\s*\)/);
  });
});
