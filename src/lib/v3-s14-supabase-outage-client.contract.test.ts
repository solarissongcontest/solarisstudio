import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const archive = source(".github/scripts/v3-s14-stage-10-archive.sh");
const connectivity = source("src/lib/app-connectivity.ts");
const runtime = source("src/components/app/AppRuntime.tsx");
const overlayManager = source("src/components/app/AppOverlayManager.tsx");
const outageBanner = source("src/components/app/AppOfflineBanner.tsx");

describe("S14 Supabase outage client-degraded-state contract", () => {
  it("keeps the destructive failure injection loopback-only and requires transport failure", () => {
    expect(archive).toContain("run_s14_supabase_outage_injection");
    expect(archive).toContain("http://127.0.0.1:1");
    expect(archive).toContain("--connect-timeout 1");
    expect(archive).toContain("--max-time 2");
    expect(archive).toContain("simulated Supabase outage unexpectedly produced transport success");
    expect(archive).not.toMatch(/https?:\/\/[^\s'\"]*supabase\.co/i);
  });

  it("maps a reachable device with an unreachable app origin to canonical degraded connectivity", () => {
    expect(connectivity).toContain('| "degraded"');
    expect(connectivity).toContain("snapshot.originReachable === false");
    expect(connectivity).toContain('? "degraded"');
    expect(connectivity).toContain("originReachable: false");
    expect(runtime).toContain("createAppConnectivityController(setConnectivity)");
    expect(runtime).toContain("root.dataset.solarisConnectivity = connectivity.status");
  });

  it("surfaces every non-online app connectivity state through the canonical outage banner", () => {
    expect(runtime).toContain("<AppOverlayManager");
    expect(overlayManager).toContain('connectivity.status !== "online"');
    expect(overlayManager).toContain("<AppOfflineBanner connectivity={connectivity} />");
    expect(outageBanner).toContain('connectivity.status === "online"');
    expect(outageBanner).toContain('data-solaris-app-connectivity={connectivity.status}');
    expect(outageBanner).toContain('role="status"');
    expect(outageBanner).toContain('aria-live="polite"');
  });

  it("tells critical-task clients to pause during degraded service instead of implying success", () => {
    expect(outageBanner).toContain("Solaris cannot reliably reach the app service. Keep this task paused until the connection recovers.");
    expect(outageBanner).toContain("a failed request is never treated as a submission");
    expect(archive).toContain("client-visible Supabase outage changed authoritative archived state");
    expect(archive).toContain("client-visible Supabase outage fabricated or lost Archive operation truth");
    expect(archive).toContain("S14_FAILURE_SUPABASE_OUTAGE_COMPLETE");
  });
});
