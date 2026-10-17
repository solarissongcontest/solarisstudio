import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const rulesHome = source("src/components/rules/RulesHomeV5.tsx");
const rulesIndex = source("src/routes/rules/index.tsx");
const rulesGate = source("src/components/v3/V3RulesRouteGate.tsx");

const deepRoutes = [
  ["detail", "src/routes/rules/$ruleId.tsx", 'data-v3-rule-detail=""'],
  ["answers", "src/routes/rules/answers.tsx", 'data-v3-rule-quick-answers=""'],
  ["applied", "src/routes/rules/applied.tsx", "RulesApplyingHere"],
  ["history", "src/routes/rules/changes.tsx", 'data-v3-rulebook-history=""'],
  ["chapter index", "src/routes/rules/chapters/index.tsx", 'data-v3-rulebook-toc=""'],
  ["chapter detail", "src/routes/rules/chapters/$chapter.tsx", 'data-v3-rulebook-chapter=""'],
  ["checker", "src/routes/rules/check.tsx", 'data-v3-rule-checker=""'],
  ["interpretations", "src/routes/rules/interpretations.tsx", 'data-v3-rule-interpretations=""'],
  ["participating", "src/routes/rules/participating.tsx", 'data-v3-rules-participating=""'],
  ["search", "src/routes/rules/search.tsx", 'data-v3-rules-search=""'],
] as const;

describe("V3 public Rules parity", () => {
  it("shows the canonical published version, effective date and history entry point", () => {
    expect(rulesIndex).toContain('effectiveFrom={published.data?.effective_from ?? null}');
    expect(rulesHome).toContain("Current version · v{version}");
    expect(rulesHome).toContain("Effective {effectiveDate}");
    expect(rulesHome).toContain('to="/rules/changes"');
    expect(rulesHome).toContain("Previous versions");
  });

  it.each(deepRoutes)("keeps the %s route inside the reversible V3 Rules gate", (_label, path, marker) => {
    const route = source(path);
    expect(route).toContain('import { V3RulesRouteGate } from "@/components/v3/V3RulesRouteGate"');
    expect(route).toContain("<V3RulesRouteGate");
    expect(route).toContain("legacy={<AppShell>{content}</AppShell>}");
    expect(route).toContain(marker);
  });

  it("keeps missing direct rule IDs inside the same Rules recovery surface", () => {
    const ruleDetail = source("src/routes/rules/$ruleId.tsx");
    expect(ruleDetail).toContain('data-v3-rule-not-found=""');
    expect(ruleDetail).toContain("Back to Rules");
  });

  it("fails closed to proven legacy Rules outside an eligible installed-app rollout", () => {
    expect(rulesGate).toContain("if (!isAppMode) return <>{legacy}</>;");
    expect(rulesGate).toContain("rollout.isError ||");
    expect(rulesGate).toContain("rollout.data?.enabled !== true");
    expect(rulesGate).toContain("rollout.data?.rulesGuidanceEnabled !== true");
    expect(rulesGate).toContain('data-v3-rules-guidance-surface=""');
  });
});
