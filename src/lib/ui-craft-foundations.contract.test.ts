import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Solaris UI craft foundations", () => {
  it("keeps one global toast host and enables the full iOS safe-area viewport", () => {
    const root = source("src/routes/__root.tsx");
    expect(root).toContain('import { Toaster } from "../components/ui/sonner"');
    expect(root).toContain("viewport-fit=cover");
    expect(root.match(/<Toaster\s*\/>/g)).toHaveLength(1);
  });

  it("keeps public and Organizer drawers on the accessible shared Sheet primitive", () => {
    const appShell = source("src/components/AppShell.tsx");
    const adminUi = source("src/components/admin/AdminUI.tsx");
    const sheet = source("src/components/ui/sheet.tsx");

    expect(appShell).toContain("SheetContent");
    expect(appShell).toContain('side="right"');
    expect(appShell).not.toContain("document.body.style.overflow");
    expect(adminUi).toContain('side="responsive"');
    expect(adminUi).not.toContain("createPortal");
    expect(adminUi).not.toContain("document.body.style.overflow");
    expect(sheet).toContain("data-solaris-sheet");
    expect(sheet).toContain("slide-in-from-bottom");
    expect(sheet).toContain("slide-in-from-right");
  });

  it("does not animate every CSS property in shared high-frequency primitives", () => {
    for (const path of [
      "src/components/ui/tabs.tsx",
      "src/components/ui/accordion.tsx",
      "src/components/ui/progress.tsx",
      "src/components/ui/input-otp.tsx",
      "src/components/studio/Controls.tsx",
    ]) {
      expect(source(path)).not.toContain("transition-all");
    }
  });

  it("gives core buttons immediate press feedback without forcing motion on reduced-motion users", () => {
    const button = source("src/components/ui/button.tsx");
    expect(button).toContain("active:scale-[0.97]");
    expect(button).toContain("motion-reduce:active:scale-100");
  });

  it("keeps the unified palette in one visual layer and shared motion vocabulary in foundations", () => {
    const styles = source("src/styles.css");
    const unified = source("src/unified-design.css");

    expect(styles).toContain("--motion-fast: 120ms");
    expect(styles).toContain("--motion-ui: 180ms");
    expect(styles).toContain("--motion-panel: 240ms");
    expect(styles).not.toContain("--background: oklch(0.115 0.045 250)");
    expect(unified).toContain("--background: oklch(0.125 0.027 258)");
  });

  it("uses valid full-color tokens in the public desktop layout", () => {
    const layouts = source("src/desktop-public-layouts.css");
    expect(layouts).not.toContain("hsl(var(--");
    expect(layouts).toContain("color-mix(in srgb");
  });

  it("routes the mobile Explore destination to a real Explore hub", () => {
    const appShell = source("src/components/AppShell.tsx");
    const publicNavigation = source("src/components/public/PublicSiteNavigation.tsx");
    const explore = source("src/routes/explore/index.tsx");

    expect(appShell).toContain('to: "/explore"');
    expect(publicNavigation).toContain('nav(\n        "/explore"');
    expect(explore).toContain('createFileRoute("/explore/")');
  });

  it("uses direct mobile navigation labels rather than naming interface mechanisms", () => {
    const organizer = source("src/components/admin/AdminFrame.tsx");
    expect(organizer).toContain('label: "More"');
    expect(organizer).not.toContain('label: "Menu"');
  });

  it("keeps reduced motion useful rather than globally deleting all transition feedback", () => {
    const styles = source("src/styles.css");
    const accessibility = source("src/accessibility.css");

    expect(styles).not.toContain("transition-duration: 0.001ms !important");
    expect(accessibility).toContain("solaris-reduced-fade-in");
    expect(accessibility).toContain("transition-property: color, background-color, border-color, opacity, box-shadow, filter");
  });

  it("keeps scoreboard movement meaningful and avoids near-zero award materialization", () => {
    const scoreboard = source("src/components/Scoreboard.tsx");
    expect(scoreboard).toContain("useReducedMotion");
    expect(scoreboard).toContain("0.92");
    expect(scoreboard).toContain("0.96");
    expect(scoreboard).not.toContain("isTwelve ? 0.2 : 0.6");
  });
});
