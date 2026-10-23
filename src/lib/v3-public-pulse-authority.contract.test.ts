import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const server = () => read("src/integrations/v3/public-pulse.server.ts");
const functions = () => read("src/lib/v3-public-pulse.functions.ts");
const runtime = () => read("src/lib/v3-public-pulse-runtime.ts");
const engagement = () => read("src/lib/engagement-data.ts");
const pulseRoute = () => read("src/routes/pulse/index.tsx");

describe("V3 Public Pulse authority", () => {
  it("reads only the caller-invariant System projection", () => {
    expect(server()).toContain('rpc("v3_public_pulse_events"');
    expect(server()).toContain("getSolarisPublicConfig");
    expect(server()).not.toContain("getSolarisAccessTokenServer");
    expect(server()).not.toContain("createSolarisAuthenticatedClientServer");
    expect(server()).not.toContain('.from("content_events")');
    expect(server()).not.toContain("auth.uid");
  });

  it("removes the legacy browser content_events read for every shared Public consumer", () => {
    expect(engagement()).toContain("return useV3PublicPulseEvents(limit)");
    expect(engagement()).not.toContain('.from("content_events")');
    expect(engagement()).toContain('queryClient.invalidateQueries({ queryKey: ["content-events"] })');
  });

  it("accepts only a bounded page size across the browser/server boundary", () => {
    expect(functions()).toContain("z.number().int().min(1).max(50)");
    expect(functions()).not.toContain("userId");
    expect(functions()).not.toContain("profileId");
    expect(functions()).not.toContain("role");
    expect(runtime()).toContain("Math.min(50");
    expect(server()).toContain("p_limit: limit");
    expect(server()).toContain("p_category: null");
  });

  it("preserves the established cache key and avoids eager refetch churn", () => {
    expect(runtime()).toContain('queryKey: ["content-events", limit]');
    expect(runtime()).toContain("staleTime: 30_000");
    expect(runtime()).toContain("refetchOnWindowFocus: false");
    expect(runtime()).toContain("retry: false");
  });

  it("fails closed while the System contract is absent instead of falling back to table reads", () => {
    expect(server()).toContain("missingPublicPulseContract");
    expect(server()).toContain("emptyV3PublicPulseBundle");
    expect(server()).not.toContain("fallback");
  });

  it("does not let the browser clock decide Prediction movement eligibility", () => {
    const route = pulseRoute();
    expect(route).toContain('round.status === "open"');
    expect(route).toContain("const movementAllowed = Boolean(user && pulseRound);");
    expect(route).toContain("usePredictionMovement(pulseRound?.id, movementAllowed)");
    expect(route).not.toContain("useMyPrediction");
    expect(route).not.toContain("new Date(pulseRound.locks_at).getTime() <= now");
    expect(route).not.toContain("new Date(round.locks_at).getTime() > now");
  });
});
