import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 direct-lens overlay arbitration", () => {
  it("refuses to begin a shared Public/Organizer lens drag under an existing feature overlay", () => {
    const file = source("src/components/v3/V3LiquidTabBar.tsx");
    const start = file.indexOf("const startDrag =");
    const end = file.indexOf("const moveDrag =", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const startDrag = file.slice(start, end);
    const overlayGuard = startDrag.indexOf(
      'document.documentElement.hasAttribute("data-solaris-feature-overlay-open")',
    );
    const keyboardGuard = startDrag.indexOf(
      'document.documentElement.hasAttribute("data-solaris-keyboard-open")',
    );
    const capture = startDrag.indexOf("setPointerCapture");

    expect(overlayGuard).toBeGreaterThanOrEqual(0);
    expect(keyboardGuard).toBeGreaterThan(overlayGuard);
    expect(capture).toBeGreaterThan(keyboardGuard);
  });

  it("keeps Organizer cutover on the same shared Liquid primitive", () => {
    const mobile = source("src/components/admin/OrganizerV3MobileChrome.tsx");
    expect(mobile).toContain("V3LiquidTabBar");
    expect(mobile).not.toContain("OrganizerV6TabBar");
  });
});
