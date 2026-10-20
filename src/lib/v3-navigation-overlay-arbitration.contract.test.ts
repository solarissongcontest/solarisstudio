import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function startDragSource(path: string) {
  const file = source(path);
  const start = file.indexOf("const startDrag =");
  const end = file.indexOf("const moveDrag =", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return file.slice(start, end);
}

describe("V3 direct-lens overlay arbitration", () => {
  it.each([
    "src/components/v3/V3LiquidTabBar.tsx",
    "src/components/admin/OrganizerV6TabBar.tsx",
  ])("refuses to begin a navigation drag under an existing feature overlay: %s", (path) => {
    const startDrag = startDragSource(path);
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
});
