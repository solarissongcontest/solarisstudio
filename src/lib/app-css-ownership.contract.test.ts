import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

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

  it("keeps protected installed-app geometry out of legacy CSS files", () => {
    const protectedTokens = [
      ".solaris-app-toolbar",
      ".solaris-app-tabbar",
      "--solaris-app-toolbar-height",
      "--solaris-app-tabbar-height",
      "--solaris-app-bottom-obstruction",
    ];
    const violations: string[] = [];

    const visit = (directory: string) => {
      for (const name of readdirSync(directory)) {
        const path = join(directory, name);
        const entry = statSync(path);
        if (entry.isDirectory()) {
          if (path.includes("styles/personality-sources")) continue;
          visit(path);
          continue;
        }
        if (!name.endsWith(".css") || path === "src/styles/app-shell.css") continue;
        const css = readFileSync(path, "utf8");
        for (const token of protectedTokens) {
          if (css.includes(token)) violations.push(`${path}: ${token}`);
        }
      }
    };

    visit("src");

    expect(
      violations,
      "Installed toolbar/tabbar geometry belongs only to styles/app-shell.css.",
    ).toEqual([]);
  });

  it("keeps Wiki mobile tools on the shared overlay primitive", () => {
    const wiki = source("src/components/wiki/CountryWikiExperience.tsx");
    const wikiCss = source("src/country-wiki-v8.css");

    expect(wiki).toContain("<SheetContent");
    expect(wiki).toContain('className="solaris-app-wiki-sheet wiki-sheet-panel"');
    expect(wikiCss).not.toContain(".wiki-sheet {");
    expect(wikiCss).not.toContain(".wiki-sheet-backdrop");
    expect(wikiCss).not.toContain("z-index: 120");
  });

  it("makes modal surfaces suppress the installed tab bar", () => {
    const css = source("src/styles/app-shell.css");
    expect(css).toContain(':has([data-solaris-sheet][data-state="open"]) .solaris-app-tabbar');
    expect(css).toContain(':has([data-solaris-dialog][data-state="open"]) .solaris-app-tabbar');
    expect(css).toContain("pointer-events: none");
  });
});
