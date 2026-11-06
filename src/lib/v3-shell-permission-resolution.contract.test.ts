import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const shellSource = () =>
  readFileSync(resolve(process.cwd(), "src/components/AppShell.tsx"), "utf8");

describe("V3 shell permission resolution", () => {
  it("fails closed across viewer identity transitions and stale access requests", () => {
    const source = shellSource();

    expect(source).toContain('type ShellAccessResolution = "resolving" | "ready" | "unavailable"');
    expect(source).toContain("const accessRequestRef = useRef(0)");
    expect(source).toContain("const resolvedUserIdRef = useRef<string | null | undefined>(undefined)");
    expect(source).toContain("const requestId = ++accessRequestRef.current");
    expect(source).toContain("resolvedUserIdRef.current !== nextUserId");
    expect(source).toContain("requestId !== accessRequestRef.current");
    expect(source).toContain("setAccess(EMPTY_ACCESS)");
    expect(source).toContain('setAccessResolution("resolving")');
    expect(source).toContain('setAccessResolution("ready")');
    expect(source).toContain('setAccessResolution("unavailable")');
    expect(source).toContain("accessRequestRef.current += 1");
  });

  it("does not expose permission-sensitive shell navigation before access is ready", () => {
    const source = shellSource();

    expect(source).toContain('const accessReady = accessResolution === "ready"');
    expect(source).toContain('data-solaris-shell-access={state}');
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('isAppMode && accessReady && appScreen.chrome.toolbar !== "hidden"');
    expect(source).toContain('isAppMode && accessReady && appChrome.tabBar !== "hidden"');
    expect(source).toContain('aria-label="Mobile website navigation"');
    expect(source).toContain("disabled={!navigationReady}");
    expect(source).not.toContain('className="mobile-quick-nav');
    expect(source).toContain("disabled={!navigationReady}");
    expect(source).not.toContain("useEffect(() => setNavigationReady(true), [])");
  });

  it("accepts only a genuinely missing anonymous session without unlocking other auth failures", () => {
    const source = shellSource();
    expect(source).toContain('error?.name === "AuthSessionMissingError" && !data.user');
    expect(source).toContain("if (error && !missingSession)");
    expect(source).toContain("markUnavailable(bootstrapRequestId, error)");
    expect(source).toContain("void refresh(data.user?.id ?? null, data.user?.email ?? null)");
  });

  it("positions status below the canonical installed iOS top safe-area boundary", () => {
    const source = shellSource();
    expect(source).toContain("--solaris-app-safe-top, env(safe-area-inset-top)");
    expect(source).toContain("--solaris-app-safe-top-comfort, 6px");
  });

  it("keeps route content mounted while account access is resolving", () => {
    const source = shellSource();

    expect(source).toContain("{children}");
    expect(source).toContain("<ShellAccessStatus state={accessResolution} />");
    expect(source).not.toContain("if (!accessReady) return");
    expect(source).not.toContain("if (accessResolution !== \"ready\") return");
    expect(source).not.toContain("window.location.reload()");
  });
});
