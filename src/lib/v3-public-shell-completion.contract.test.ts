import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 shared Public shell completion", () => {
  it("keeps pending press separate from engaged lens dragging", () => {
    const tabs = source("src/components/v3/V3LiquidTabBar.tsx");
    const start = tabs.slice(
      tabs.indexOf("const startDrag ="),
      tabs.indexOf("const moveDrag ="),
    );
    const move = tabs.slice(
      tabs.indexOf("const moveDrag ="),
      tabs.indexOf("const selectDestination ="),
    );
    const finish = tabs.slice(
      tabs.indexOf("const finishDrag ="),
      tabs.indexOf("const cancelDrag ="),
    );

    expect(tabs).toContain("engaged: boolean");
    expect(tabs).toContain("if (!held) return;");
    expect(tabs).toContain("drag.engaged = true;");
    expect(tabs).toContain("setDragging(true);");
    expect(tabs).toContain("triggerSelectionHaptic(10);");

    expect(start).toContain("engaged: false");
    expect(start).toContain("beginHold(event.pointerId, event.clientX, event.clientY)");
    expect(start).not.toContain("setDragging(true)");
    expect(start).not.toContain("setAppUpdateBlocker(");

    expect(move).toContain("if (!drag.engaged)");
    expect(move).toContain("holdMovementExceeded(");
    expect(move).toContain("clearDrag();");
    expect(move).toContain("resolveElasticDrag({");

    expect(finish).toContain("if (!drag.engaged)");
    expect(finish).toContain("Pending presses are still ordinary taps");
    expect(finish).toContain("velocityProjectionMs: 110");
    expect(finish).toContain("maxSteps: 1");
    expect(finish).toContain("suppressClick.current = true");
  });

  it("makes the selected lens the expressive Liquid Glass object", () => {
    const css = source("src/styles/v3-shared-public-shell-completion.css");

    expect(css).toContain("The shell stays quiet");
    expect(css).toContain(".v3-liquid-tabbar__lens::before");
    expect(css).toContain(".v3-liquid-tabbar__lens::after");
    expect(css).toContain('data-held="true"');
    expect(css).toContain("scale: 1.36 1.18");
    expect(css).toContain("backdrop-filter: blur(15px) saturate(166%) brightness(1.085)");
  });

  it("keeps compact navigation physically usable rather than merely scaled", () => {
    const completion = source("src/styles/v3-shared-public-shell-completion.css");
    const geometry = source("src/styles/v3-navigation-fixed-geometry.css");

    expect(completion).toContain("Compact is a deliberate morphology");
    expect(geometry).toContain("height: 57px");
    expect(geometry).toContain("min-height: 44px");
    expect(geometry).toContain("width: min(324px");
  });

  it("keeps keyboard-hidden navigation out of focus order", () => {
    const css = source("src/styles/v3-shared-public-shell-completion.css");

    expect(css).toMatch(
      /html\[data-solaris-keyboard-open\][\s\S]*v3-bottom-nav\.v3-liquid-tabbar[\s\S]*visibility: hidden;/,
    );
  });

  it("keeps top chrome below the platform safe boundary without a giant header", () => {
    const css = source("src/styles/v3-shared-public-shell-completion.css");

    expect(css).toContain("--v3-top-system-safe: env(safe-area-inset-top, 0px)");
    expect(css).toContain("--v3-top-safe-comfort: 6px");
    expect(css).toContain("--v3-top-chrome-content-height: 42px");
    expect(css).toContain("var(--v3-top-system-safe) + var(--v3-top-safe-comfort)");
  });

  it("retains Reduced Motion, Reduced Transparency and no-backdrop fallbacks", () => {
    const css = source("src/styles/v3-shared-public-shell-completion.css");

    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(css).toContain("@supports not ((-webkit-backdrop-filter: blur(1px))");
    expect(css).toContain("scale: 1;");
  });

  it("loads the completion layer without replacing frozen geometry ownership", () => {
    const geometry = source("src/styles/v3-navigation-fixed-geometry.css");

    expect(geometry.startsWith('@import "./v3-shared-public-shell-completion.css";')).toBe(true);
    expect(geometry).toContain("aligned with v3-navigation-geometry.ts");
    expect(geometry).toContain("left: 6px !important");
    expect(geometry).toContain("width: 19px");
  });
});
