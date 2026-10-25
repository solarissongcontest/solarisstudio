import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/lib/maintenance-page.ts", "utf8");
const baseCss = readFileSync("public/assets/terraos-maintenance.css", "utf8");
const polish = readFileSync("public/assets/terraos-maintenance-story-polish.js", "utf8");

describe("TerraOS maintenance Story interaction polish", () => {
  it("loads the small interaction layer after the canonical Story runtime", () => {
    const runtimeIndex = page.indexOf("/assets/terraos-maintenance-story.js");
    const polishIndex = page.indexOf("/assets/terraos-maintenance-story-polish.js");
    expect(runtimeIndex).toBeGreaterThan(-1);
    expect(polishIndex).toBeGreaterThan(runtimeIndex);
  });

  it("keeps the entire Story card tappable even over its fixture preview", () => {
    expect(baseCss).toContain(".terra-preview-frame");
    expect(baseCss).toContain("pointer-events:none");
  });

  it("gives direct Story deep links an intentional accessible focus target", () => {
    expect(polish).toContain("focusDirectDeepLink");
    expect(polish).toContain("[data-story-close]");
    expect(polish).toContain("focus({ preventScroll: true })");
  });

  it("uses transform-only FLIP movement for Results perspective reordering", () => {
    expect(polish).toContain("getBoundingClientRect()");
    expect(polish).toContain("translate3d(${deltaX}px, ${deltaY}px, 0)");
    expect(polish).toContain("translate3d(0, 0, 0)");
    expect(polish).toContain("duration: 420");
    expect(polish).toContain("cubic-bezier(.2,.75,.2,1)");
  });

  it("removes reordering motion for Reduced Motion and performs no network IO", () => {
    expect(polish).toContain("prefers-reduced-motion: reduce");
    expect(polish).toContain("reducedMotion.matches");
    expect(polish).not.toContain("fetch(");
    expect(polish).not.toContain("XMLHttpRequest");
    expect(polish).not.toContain("supabase.co");
  });
});
