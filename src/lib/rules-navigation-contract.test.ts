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
const adminNav = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminNav.tsx"),
  "utf8",
);
const libraryProvider = readFileSync(
  resolve(process.cwd(), "src/lib/public-library-governance.ts"),
  "utf8",
);
const libraryResults = readFileSync(
  resolve(process.cwd(), "src/components/library/GovernanceLibraryResults.tsx"),
  "utf8",
);
const publicLibrary = readFileSync(
  resolve(process.cwd(), "src/routes/library.tsx"),
  "utf8",
);

describe("Rules and Integrity navigation", () => {
  it("keeps published rulebook runtime state without mounting global Rules UI", () => {
    expect(root).toContain('import { RulesGovernanceContext }');
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

  it("provides a context-sensitive public Library host for governance discovery", () => {
    expect(appShell).toContain('to: "/library"');
    expect(appShell).toContain('label: "Library"');
    expect(publicLibrary).toContain('createFileRoute("/library")');
    expect(publicLibrary).toContain("sanitizeRuleContextPath");
    expect(publicLibrary).toContain("getRuleContext");
    expect(publicLibrary).toContain("GovernanceLibraryContextResults");
    expect(publicLibrary).toContain("Search Solaris");
    expect(publicLibrary).toContain("<GovernanceLibraryResults");
    expect(publicLibrary).toContain("getPublicRuleInterpretations");
    expect(publicLibrary).toContain('aria-label="Search Solaris Library"');
    expect(libraryResults).toContain("searchGovernanceLibrary");
    expect(libraryResults).toContain("governanceRuleResults");
    expect(libraryResults).toContain("Relevant here");
    expect(libraryResults).toContain('aria-label="Rules and Integrity Library results"');
  });

  it("exposes organizer Integrity governance workspaces", () => {
    expect(adminNav).toContain('label: "Integrity"');
    expect(adminNav).toContain('to: "/admin/integrity-investigations"');
    expect(adminNav).toContain('label: "Appeals"');
    expect(adminNav).toContain('to: "/admin/integrity-appeals"');
    expect(adminNav).toContain('label: "Evidence"');
    expect(adminNav).toContain('to: "/admin/integrity-evidence"');
    expect(adminNav).toContain('label: "Identity access"');
    expect(adminNav).toContain('to: "/admin/integrity-identity"');
  });

  it("exposes organizer Rules and Interpretations workspaces", () => {
    expect(adminNav).toContain('label: "Rules manager"');
    expect(adminNav).toContain('to: "/admin/rules-manager"');
    expect(adminNav).toContain('label: "Interpretations"');
    expect(adminNav).toContain('to: "/admin/rule-interpretations"');
    expect(adminNav).toContain('label: "Public rules"');
    expect(adminNav).toContain('to: "/rules"');
  });
});
