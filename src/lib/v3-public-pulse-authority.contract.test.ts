import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const server = () => read("src/integrations/v3/public-pulse.server.ts");
const functions = () => read("src/lib/v3-public-pulse.functions.ts");
const runtime = () => read("src/lib/v3-public-pulse-runtime.ts");
const engagement = () => read("src/lib/engagement-data.ts");
const screen = () => read("src/components/v3/V3PulseScreen.tsx");
const gate = () => read("src/components/v3/V3PulseRouteGate.tsx");
const route = () => read("src/routes/pulse/route.tsx");
const legacyRoute = () => read("src/routes/pulse/index.tsx");

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

  it("accepts only bounded presentation scope and a paired cursor across the browser/server boundary", () => {
    expect(functions()).toContain("z.number().int().min(1).max(50)");
    expect(functions()).toContain("cursorSchema");
    expect(functions()).toContain("categorySchema");
    expect(functions()).not.toContain("userId");
    expect(functions()).not.toContain("profileId");
    expect(functions()).not.toContain("role");
    expect(runtime()).toContain("Math.min(50");
    expect(runtime()).toContain("useInfiniteQuery");
    expect(runtime()).toContain("getNextPageParam");
    expect(server()).toContain("p_limit: limit");
    expect(server()).toContain("p_before_published_at: cursor?.publishedAt");
    expect(server()).toContain("p_before_id: cursor?.id");
    expect(server()).toContain("p_category: category");
  });

  it("preserves the established cache key and avoids eager refetch churn for compatibility consumers", () => {
    expect(runtime()).toContain('queryKey: ["content-events", limit]');
    expect(runtime()).toContain("staleTime: 30_000");
    expect(runtime()).toContain("refetchOnWindowFocus: false");
    expect(runtime()).toContain("retry: false");
  });

  it("keeps publication authority out of the installed-app browser surface", () => {
    expect(screen()).not.toContain("localStorage");
    expect(screen()).not.toContain("sessionStorage");
    expect(screen()).not.toContain("Date.now()");
    expect(screen()).not.toContain("useContentEvents");
    expect(screen()).toContain("useV3PublicPulsePages");
  });

  it("keeps personal state separate from public event truth", () => {
    expect(screen()).toContain("useMyFollows");
    expect(screen()).toContain("useEventReads");
    expect(screen()).toContain("useNotificationPreferences");
    expect(screen()).toContain("projectV3PulseFeed");
    expect(screen()).toContain("Latest still uses the same public event identities");
  });

  it("cuts over installed-app Pulse reversibly and keeps the legacy page intact", () => {
    expect(gate()).toContain("firstPage.schemaReady !== true");
    expect(gate()).toContain("rollout.data.enabled !== true");
    expect(gate()).toContain("return <>{fallback}</>");
    expect(route()).toContain("useSolarisApp");
    expect(route()).toContain("if (!isAppMode) return <Outlet />");
    expect(route()).toContain("<V3PulseRouteGate fallback={<Outlet />} />");
    expect(legacyRoute()).toContain("function SolarisPulsePage()");
  });

  it("fails closed while the System contract is absent instead of falling back to table reads", () => {
    expect(server()).toContain("missingPublicPulseContract");
    expect(server()).toContain("emptyV3PublicPulseBundle");
    expect(server()).not.toContain("fallback");
  });

  it("does not let the browser clock decide Prediction movement eligibility", () => {
    const source = legacyRoute();
    expect(source).toContain('round.status === "open"');
    expect(source).toContain("const movementAllowed = Boolean(user && pulseRound);");
    expect(source).toContain("usePredictionMovement(pulseRound?.id, movementAllowed)");
    expect(source).not.toContain("useMyPrediction");
    expect(source).not.toContain("new Date(pulseRound.locks_at).getTime() <= now");
    expect(source).not.toContain("new Date(round.locks_at).getTime() > now");
  });
});
