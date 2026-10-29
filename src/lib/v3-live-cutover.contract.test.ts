import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const layout = () => read("src/routes/show-mode/route.tsx");
const legacy = () => read("src/routes/show-mode/index.tsx");
const gate = () => read("src/components/v3/V3LiveRouteGate.tsx");

describe("Public V3 Live route cutover", () => {
  it("waits for installed-app resolution before deciding V3 versus legacy", () => {
    const source = layout();
    expect(source).toContain('createFileRoute("/show-mode")');
    expect(source).toContain("platformResolved");
    expect(source).toContain("if (!isAppMode) return <Outlet />");
    expect(source).toContain("<V3LiveRouteGate fallback={<Outlet />} />");
  });

  it("requires global V3 plus the independent server-owned Live flag", () => {
    const source = gate();
    expect(source).toContain("useV3RolloutProbe(true)");
    expect(source).toContain("rollout.data?.enabled === true");
    expect(source).toContain("rollout.data.liveEnabled === true");
    expect(source).toContain("useV3LiveBundle(v3Enabled)");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
    expect(source).not.toContain("VITE_SOLARIS_APP_V3_LIVE");
  });

  it("resolves the gate before legacy archive hooks can mount", () => {
    const parent = layout();
    const oldRoute = legacy();
    expect(parent).toContain("<Outlet />");
    expect(parent).not.toContain("useAllParticipants");
    expect(parent).not.toContain("useAllShows");
    expect(parent).not.toContain("televotingSupabase");
    expect(oldRoute).toContain("useAllParticipants");
    expect(oldRoute).toContain("useAllShows");
  });

  it("keeps V3 Show Mode immersive instead of mounting five-tab app chrome", () => {
    const source = gate();
    expect(source).toContain("V3FoundationShell");
    expect(source).toContain("V3LiveScreen");
    expect(source).not.toContain("V3AppShell");
    expect(source).not.toContain("V3BottomNavigation");
  });

  it("preserves reversible initial fallback without discarding cached V3 authority on refetch errors", () => {
    const source = gate();
    expect(source).toContain("if (!rollout.data || !v3Enabled)");
    expect(source).toContain("if (!bundle.data)");
    expect(source).not.toContain("rollout.isError || !rollout.data");
    expect(source).not.toContain("bundle.isError || !bundle.data");
    expect(source).toContain("rollout.isError || bundle.isError");
    expect(source.match(/return <>{fallback}<\/>;/g)?.length).toBe(1);
    const unavailable = source.slice(source.indexOf("if (!bundle.data)"), source.indexOf("const degraded"));
    expect(unavailable).toContain("<LiveUnavailableSurface");
    expect(unavailable).toContain("bundle.refetch()");
    expect(unavailable).not.toContain("fallback");
  });

  it("preserves the existing Show Mode wake-lock preference as progressive enhancement", () => {
    const source = gate();
    expect(source).toContain("preferences.keepScreenAwake");
    expect(source).toContain('wakeLock.request("screen")');
    expect(source).toContain('document.addEventListener("visibilitychange", onVisibility)');
    expect(source).toContain('update({ keepScreenAwake: checked })');
    expect(source).toContain('aria-label="Keep screen awake in Show Mode"');
    expect(source).toContain("disabled={!wakeLockSupported}");
  });
});
