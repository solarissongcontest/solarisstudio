import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("installed V3 Browser Audit display-mode parity", () => {
  it("emulates real standalone CSS on each full navigation without bypassing app navigation assertions", () => {
    const account = source("e2e/account-states.e2e.ts");
    const test = account.slice(account.indexOf('test("server-authorized V3 rollout keeps primary'));
    expect(account).toContain('import { applyNavbarInstalledCssEmulation } from "./v3-navigation/navbar-local-rollout"');
    expect(test).toContain("await applyNavbarInstalledCssEmulation(page);");
    expect(test).toContain('await gotoInstalled("/");');
    expect(test).toContain('await reloadInstalled();');
    expect(test).toContain('await expect(primaryNav).toHaveCSS("display", "block")');
    expect(test).toContain('await expect(primaryNav).toBeVisible()');
    expect(test).toContain('toHaveAttribute("data-solaris-runtime", "standalone")');
    expect(test).not.toContain("test.skip(");
  });

  it("keeps the local CSS emulator scoped and refuses hosted database test traffic", () => {
    const fixture = source("e2e/v3-navigation/navbar-local-rollout.ts");
    const css = source("src/styles/app-shell.css");
    expect(css).toContain(".solaris-app-tabbar,");
    expect(css).toContain("@media (display-mode: standalone), (display-mode: window-controls-overlay)");
    expect(fixture).toContain("export async function applyNavbarInstalledCssEmulation(page: Page)");
    expect(fixture).toContain("NAVBAR_INSTALLED_APP_CSS_EMULATION");
    expect(fixture).toContain("NAVBAR_V3_INSTALLED_GEOMETRY");
    expect(fixture).toContain('if (!["127.0.0.1", "localhost"].includes(supabase.hostname))');
    expect(fixture).toContain('if (!["127.0.0.1", "localhost"].includes(app.hostname))');
  });
});
