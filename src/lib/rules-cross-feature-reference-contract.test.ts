import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  governanceRules,
  type GovernanceActionKey,
} from "@/lib/governance-v5";
import { getRuleById } from "@/lib/ssc-rules-v4";

const DIRECT_REFERENCE_SURFACES = [
  "src/lib/rule-context.ts",
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

  it("keeps Governance OS action contexts wired to their required canon", () => {
    const expectedCoverage: Partial<Record<GovernanceActionKey, string[]>> = {
      "confirmation.submit": ["4.3", "4.6", "4.7", "20.1"],
      "entry.submit": ["6.2", "6.4", "6.5", "6.6", "6.10", "12.3"],
      "jury.vote": ["9.2", "11.2", "11.4", "11.5"],
      "televote.vote": ["10.1", "11.2", "11.4", "11.5"],
      "integrity.report": ["16.1", "16.3", "16.6"],
      "integrity.appeal": ["18.1", "18.3"],
      "integrity.guidance": ["21.1"],
      "hosting.accept": ["8.1", "8.2"],
    };

    for (const [action, required] of Object.entries(expectedCoverage) as Array<
      [GovernanceActionKey, string[]]
    >) {
      const actual = governanceRules(action).map((rule) => rule.id);
      for (const ruleId of required) {
        expect(actual, `${action} must keep Rule ${ruleId} attached`).toContain(
          ruleId,
        );
      }
    }
  });

  it("keeps critical participant wrappers attached to canonical Governance OS contexts", () => {
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
    const entry = readFileSync(
      resolve(process.cwd(), "src/components/ConfirmationForm.tsx"),
      "utf8",
    );

    expect(confirmation).toContain('context="confirmation.submit"');
    expect(televote).toContain('context="televote.vote"');
    expect(jury).toContain('context="jury.vote"');
    expect(entry).toContain('context="entry.submit"');
  });

  it("keeps dynamic rule consumers backed by canonical resolvers instead of duplicate rule text", () => {
    const contextualGuide = readFileSync(
      resolve(process.cwd(), "src/components/rules/ContextualRuleGuide.tsx"),
      "utf8",
    );
    const governance = readFileSync(
      resolve(process.cwd(), "src/lib/governance-v5.ts"),
      "utf8",
    );
    const investigation = readFileSync(
      resolve(process.cwd(), "src/routes/_authenticated/admin/integrity-case.$caseId.tsx"),
      "utf8",
    );
    const interpretations = readFileSync(
      resolve(process.cwd(), "src/lib/rule-interpretations.ts"),
      "utf8",
    );

    expect(contextualGuide).toContain("getRuleById");
    expect(governance).toContain("getRuleById");
    expect(investigation).toContain("getRuleById");
    expect(investigation).toContain("SSC_RULES");
    expect(interpretations).toMatch(/rule_ids|ruleIds/);
  });
});
