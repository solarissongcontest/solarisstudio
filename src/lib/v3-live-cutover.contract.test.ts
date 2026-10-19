import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Live route cutover", () => {
  it("uses only the canonical server-owned Live rollout contract", () => {
    const gate = read("src/components/v3/V3LiveRouteGate.tsx");
    const probe = read("src/integrations/v3/rollout-probe.server.ts");

    expect(gate).toContain("useV3RolloutProbe");
    expect(gate).toContain("rollout.data?.enabled === true");
    expect(gate).toContain("rollout.data?.liveEnabled === true");
    expect(probe).toContain("liveEnabled: boolean");
    expect(probe).toContain('p_key: "solaris_app_v3_live"');
    expect(gate).not.toContain("VITE_SOLARIS_APP_V3_LIVE");
    expect(gate).not.toContain("localStorage");
    expect(gate).not.toContain("sessionStorage");
  });

  it("keeps web, disabled, failed probe and failed snapshot states on proven legacy Show Mode", () => {
    const gate = read("src/components/v3/V3LiveRouteGate.tsx");

    expect(gate).toContain("if (!isAppMode) return <>{legacy}</>");
    expect(gate).toContain("rollout.isError");
    expect(gate).toContain("rollout.data?.enabled !== true");
    expect(gate).toContain("rollout.data.liveEnabled !== true");
    expect(gate).toContain("if (live.isError || !live.data) return <>{legacy}</>");
  });

  it("does not mount the legacy query fan-out when V3 owns the route", () => {
    const route = read("src/routes/show-mode/index.tsx");

    expect(route).toContain("component: ShowModeRoute");
    expect(route).toContain("<V3LiveRouteGate legacy={<LegacyShowModePage />} />");
    expect(route).toContain("function LegacyShowModePage()");
    expect(route).toContain("useAllParticipants");
    expect(route).toContain("useAllShows");
  });

  it("keeps Show Mode outside the full five-tab V3 shell", () => {
    const gate = read("src/components/v3/V3LiveRouteGate.tsx");
    const shellPolicy = read("src/lib/v3-shell-route-boundary.test.ts");

    expect(gate).not.toContain("V3AppShell");
    expect(gate).toContain('data-v3-live-cutover="active"');
    expect(shellPolicy).toContain('decide("/show-mode")');
    expect(shellPolicy).toContain('reason).toBe("immersive_screen")');
  });

  it("loads the Live snapshot only after app mode and both rollout gates are true", () => {
    const gate = read("src/components/v3/V3LiveRouteGate.tsx");

    expect(gate).toContain("const v3Enabled =");
    expect(gate).toContain("platformResolved &&");
    expect(gate).toContain("isAppMode &&");
    expect(gate).toContain("rollout.data?.enabled === true &&");
    expect(gate).toContain("rollout.data?.liveEnabled === true");
    expect(gate).toContain("useV3LiveBundle(v3Enabled)");
  });

  it("preserves spoiler-free, wake-lock and Live telemetry behavior", () => {
    const gate = read("src/components/v3/V3LiveRouteGate.tsx");
    const screen = read("src/components/v3/V3LiveScreen.tsx");

    expect(gate).toContain("useAppExperiencePreferences");
    expect(gate).toContain("preferences.keepScreenAwake");
    expect(gate).toContain('trackPublicUxEvent("app_show_mode_state"');
    expect(gate).toContain("WAKE_LOCK_STATES");
    expect(screen).toContain("Spoiler-free mode");
    expect(screen).toContain("Keep screen awake");
    expect(screen).toContain("onSpoilerFreeChange");
    expect(screen).toContain("onKeepScreenAwakeChange");
  });

  it("still refuses to infer a current performer from elapsed time", () => {
    const projection = read("src/lib/v3-live.ts");
    const screen = read("src/components/v3/V3LiveScreen.tsx");

    expect(projection).toContain("intentionally leaves current/next/progress absent");
    expect(projection).not.toContain("currentPerformance:");
    expect(screen).toContain("authoritative performer cursor");
    expect(screen).not.toContain("Date.now()");
  });
});
