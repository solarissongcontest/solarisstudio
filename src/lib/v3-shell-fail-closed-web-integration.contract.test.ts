import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const src = () => readFileSync(resolve(process.cwd(), "src/components/AppShell.tsx"), "utf8");

describe("V3 shell fail-closed access and browser header integration", () => {
  it("invalidates stale asynchronous access decisions during every auth transition", () => {
    const shell = src();
    expect(shell).toContain('type ShellAccessResolution = "resolving" | "ready" | "unavailable"');
    expect(shell).toContain("const accessRequestRef = useRef(0)");
    expect(shell).toContain("const requestId = ++accessRequestRef.current");
    expect(shell).toContain("requestId !== accessRequestRef.current");
    expect(shell).toContain("const eventRequestId = ++accessRequestRef.current");
    expect(shell).toContain("eventRequestId !== accessRequestRef.current");
    expect(shell).toContain("accessRequestRef.current += 1");
    expect(shell).toContain("setAccess(EMPTY_ACCESS)");
    expect(shell).toContain('setAccessResolution("resolving")');
    expect(shell).toContain('setAccessResolution("ready")');
    expect(shell).toContain('setAccessResolution("unavailable")');
  });
  it("keeps permission-dependent shell chrome closed until verified", () => {
    const shell = src();
    expect(shell).toContain('const accessReady = accessResolution === "ready"');
    expect(shell).toContain("const navigationReady = accessReady");
    expect(shell).toContain('isAppMode && accessReady && appScreen.chrome.toolbar !== "hidden"');
    expect(shell).toContain('isAppMode && accessReady && appChrome.tabBar !== "hidden"');
    expect(shell).toContain('disabled={!navigationReady}');
    expect(shell).toContain("{accessReady ? (");
    expect(shell).toContain('aria-label="Mobile website navigation"');
    expect(shell).not.toContain('className="mobile-quick-nav');
    expect(shell).not.toContain("useEffect(() => setNavigationReady(true), [])");
  });
  it("treats missing anonymous sessions differently from auth outages", () => {
    const shell = src();
    expect(shell).toContain('error?.name === "AuthSessionMissingError" && !data.user');
    expect(shell).toContain("if (error && !missingSession)");
    expect(shell).toContain("markUnavailable(bootstrapRequestId, error)");
    expect(shell).toContain("void refresh(data.user?.id ?? null, data.user?.email ?? null)");
  });
  it("keeps a safe-area-aware retry without unmounting route content", () => {
    const shell = src();
    expect(shell).toContain("--solaris-app-safe-top, env(safe-area-inset-top)");
    expect(shell).toContain("onRetry={() => setAccessRetry((version) => version + 1)}");
    expect(shell).toContain("Retry access check");
    expect(shell).toContain("data-solaris-shell-access={state}");
    expect(shell).toContain("{children}");
    expect(shell).not.toContain("window.location.reload()");
  });
});
