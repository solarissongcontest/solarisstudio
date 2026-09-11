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
  it("keeps global rule state and contextual workflow help mounted", () => {
    expect(root).toContain('import { GlobalRulesNavigationAddon }');
    expect(root).toContain("<GlobalRulesNavigationAddon />");
    expect(addon).toContain("usePublishedRulebook");
    expect(addon).toContain("<ContextualRuleGuide />");
  });

  it("does not render a permanent public Rules or Integrity launcher", () => {
    expect(addon).not.toContain('to="/rules"');
    expect(addon).not.toContain('to="/integrity"');
    expect(addon).not.toContain("fixed");
    expect(addon).not.toContain("createPortal");
    expect(addon).not.toContain("MutationObserver");
    expect(addon).not.toContain("document.querySelector");
    expect(addon).not.toContain("document.createElement");
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
  });

  it("provides a real public Library host for governance discovery", () => {
    expect(publicLibrary).toContain('createFileRoute("/library")');
    expect(publicLibrary).toContain("Search Solaris");
    expect(publicLibrary).toContain("<GovernanceLibraryResults");
    expect(publicLibrary).toContain("getPublicRuleInterpretations");
    expect(publicLibrary).toContain('aria-label="Search Solaris Library"');
    expect(libraryResults).toContain("searchGovernanceLibrary");
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
