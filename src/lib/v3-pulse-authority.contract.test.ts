import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const server = () => read("src/integrations/v3/public-pulse.server.ts");
const functions = () => read("src/lib/v3-pulse.functions.ts");
const runtime = () => read("src/lib/v3-pulse-runtime.ts");
const screen = () => read("src/components/v3/V3PulseScreen.tsx");
const gate = () => read("src/components/v3/V3PulseRouteGate.tsx");

describe("Public V3 Pulse authority", () => {
  it("consumes only the caller-invariant System event projection", () => {
    expect(server()).toContain('rpc("v3_public_pulse_events"');
    expect(server()).not.toContain('.from("content_events")');
    expect(server()).not.toContain("Date.now()");
    expect(functions()).not.toContain("userId");
    expect(functions()).not.toContain("profileId");
    expect(functions()).not.toContain("publishedAt: new Date");
  });

  it("keeps stable pagination paired and bounded", () => {
    expect(server()).toContain("p_limit: 30");
    expect(server()).toContain("p_before_published_at: cursor?.publishedAt");
    expect(server()).toContain("p_before_id: cursor?.id");
    expect(functions()).toContain("pulseCursorSchema");
    expect(runtime()).toContain("useInfiniteQuery");
    expect(runtime()).toContain("getNextPageParam");
  });

  it("keeps publication authority out of browser storage and clocks", () => {
    expect(screen()).not.toContain("localStorage");
    expect(screen()).not.toContain("sessionStorage");
    expect(screen()).not.toContain("Date.now()");
    expect(screen()).not.toContain("useContentEvents");
  });

  it("keeps personal state separate from public event truth", () => {
    expect(screen()).toContain("useMyFollows");
    expect(screen()).toContain("useEventReads");
    expect(screen()).toContain("useNotificationPreferences");
    expect(screen()).toContain("projectV3PulseFeed");
    expect(screen()).toContain("Latest still uses the same public event identities");
  });

  it("fails back to the established route until projection and rollout are ready", () => {
    expect(gate()).toContain("firstPage.schemaReady !== true");
    expect(gate()).toContain("rollout.data.enabled !== true");
    expect(gate()).toContain("return <>{fallback}</>");
  });
});
