import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("installed app overlay ownership", () => {
  it("uses one canonical overlay stack and active-state ownership", () => {
    const manager = source("src/components/app/AppOverlayManager.tsx");
    const styles = source("src/styles.css");
    const appStyles = source("src/styles/app-shell.css");
    const dialog = source("src/components/ui/dialog.tsx");
    const sheet = source("src/components/ui/sheet.tsx");
    const dropdown = source("src/components/ui/dropdown-menu.tsx");
    const popover = source("src/components/ui/popover.tsx");

    expect(manager).toContain("data-solaris-feature-overlay-open");
    expect(manager).toContain('[data-solaris-sheet][data-state="open"]');
    expect(manager).toContain('[data-solaris-dialog][data-state="open"]');

    expect(styles).toContain("--solaris-z-popover: 80");
    expect(styles).toContain("--solaris-z-sheet: 90");
    expect(styles).toContain("--solaris-z-dialog: 100");
    expect(dialog).toContain("z-[var(--solaris-z-dialog)]");
    expect(sheet).toContain("z-[var(--solaris-z-sheet)]");
    expect(dropdown).toContain("z-[var(--solaris-z-popover)]");
    expect(popover).toContain("z-[var(--solaris-z-popover)]");

    expect(styles).toContain("html:not([data-solaris-app]) .app-main");
    expect(appStyles).toContain("[data-solaris-feature-overlay-open] .solaris-app-tabbar");
    expect(appStyles).toContain('data-side="bottom"');
    expect(appStyles).toContain("--solaris-app-safe-bottom");
  });
});
