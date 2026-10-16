import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("V3 app shell migration contract", () => {
  it("keeps the five stable product areas and existing canonical routes", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    for (const destination of [
      ["home", "/", "Home"],
      ["explore", "/explore", "Explore"],
      ["participate", "/participate", "Participate"],
      ["results", "/results", "Results"],
      ["me", "/my-solaris", "Me"],
    ] as const) {
      const [id, to, label] = destination;
      expect(shell).toContain(`id: "${id}", label: "${label}", to: "${to}"`);
    }
  });

  it("keeps Participate attention scoped while Notifications reuses the shared attention summary", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");

    expect(shell).toContain('destination.id === "participate" ? participateAttentionCount : 0');
    expect(shell).toContain("const attention = useAppAttentionSummary()");
    expect(shell).toContain('attention.me > 9 ? "9+" : attention.me');
    expect(shell).not.toContain("localStorage");
    expect(shell).not.toContain("sessionStorage");
  });

  it("keeps semantic links authoritative while liquid gestures remain progressive enhancement", () => {
    const shell = source("src/components/v3/V3AppShell.tsx");
    const tabbar = source("src/components/v3/V3LiquidTabBar.tsx");

    expect(shell).toContain("<V3LiquidTabBar");
    expect(shell).toContain("getV3PublicTabDestination");
    expect(shell).toContain("markV3PublicNavigationRestore");
    expect(shell).not.toContain("onPointerMove");
    expect(shell).not.toContain("onTouchMove");
    expect(shell).not.toContain("onLongPress");

    expect(tabbar).toContain('aria-label="Primary app navigation"');
    expect(tabbar).toContain('aria-current={active ? "page" : undefined}');
    expect(tabbar).toContain("<Link");
    expect(tabbar).toContain("onPointerMove={moveDrag}");
    expect(tabbar).toContain("prefersReducedMotion()");
    expect(tabbar).toContain("maxSteps: 1");
    expect(tabbar).not.toContain("localStorage");
    expect(tabbar).not.toContain("sessionStorage");
    expect(tabbar).not.toContain("supabase");
    expect(tabbar).not.toContain("fetch(");
  });

  it("uses Solaris glass, hysteresis and interruption-safe direct manipulation", () => {
    const tabbar = source("src/components/v3/V3LiquidTabBar.tsx");
    const css = source("src/styles/v3-liquid-tabbar.css");

    expect(tabbar).toContain("KubeLiquidGlassBackdrop");
    expect(tabbar).toContain("useScrollResponsiveBar");
    expect(tabbar).toContain("useSolarisPressHold");
    expect(tabbar).toContain("rubberBand: true");
    expect(tabbar).toContain("velocityProjectionMs: 110");
    expect(tabbar).toContain('window.addEventListener("blur", resetInterruptedGesture)');
    expect(tabbar).toContain('window.addEventListener("resize", resetInterruptedGesture)');
    expect(tabbar).toContain('window.addEventListener("orientationchange", resetInterruptedGesture)');
    expect(tabbar).toContain('document.addEventListener("visibilitychange", resetWhenHidden)');

    expect(css).toContain(".v3-liquid-tabbar__lens");
    expect(css).toContain('[data-collapsed="true"]');
    expect(css).toContain("prefers-reduced-motion: reduce");
    expect(css).toContain("prefers-reduced-transparency: reduce");
    expect(css).toContain("touch-action: pan-y");
    expect(css).toContain("--v3-bottom-obstruction");
    expect(css).toContain("contain: strict");
  });

  it("uses the shared visualViewport keyboard contract instead of hoisting fixed chrome", () => {
    const tabbar = source("src/components/v3/V3LiquidTabBar.tsx");
    const css = source("src/styles/v3-liquid-tabbar.css");

    expect(tabbar).toContain('data-solaris-keyboard-open');
    expect(tabbar).toContain("window.visualViewport?.addEventListener");
    expect(css).toContain('html[data-solaris-keyboard-open]');
    expect(css).toContain("pointer-events: none");
  });
});
