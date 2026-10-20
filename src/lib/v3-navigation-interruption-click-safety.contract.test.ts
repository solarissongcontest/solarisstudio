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
};

describe("V3 navigation interruption click safety", () => {
  it("cancels Public lens presses without allowing a trailing click to navigate", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");

    assertInterruptedGestureClickSafety(tabs);
    expect(tabs).toMatch(/data-solaris-feature-overlay-open[\s\S]*interruptDrag\(\)/);
    expect(tabs).toMatch(/data-solaris-keyboard-open[\s\S]*interruptDrag\(\)/);
    expect(tabs).toContain("if (suppressClick.current) {");
    expect(tabs).toContain("suppressClick.current = false;");
  });

  it("applies the same cancellation rule to Organizer lens presses", () => {
    const tabs = source("src/components/admin/OrganizerV6TabBar.tsx");

    assertInterruptedGestureClickSafety(tabs);
    expect(tabs).toMatch(/data-solaris-feature-overlay-open[\s\S]*interruptDrag\(\)/);
    expect(tabs).toMatch(/data-solaris-keyboard-open[\s\S]*interruptDrag\(\)/);
    expect(tabs).toContain("if (suppressClick.current) {");
    expect(tabs).toContain("suppressClick.current = false;");
  });
});
