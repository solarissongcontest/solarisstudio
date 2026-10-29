import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOLARIS_FEATURE_RULES,
  SOLARIS_FEATURE_FLAGS,
} from "./feature-flags";
import { STUDIO2_PRODUCT_SURFACES } from "./studio2-product-surfaces";
import { RULE_CONTEXT_PATHS, sanitizeRuleContextPath } from "./rule-context";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = () =>
  read("supabase/migrations/20261013150000_v3_rules_guidance_cutover.sql");
const previousMigration = () =>
  read("supabase/migrations/20261013140000_v3_search_cutover.sql");
const probe = () => read("src/integrations/v3/rollout-probe.server.ts");
const shell = () => read("src/components/v3/V3AppShell.tsx");
const gate = () => read("src/components/v3/V3RulesRouteGate.tsx");
const rulesRoute = () => read("src/routes/rules/index.tsx");
const appliedRoute = () => read("src/routes/rules/applied.tsx");
const governance = () => read("src/components/rules/GovernanceRules.tsx");
const rulebookRuntime = () => read("src/lib/rules-governance.ts");

function constrainedFlagKeys(source: string) {
  const constraint = source.match(
    /add constraint studio2_feature_flags_key_check check\s*\(\s*key in \(([\s\S]*?)\)\s*\)/,
  );
  if (!constraint) return [];
  return [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("V3 Rules & Guidance cutover", () => {
  it("registers an independent disabled-by-default Rules guidance slice", () => {
    expect(SOLARIS_FEATURE_FLAGS).toContain("solaris_app_v3_rules_guidance");
    expect(DEFAULT_SOLARIS_FEATURE_RULES.solaris_app_v3_rules_guidance).toEqual({
      enabled: false,
    });
    expect(STUDIO2_PRODUCT_SURFACES.solaris_app_v3_rules_guidance.dependsOn).toEqual([
      "solaris_app_v3",
    ]);
    expect(STUDIO2_PRODUCT_SURFACES.solaris_app_v3_rules_guidance.route).toBe("/rules");

    const sql = migration();
    expect(sql).toContain("'solaris_app_v3_rules_guidance'");
    expect(sql).toContain("on conflict (key) do nothing");
    expect(sql).toMatch(/'solaris_app_v3_rules_guidance',\s*false,/);
  });

  it("extends the post-Search persisted vocabulary without deleting any existing key", () => {
    const before = constrainedFlagKeys(previousMigration());
    const after = constrainedFlagKeys(migration());

    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((key) => !after.includes(key))).toEqual([]);
    expect(after).toContain("public_ia_v3");
    expect(after).toContain("solaris_app_v3_search");
    expect(after).toContain("solaris_app_v3_rules_guidance");
    expect(new Set(after).size).toBe(after.length);
  });

  it("keeps rollout authority on the server and fails closed with global V3", () => {
    const source = probe();

    expect(source).toContain("rulesGuidanceEnabled: boolean");
    expect(source).toContain('p_key: "solaris_app_v3_rules_guidance"');
    expect(source).toContain("rulesGuidanceEnabled: false");
    expect(source).toMatch(
      /enabled\s*&&\s*!rulesGuidanceFlag\.error\s*&&\s*rulesGuidanceFlag\.data === true/,
    );
    expect(source).not.toMatch(/VITE_.*RULE|localStorage|sessionStorage/i);
  });

  it("adds one shell Rules entry that reuses only canonical sanitized workflow context", () => {
    const source = shell();

    expect(source).toContain('rollout.data?.rulesGuidanceEnabled === true');
    expect(source).toContain("getRuleContext(pathname)");
    expect(source).toContain("sanitizeRuleContextPath(ruleContext?.sourcePath)");
    expect(source).toContain('to={(ruleContextPath ? "/rules/applied" : "/rules") as any}');
    expect(source).toContain("search={ruleContextPath ? ({ context: ruleContextPath } as any) : undefined}");
    expect(source).toContain('data-v3-rules-guidance-entry=""');
    expect(source).toContain('aria-label={ruleContextPath ? "Rules for this task" : "Rules"}');
    expect(source).not.toContain("GOVERNANCE_ACTION_STORAGE_KEY");
    expect(source).not.toContain("RULE_CONTEXT_STORAGE_KEY");
  });

  it("cuts only the Rules landing and applied-guidance chrome while preserving legacy fallback", () => {
    const routeGate = gate();
    const root = rulesRoute();
    const applied = appliedRoute();

    expect(routeGate).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(routeGate).toContain("rollout.data?.rulesGuidanceEnabled !== true");
    expect(routeGate).toContain('data-v3-primary-boot=""');
    expect(routeGate).toContain('data-v3-rules-guidance-surface=""');
    expect(routeGate).toContain("<V3AppShell");
    expect(routeGate).not.toContain("supabase");

    expect(root).toContain("<V3RulesRouteGate");
    expect(root).toContain("legacy={<AppShell>{content}</AppShell>}");
    expect(root).toContain("<RulesHomeV5");
    expect(applied).toContain("<V3RulesRouteGate");
    expect(applied).toContain("legacy={<AppShell>{content}</AppShell>}");
    expect(applied).toContain("<RulesApplyingHere");
  });

  it("validates explicit contextual handoff before using it and retains session fallback", () => {
    const source = appliedRoute();

    expect(source).toContain("validateSearch");
    expect(source).toContain("sanitizeRuleContextPath(search.context)");
    expect(source).toContain("resolveAppliedRulesContext({ explicitContextPath: contextPath ?? \"\" })");
    expect(source).toContain("GOVERNANCE_ACTION_STORAGE_KEY");
    expect(source).toContain("RULE_CONTEXT_STORAGE_KEY");
    expect(source).toContain("RulesApplyingHere context={context}");
  });

  it("keeps the versioned rulebook and workflow guidance as the only rule authorities", () => {
    const combined = [shell(), gate(), rulesRoute(), appliedRoute()].join("\n");

    expect(rulebookRuntime()).toContain('rpc("public_current_rulebook_release")');
    expect(governance()).toContain("governanceRules(context)");
    expect(governance()).toContain('to="/rules/$ruleId"');
    expect(combined).not.toContain("SSC_RULEBOOK =");
    expect(combined).not.toContain("SSC_RULES =");
    expect(combined).not.toContain("public_current_rulebook_release");
    expect(combined).not.toContain("public_rulebook_release_history");
  });

  it("keeps contextual navigation privacy-bounded to deliberate route families", () => {
    expect(RULE_CONTEXT_PATHS).toEqual(
      expect.arrayContaining([
        "/confirmations",
        "/televoting",
        "/jury-voting",
        "/integrity",
        "/participate",
        "/admin/design",
      ]),
    );
    expect(sanitizeRuleContextPath("/participate")).toBe("/participate");
    expect(sanitizeRuleContextPath("/integrity/cases/private-case-id")).toBeUndefined();
    expect(sanitizeRuleContextPath("/jury-voting?ballot=secret")).toBeUndefined();
    expect(sanitizeRuleContextPath("/my-solaris/entry?user=someone")).toBeUndefined();
  });

  it("does not expose a browser-controlled Rules rollout escape hatch", () => {
    const combined = [migration(), probe(), shell(), gate(), rulesRoute(), appliedRoute()].join("\n");

    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_RULES");
    expect(combined).not.toContain('localStorage.getItem("solaris_app_v3_rules_guidance"');
    expect(combined).not.toContain('sessionStorage.getItem("solaris_app_v3_rules_guidance"');
  });
});
