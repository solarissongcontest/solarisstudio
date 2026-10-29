import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const motion = readFileSync("public/assets/terraos-maintenance.js", "utf8");
const baseCss = readFileSync("public/assets/terraos-maintenance.css", "utf8");
const storyCss = readFileSync("public/assets/terraos-maintenance-story.css", "utf8");
const page = readFileSync("src/lib/maintenance-page.ts", "utf8");

describe("maintenance / Confirmation top system safe-zone reference", () => {
  it("keeps the normal maintenance shell safe even before defensive runtime refinement", () => {
    expect(baseCss).toContain(".product-bar{position:fixed");
    expect(baseCss).toContain("top:max(.7rem,env(safe-area-inset-top))");
    expect(page).toContain('name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"');
  });

  it("establishes one defensive iOS standalone safe boundary for maintenance chrome", () => {
    expect(motion).toContain("data-terraos-ios-standalone");
    expect(motion).toContain("/iPad|iPhone|iPod/i");
    expect(motion).toContain("(display-mode: standalone)");
    expect(motion).toContain("--terra-system-safe-top");
    expect(motion).toContain("--terra-safe-content-top");
    expect(motion).toContain("max(env(safe-area-inset-top, 0px), 3.875rem)");
    expect(motion).toContain("@media (orientation: landscape)");
  });

  it("routes the fixed product bar and full-screen Story header through the same boundary", () => {
    expect(baseCss).toContain(".product-bar{");
    expect(storyCss).toContain(".story-view-header {");
    expect(motion).toContain(".product-bar {");
    expect(motion).toContain("top: var(--terra-safe-content-top) !important");
    expect(motion).toContain(".story-view-header {");
    expect(motion).toContain("padding-top: max(.55rem, var(--terra-safe-content-top)) !important");
  });

  it("keeps Confirmation anchors and focused Story controls below persistent top chrome", () => {
    expect(motion).toContain("--terra-top-obstruction");
    expect(motion).toContain("#confirmation-access");
    expect(motion).toContain("[data-confirmation-host]");
    expect(motion).toContain('[tabindex]:not([tabindex="-1"])');
    expect(motion).toContain("scroll-margin-block-start: var(--terra-top-obstruction)");
  });

  it("does not move Confirmation state or authorization into the navigation runtime", () => {
    expect(motion).toContain("confirmationHost.appendChild(portal)");
    expect(motion).not.toContain("supabase.auth");
    expect(motion).not.toContain("confirmation_response");
    expect(motion).not.toContain("service_role");
  });
});
