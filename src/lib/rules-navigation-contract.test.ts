import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const addon = readFileSync(
  resolve(process.cwd(), "src/components/GlobalRulesNavigationAddon.tsx"),
  "utf8",
);
const root = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");
const adminNav = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminNav.tsx"),
  "utf8",
);

describe("Rules and Integrity navigation", () => {
  it("mounts the global public navigation addon", () => {
    expect(root).toContain('import { GlobalRulesNavigationAddon }');
    expect(root).toContain("<GlobalRulesNavigationAddon />");
  });

  it("puts Rules, Interpretations and Trust & Integrity in desktop and mobile quick access", () => {
    expect(addon).toContain('to="/rules"');
    expect(addon).toContain('to="/rules/changes"');
    expect(addon).toContain('to="/rules/interpretations"');
    expect(addon).toContain('to="/integrity"');
    expect(addon).toContain("Rules & integrity");
    expect(addon).toContain("Official SSC rules");
    expect(addon).toContain("Official interpretations");
    expect(addon).toContain("Trust & Integrity");
    expect(addon).toContain("lg:hidden");
    expect(addon).toContain("hidden lg:block");
  });

  it("uses normal React rendering instead of mutating the AppShell DOM", () => {
    expect(addon).not.toContain("createPortal");
    expect(addon).not.toContain("MutationObserver");
    expect(addon).not.toContain("document.querySelector");
    expect(addon).not.toContain("document.createElement");
    expect(addon).not.toContain("data-solaris-rules-nav-host");
  });

  it("exposes organizer Integrity, Appeals, Evidence, Rules and Interpretations workspaces", () => {
    expect(adminNav).toContain('label: "Integrity"');
    expect(adminNav).toContain('to: "/admin/integrity-investigations"');
    expect(adminNav).toContain('label: "Appeals"');
    expect(adminNav).toContain('to: "/admin/integrity-appeals"');
    expect(adminNav).toContain('label: "Evidence"');
    expect(adminNav).toContain('to: "/admin/integrity-evidence"');
    expect(adminNav).toContain('label: "Rules manager"');
    expect(adminNav).toContain('to: "/admin/rules-manager"');
    expect(adminNav).toContain('label: "Interpretations"');
    expect(adminNav).toContain('to: "/admin/rule-interpretations"');
    expect(adminNav).toContain('label: "Public rules"');
    expect(adminNav).toContain('to: "/rules"');
  });
});
