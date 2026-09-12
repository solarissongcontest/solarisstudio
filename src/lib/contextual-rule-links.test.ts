import { describe, expect, it } from "vitest";

import { routeContext } from "@/components/rules/ContextualRuleGuide";
import { RULE_CONTEXT_PATHS, sanitizeRuleContextPath } from "@/lib/rule-context";
import { getRuleById } from "@/lib/ssc-rules-v4";

const ROUTES = [
  "/confirmations",
  "/televoting",
  "/jury-voting",
  "/admin/friend-voting",
  "/admin/jury-integrity",
  "/admin/integrity",
  "/admin/integrity-case/example",
  "/participate",
  "/admin/entries",
  "/admin/participant-status",
  "/admin/design",
  "/admin/edition-theme",
] as const;

describe("contextual rule links", () => {
  it.each(ROUTES)("only exposes existing rule IDs on %s", (pathname) => {
    const context = routeContext(pathname);
    expect(context, `${pathname} should have contextual rule guidance`).not.toBeNull();

    const missing = (context?.ruleIds ?? []).filter((ruleId) => !getRuleById(ruleId));
    expect(missing, `${pathname} references missing rules: ${missing.join(", ")}`).toEqual([]);
  });

  it("routes jury-integrity to integrity guidance before the generic jury context", () => {
    const context = routeContext("/admin/jury-integrity");
    expect(context?.title).toBe("Voting-integrity rules");
    expect(context?.ruleIds).toContain("16.5");
    expect(context?.sourcePath).toBe("/admin/friend-voting");
  });

  it("publishes only coarse route-family values for Library context", () => {
    expect(RULE_CONTEXT_PATHS).toContain("/confirmations");
    expect(RULE_CONTEXT_PATHS).toContain("/integrity");
    expect(sanitizeRuleContextPath("/confirmations")).toBe("/confirmations");
    expect(sanitizeRuleContextPath("/integrity")).toBe("/integrity");
    expect(sanitizeRuleContextPath("/admin/integrity-case/secret-case-id")).toBeUndefined();
    expect(sanitizeRuleContextPath("/integrity?case=secret-case-id")).toBeUndefined();
    expect(sanitizeRuleContextPath("https://example.invalid/steal-context")).toBeUndefined();
  });

  it("does not create contextual help where no workflow context is defined", () => {
    expect(routeContext("/rules")).toBeNull();
    expect(routeContext("/totally-unrelated-page")).toBeNull();
  });
});
