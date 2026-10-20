import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { V3_ORGANIZER_CAPABILITY_REGISTRY } from "./v3-organizer-capability-registry";
import { V3_PUBLIC_CAPABILITY_REGISTRY } from "./v3-public-capability-registry";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const adminNavigation = source("src/components/admin/admin-navigation.ts");
const rulesGate = source("src/components/v3/V3RulesRouteGate.tsx");

describe("V3 Organizer Public Rules evidence", () => {
  it("treats the visitor-view rulebook link as implemented but below parity", () => {
    const capability = V3_ORGANIZER_CAPABILITY_REGISTRY.find(
      (item) => item.legacyId === "trust-public-rules",
    );

    expect(capability).toBeDefined();
    expect(capability?.migrationStatus).toBe("building");
    expect(capability?.targetDomain).toBe("governance");
    expect(["parity", "cutover", "retired"]).not.toContain(capability?.migrationStatus);
  });

  it("opens the canonical public rulebook rather than duplicating a private Organizer renderer", () => {
    expect(adminNavigation).toContain('"Public rules"');
    expect(adminNavigation).toContain('"Open the rulebook exactly as visitors see it."');
    expect(adminNavigation).toContain('"/rules"');
    expect(rulesGate).toContain("Reversible installed-app chrome cutover for the Rules landing");
    expect(rulesGate).toContain("canonical Rules components remain the content owner");
  });

  it("cannot outrun the Public Rules capability that it previews", () => {
    const publicRules = V3_PUBLIC_CAPABILITY_REGISTRY.find((item) => item.id === "rules");

    expect(publicRules).toBeDefined();
    expect(publicRules?.targetRoute).toBe("/rules");
    expect(publicRules?.sourceFeatureFlags).toContain("solaris_app_v3_rules_guidance");
    expect(publicRules?.specificationStatus).toBe("building");
  });
});
