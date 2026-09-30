import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GOVERNANCE_ACTION_KEYS,
  governanceRules,
  type GovernanceActionKey,
} from "@/lib/governance-v5";
import { getRuleById } from "@/lib/ssc-rules-v4";

const DIRECT_REFERENCE_SURFACES = [
  "src/lib/rule-context.ts",
  "src/lib/governance-v5.ts",
  "src/components/rules/AdvancedRulesTools.tsx",
  "src/routes/_authenticated/admin/integrity-resolution.$caseId.tsx",
] as const;

function quotedRuleIds(source: string) {
  return [...source.matchAll(/["'](\d+\.\d+)["']/g)].map((match) => match[1]);
}

describe("cross-feature SSC rule references", () => {
  it.each(DIRECT_REFERENCE_SURFACES)(
    "keeps every quoted canonical rule reference resolvable in %s",
    (path) => {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      const ids = [...new Set(quotedRuleIds(source))];

      expect(
        ids.length,
        `${path} should expose at least one exact canonical rule reference`,
      ).toBeGreaterThan(0);
      expect(
        ids.filter((ruleId) => !getRuleById(ruleId)),
        `${path} contains a rule reference that is not present in SSC v4`,
      ).toEqual([]);
    },
  );

  it("keeps every Governance OS action backed by resolvable canonical rules", () => {
    expect(GOVERNANCE_ACTION_KEYS.length).toBeGreaterThan(0);
    for (const action of GOVERNANCE_ACTION_KEYS) {
      const rules = governanceRules(action);
      expect(rules.length, action).toBeGreaterThan(0);
      expect(
        rules.filter((rule) => !getRuleById(rule.id)),
        `${action} contains an unresolved canonical rule`,
      ).toEqual([]);
    }
  });

  it("keeps the original-plan participant rule surfaces wired through the central Governance Context Engine", () => {
    const governance = readFileSync(
      resolve(process.cwd(), "src/lib/governance-v5.ts"),
      "utf8",
    );
    const confirmation = readFileSync(
      resolve(process.cwd(), "src/components/ConfirmationFormWithReceipt.tsx"),
      "utf8",
    );
    const televote = readFileSync(
      resolve(process.cwd(), "src/components/televoting/TelevotingBoothWithReceipt.tsx"),
      "utf8",
    );
    const jury = readFileSync(
      resolve(process.cwd(), "src/routes/jury-voting.tsx"),
      "utf8",
    );

    const requiredByAction: Record<GovernanceActionKey, string[]> = {
      "confirmation.submit": ["4.3", "4.4", "4.6", "4.7", "20.1"],
      "entry.submit": ["6.2", "6.4", "6.5", "6.6", "6.10", "12.3"],
      "jury.vote": ["9.1", "9.2", "11.1", "11.2", "11.4", "11.5", "11.7"],
      "televote.vote": ["10.1", "11.1", "11.2", "11.4", "11.5", "11.7"],
      "integrity.report": ["16.1", "16.3", "16.6"],
      "integrity.appeal": ["18.1", "18.3"],
      "integrity.guidance": ["21.1"],
      "hosting.accept": ["8.1", "8.2"],
    };

    for (const [action, ruleIds] of Object.entries(requiredByAction)) {
      expect(governance).toContain(`"${action}"`);
      for (const ruleId of ruleIds) {
        expect(
          governance,
          `${action} must keep Rule ${ruleId} wired into the Governance Context Engine`,
        ).toContain(`ruleId: "${ruleId}"`);
      }
    }

    expect(confirmation).toContain('context="confirmation.submit"');
    expect(televote).toContain('context="televote.vote"');
    expect(jury).toContain('context="jury.vote"');
  });

  it("keeps the sanctions workspace wired to its required canon", () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        "src/routes/_authenticated/admin/integrity-resolution.$caseId.tsx",
      ),
      "utf8",
    );
    for (const ruleId of ["17.2", "17.3", "17.4", "17.5", "18.1"]) {
      expect(source).toContain(`"${ruleId}"`);
    }
  });

  it("keeps dynamic rule consumers backed by canonical resolvers instead of duplicate rule text", () => {
    const contextualGuide = readFileSync(
      resolve(process.cwd(), "src/components/rules/ContextualRuleGuide.tsx"),
      "utf8",
    );
    const governanceUi = readFileSync(
      resolve(process.cwd(), "src/components/rules/GovernanceRules.tsx"),
      "utf8",
    );
    const investigation = readFileSync(
      resolve(
        process.cwd(),
        "src/routes/_authenticated/admin/integrity-case.$caseId.tsx",
      ),
      "utf8",
    );
    const interpretations = readFileSync(
      resolve(process.cwd(), "src/lib/rule-interpretations.ts"),
      "utf8",
    );

    expect(contextualGuide).toContain("getRuleById");
    expect(governanceUi).toContain("governanceRules");
    expect(investigation).toContain("getRuleById");
    expect(investigation).toContain("SSC_RULES");
    expect(interpretations).toMatch(/rule_ids|ruleIds/);
  });
});
