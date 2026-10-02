import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("installed app CSS ownership", () => {
  it("keeps installed bottom clearance under app-shell ownership", () => {
    const base = source("src/styles.css");
    const unified = source("src/unified-design.css");
    const typography = source("src/card-typography.css");
    const app = source("src/styles/app-shell.css");

    expect(base).toContain("html:not([data-solaris-app]) .app-main");
    expect(unified).toContain("html:not([data-solaris-app]) .app-main");
    expect(typography).toContain("html:not([data-solaris-app]) .app-main");

    expect(app).toContain("--solaris-app-bottom-obstruction");
    expect(app).toContain("var(--solaris-app-bottom-obstruction");
  });

  it("defines one named overlay stack instead of component-specific magic numbers", () => {
    const base = source("src/styles.css");
    const sheet = source("src/components/ui/sheet.tsx");
    const dialog = source("src/components/ui/dialog.tsx");
    const popover = source("src/components/ui/popover.tsx");
    const menu = source("src/components/ui/dropdown-menu.tsx");

    for (const token of [
      "--solaris-z-toolbar",
      "--solaris-z-tabbar",
      "--solaris-z-popover",
      "--solaris-z-sheet-backdrop",
      "--solaris-z-sheet",
      "--solaris-z-dialog-backdrop",
      "--solaris-z-dialog",
      "--solaris-z-system-critical",
    ]) {
      expect(base).toContain(token);
    }

    expect(sheet).toContain("var(--solaris-z-sheet)");
    expect(dialog).toContain("var(--solaris-z-dialog)");
    expect(popover).toContain("var(--solaris-z-popover)");
    expect(menu).toContain("var(--solaris-z-popover)");
  });

  it("makes modal surfaces suppress the installed tab bar", () => {
    const css = source("src/styles/app-shell.css");
    expect(css).toContain(':has([data-solaris-sheet][data-state="open"]) .solaris-app-tabbar');
    expect(css).toContain(':has([data-solaris-dialog][data-state="open"]) .solaris-app-tabbar');
    expect(css).toContain("pointer-events: none");
  });
});
