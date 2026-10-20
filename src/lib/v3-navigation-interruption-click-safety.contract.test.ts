import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const assertInterruptedGestureClickSafety = (tabs: string) => {
  const interruptStart = tabs.indexOf("const interruptDrag = useCallback");
  const interruptEnd = tabs.indexOf("useEffect(() => {", interruptStart);
  const interrupt = tabs.slice(interruptStart, interruptEnd);

  expect(interruptStart).toBeGreaterThan(-1);
  expect(interrupt).toContain("if (dragState.current) suppressClick.current = true;");
  expect(interrupt).toContain("clearDrag();");
  expect(tabs).toContain("const resetInterruptedGesture = () => interruptDrag();");
  expect(tabs).toContain('document.visibilityState !== "visible") interruptDrag();');
  expect(tabs).not.toContain("const resetInterruptedGesture = () => clearDrag();");

  // Canonical N11 interruption matrix: environment/lifecycle interruptions must
  // all reach the interruption-safe path rather than only resetting visuals.
  expect(tabs).toContain('window.addEventListener("blur", resetInterruptedGesture);');
  expect(tabs).toContain('window.addEventListener("resize", resetInterruptedGesture);');
  expect(tabs).toContain('window.addEventListener("orientationchange", resetInterruptedGesture);');
  expect(tabs).toContain('window.addEventListener("pagehide", resetInterruptedGesture);');
  expect(tabs).toContain("window.addEventListener(APP_RESUME_EVENT, resetInterruptedGesture);");
  expect(tabs).toContain('document.addEventListener("visibilitychange", resetWhenHidden);');
  expect(tabs).toMatch(/data-solaris-feature-overlay-open[\s\S]*interruptDrag\(\)/);
  expect(tabs).toMatch(/data-solaris-keyboard-open[\s\S]*interruptDrag\(\)/);

  // Pointer cancellation/lost capture have their own pointer identity guard in
  // cancelDrag. Keep both event hooks explicit so capture loss cannot strand
  // drag/update-blocker state even though normal release also loses capture.
  expect(tabs).toContain("onPointerCancel={cancelDrag}");
  expect(tabs).toContain("onLostPointerCapture={cancelDrag}");

  // `pathname` is the route-redirect generation boundary. Effect cleanup must
  // interrupt, not merely clear DOM state.
  expect(tabs).toContain("  }, [interruptDrag, pathname]);");
  expect(tabs).toMatch(
    /document\.removeEventListener\("visibilitychange", resetWhenHidden\);[\s\S]{0,650}interruptDrag\(\);/,
  );
};

const assertFreshPointerClearsStaleSuppression = (tabs: string) => {
  const startDragStart = tabs.indexOf("const startDrag = (");
  const startDragEnd = tabs.indexOf("const moveDrag =", startDragStart);
  const startDrag = tabs.slice(startDragStart, startDragEnd);
  const suppressionReset = startDrag.indexOf(
    "if (!dragState.current) suppressClick.current = false;",
  );
  const inactiveGuard = startDrag.indexOf("!active ||");

  expect(startDragStart).toBeGreaterThan(-1);
  expect(suppressionReset).toBeGreaterThan(-1);
  expect(inactiveGuard).toBeGreaterThan(suppressionReset);
};

describe("V3 navigation interruption click safety", () => {
  it("cancels Public lens presses across the canonical N11 interruption matrix", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");

    assertInterruptedGestureClickSafety(tabs);
    expect(tabs).toContain("if (suppressClick.current) {");
    expect(tabs).toContain("suppressClick.current = false;");
  });

  it("clears stale Public and Organizer click suppression before inactive-tab guards", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    assertFreshPointerClearsStaleSuppression(publicTabs);
    assertFreshPointerClearsStaleSuppression(organizerTabs);
  });

  it("prevents a completed long press from falling through into navigation", () => {
    const publicTabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const organizerTabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    for (const tabs of [publicTabs, organizerTabs]) {
      expect(tabs).toContain("const longPressed = held");
      expect(tabs).toMatch(/suppressClick\.current = (?:drag\.moved|moved) \|\| longPressed/);
      expect(tabs).toContain("if (longPressed ||");
    }
  });

  it("remounts Public mobile navigation when viewer identity generation changes", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(shell).toContain("const navigationInteractionKey = navigationIdentityReady");
    expect(shell).toContain(': "resolving";');
    expect(shell).toContain("key={navigationInteractionKey}");
  });

  it("applies the same interruption matrix to the legacy Organizer fallback", () => {
    const tabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    assertInterruptedGestureClickSafety(tabs);
    expect(tabs).toContain("if (suppressClick.current) {");
    expect(tabs).toContain("suppressClick.current = false;");
  });

  it("remounts canonical Organizer Liquid navigation for every shell context generation", () => {
    const chrome = source("src/components/admin/OrganizerV3MobileChrome.tsx");

    expect(chrome).toContain("const { editionId, contextVersion } = useAdminContext();");
    expect(chrome).toContain(
      'const navigationInteractionKey = `${navigationScope ?? "unscoped"}:${contextVersion}`;',
    );
    expect(chrome).toContain("key={navigationInteractionKey}");
  });

  it("keeps the same context-switch interruption safety on the Organizer fallback", () => {
    const chrome = source("src/components/admin/OrganizerV6MobileChrome.tsx");

    expect(chrome).toContain("const { editionId, contextVersion } = useAdminContext();");
    expect(chrome).toContain('key={`organizer-navigation:${contextVersion}`}');
  });
});
