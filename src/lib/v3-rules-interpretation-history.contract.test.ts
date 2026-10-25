import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Rules interpretation history", () => {
  it("uses one deterministic Solaris chronology across Rules history surfaces", () => {
    const index = read("src/routes/rules/interpretations.tsx");
    const panel = read("src/components/rules/RuleInterpretationsPanel.tsx");
    const banner = read("src/components/rules/RulebookVersionBanner.tsx");

    for (const source of [index, panel, banner]) {
      expect(source).toContain("formatRulebookHistoryDate");
      expect(source).not.toContain("toLocaleDateString(");
      expect(source).not.toContain("Intl.DateTimeFormat(undefined");
    }
  });

  it("keeps superseded interpretation references historical instead of linking to mutable current rules", () => {
    const index = read("src/routes/rules/interpretations.tsx");
    const panel = read("src/components/rules/RuleInterpretationsPanel.tsx");

    expect(index).toContain(
      "resolveRulebookHistoryRuleTarget(!historical, ruleId)",
    );
    expect(panel).toContain(
      "resolveRulebookHistoryRuleTarget(!historical, ruleId)",
    );
    expect(index).toContain("currentRuleTarget ? (");
    expect(panel).toContain("currentRuleTarget ? (");
    expect(index).toContain("historical reference");
    expect(panel).toContain("historical reference");
  });

  it("preserves the existing publication-safe interpretation authority", () => {
    const index = read("src/routes/rules/interpretations.tsx");
    const panel = read("src/components/rules/RuleInterpretationsPanel.tsx");
    const authority = read("src/lib/rule-interpretations.ts");

    expect(index).toContain("getPublicRuleInterpretations(null)");
    expect(panel).toContain("getPublicRuleInterpretations(ruleId)");
    expect(authority).toContain('rpc<RuleInterpretation[]>("public_rule_interpretations"');
    expect(index).not.toContain(".from(");
    expect(panel).not.toContain(".from(");
    expect(index).not.toContain("service_role");
    expect(panel).not.toContain("service_role");
  });
});
