import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const runtimeContext = readFileSync(
  resolve(process.cwd(), "src/components/rules/RulesGovernanceContext.tsx"),
  "utf8",
);
const contextualGuide = readFileSync(
  resolve(process.cwd(), "src/components/rules/ContextualRuleGuide.tsx"),
  "utf8",
);
const root = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");
const appShell = readFileSync(resolve(process.cwd(), "src/components/AppShell.tsx"), "utf8");
const adminNavigation = readFileSync(
  resolve(process.cwd(), "src/components/admin/admin-navigation.ts"),
  "utf8",
);
const publicNavigation = readFileSync(
  resolve(process.cwd(), "src/components/public/PublicSiteNavigation.tsx"),
  "utf8",
);
const libraryProvider = readFileSync(
  resolve(process.cwd(), "src/lib/public-library-governance.ts"),
  "utf8",
);
const legacyLibraryRoute = readFileSync(resolve(process.cwd(), "src/routes/library.tsx"), "utf8");

describe("Rules and Integrity navigation", () => {
  it("keeps published rulebook runtime state without mounting global Rules UI", () => {
    expect(root).toContain("import { RulesGovernanceContext }");
    expect(root).toContain("<RulesGovernanceContext />");
    expect(root).not.toContain("GlobalRulesNavigationAddon");
    expect(runtimeContext).toContain("usePublishedRulebook");
    expect(runtimeContext).toContain("return null");
  });

  it("does not implement a permanent floating Rules or Integrity launcher", () => {
    expect(contextualGuide).not.toContain('className="fixed');
    expect(contextualGuide).not.toContain("createPortal");
    expect(contextualGuide).not.toContain("MutationObserver");
    expect(contextualGuide).not.toContain("document.querySelector");
    expect(contextualGuide).not.toContain("document.createElement");
    expect(contextualGuide).not.toContain("solaris:open-rule");
    expect(contextualGuide).toContain('to="/rules/$ruleId"');
  });

  it("publishes Rules and Integrity destinations to the shared Library search provider", () => {
    expect(libraryProvider).toContain('to: "/rules"');
    expect(libraryProvider).toContain('to: "/rules/changes"');
    expect(libraryProvider).toContain('to: "/rules/interpretations"');
    expect(libraryProvider).toContain('to: "/integrity"');
    expect(libraryProvider).toContain('to: "/integrity/appeals"');
    expect(libraryProvider).toContain('group: "Rules & governance"');
    expect(libraryProvider).toContain('group: "Trust & Integrity"');
    expect(libraryProvider).toContain("searchSscRules");
    expect(libraryProvider).toContain("governanceRuleResults");
  });

  it("provides one complete public sidebar with Rules as a section", () => {
    expect(appShell).toContain("<PublicSiteSidebar");
    expect(appShell).toContain("<PublicDrawerNavigation");
    expect(appShell).toContain('label="Rules & help"');
    expect(publicNavigation).toContain('label: "Rules & help"');
    for (const route of ["/rules", "/rules/changes", "/rules/interpretations", "/integrity", "/integrity/appeals"])
      expect(publicNavigation).toContain(`"${route}",`);
    expect(publicNavigation).not.toContain('label: "Library"');
    expect(legacyLibraryRoute).toContain('createFileRoute("/library")');
    expect(legacyLibraryRoute).toContain('redirect({ to: "/rules"');
  });

  it("exposes organizer Integrity governance workspaces", () => {
    for (const label of ["Investigations", "Appeals", "Evidence", "Identity access"])
      expect(adminNavigation).toContain(`"${label}",`);
    for (const route of ["/admin/integrity-investigations", "/admin/integrity-appeals", "/admin/integrity-evidence", "/admin/integrity-identity"])
      expect(adminNavigation).toContain(`"${route}"`);
  });

  it("exposes organizer Rules and Interpretations workspaces", () => {
    for (const label of ["Rules manager", "Interpretations", "Public rules"])
      expect(adminNavigation).toContain(`"${label}",`);
    for (const route of ["/admin/rules-manager", "/admin/rule-interpretations", "/rules"])
      expect(adminNavigation).toContain(`"${route}"`);
  });
});
