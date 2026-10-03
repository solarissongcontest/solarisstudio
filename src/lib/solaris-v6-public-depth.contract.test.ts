import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const INTEGRITY_ROUTES = [
  "src/routes/integrity/cases/$caseId.tsx",
  "src/routes/integrity/appeal.$caseId.tsx",
  "src/routes/integrity/decisions.tsx",
  "src/routes/integrity/process.tsx",
  "src/routes/integrity/privacy.tsx",
] as const;

const RULES_ROUTES = [
  "src/routes/rules/changes.tsx",
  "src/routes/rules/interpretations.tsx",
] as const;

describe("Solaris V6 Rules and Trust depth harmonisation", () => {
  it("keeps every required Trust surface on the shared Integrity depth grammar", () => {
    for (const path of INTEGRITY_ROUTES) {
      const route = source(path);
      expect(route, path).toContain("<AppShell>");
      expect(route, path).toContain("GovernanceDepthLayout");
      expect(route, path).toContain('tone="integrity"');
    }
  });

  it("keeps Rules history and interpretations on the shared Rules depth grammar", () => {
    for (const path of RULES_ROUTES) {
      const route = source(path);
      expect(route, path).toContain("<AppShell>");
      expect(route, path).toContain("GovernanceDepthLayout");
      expect(route, path).toContain('tone="rules"');
      expect(route, path).toContain('context="rules"');
    }
  });

  it("keeps protected case and appeal detail non-indexable", () => {
    for (const path of [
      "src/routes/integrity/cases/$caseId.tsx",
      "src/routes/integrity/appeal.$caseId.tsx",
    ]) {
      expect(source(path), path).toContain('{ name: "robots", content: "noindex" }');
    }
  });

  it("uses one depth system with connectivity, reading-plane and accessibility fallbacks", () => {
    const component = source("src/components/SolarisDepth.tsx");
    const styles = source("src/solaris-depth.css");

    expect(component).toContain("GovernanceStatusStrip");
    expect(component).toContain("connectivity.status");
    expect(component).toContain("solaris-depth-safe-zone");
    expect(styles).toContain(".solaris-depth-safe-zone::before");
    expect(styles).toContain(".solaris-depth-surface");
    expect(styles).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(styles).toContain('body[data-solaris-family="rules"]');
    expect(styles).toContain('body[data-solaris-family="integrity"]');
  });

  it("does not replace the existing route architecture with a parallel governance shell", () => {
    for (const path of [...INTEGRITY_ROUTES, ...RULES_ROUTES]) {
      const route = source(path);
      expect(route, path).not.toContain("V6Governance");
      expect(route, path).not.toContain("PublicDepthShell");
    }
  });
});
