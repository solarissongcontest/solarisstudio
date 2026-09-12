import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { getRuleById } from "@/lib/ssc-rules-v4";

const SURFACES = [
  "src/lib/rule-context.ts",
  "src/components/rules/ContextualRuleGuide.tsx",
  "src/components/rules/AdvancedRulesTools.tsx",
  "src/components/ConfirmationFormWithReceipt.tsx",
  "src/components/televoting/TelevotingBoothWithReceipt.tsx",
  "src/routes/_authenticated/admin/integrity-case.$caseId.tsx",
  "src/routes/_authenticated/admin/integrity-resolution.$caseId.tsx",
  "src/lib/rule-interpretations.ts",
] as const;

function quotedRuleIds(source: string) {
  return [...source.matchAll(/["'](\d+\.\d+)["']/g)].map((match) => match[1]);
}

describe("cross-feature SSC rule references", () => {
  it.each(SURFACES)("keeps every quoted canonical rule reference resolvable in %s", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    const ids = [...new Set(quotedRuleIds(source))];

    expect(ids.length, `${path} should expose at least one exact canonical rule reference`).toBeGreaterThan(0);
    expect(
      ids.filter((ruleId) => !getRuleById(ruleId)),
      `${path} contains a rule reference that is not present in SSC v4`,
    ).toEqual([]);
  });

  it("covers every original-plan integration surface with at least one canonical rule", () => {
    const expectedCoverage: Record<(typeof SURFACES)[number], string[]> = {
      "src/lib/rule-context.ts": ["4.3", "10.1", "11.5", "16.1", "17.1", "18.1"],
      "src/components/rules/ContextualRuleGuide.tsx": [],
      "src/components/rules/AdvancedRulesTools.tsx": ["6.4", "6.5", "6.6", "6.10", "17.2", "18.1"],
      "src/components/ConfirmationFormWithReceipt.tsx": ["4.3", "4.4", "4.6", "4.7", "20.1"],
      "src/components/televoting/TelevotingBoothWithReceipt.tsx": ["10.1", "11.1", "11.2", "11.4", "11.5", "11.7"],
      "src/routes/_authenticated/admin/integrity-case.$caseId.tsx": [],
      "src/routes/_authenticated/admin/integrity-resolution.$caseId.tsx": ["17.2", "17.3", "17.4", "17.5", "18.1"],
      "src/lib/rule-interpretations.ts": [],
    };

    for (const [path, required] of Object.entries(expectedCoverage)) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      for (const ruleId of required) {
        expect(source, `${path} must keep Rule ${ruleId} wired into the product`).toContain(`"${ruleId}"`);
      }
    }
  });
});
