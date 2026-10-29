import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Rules historical correctness", () => {
  it("keeps release-history chronology deterministic", () => {
    const route = read("src/routes/rules/changes.tsx");
    const policy = read("src/lib/v3-rulebook-history.ts");

    expect(route).toContain("formatRulebookHistoryDate(");
    expect(route).not.toContain("toLocaleDateString(");
    expect(policy).toContain('RULEBOOK_HISTORY_LOCALE = "en-GB"');
    expect(policy).toContain("timeZone: SOLARIS_TIME_ZONE");
    expect(policy).not.toContain("Intl.DateTimeFormat(undefined");
  });

  it("does not deep-link an old release into mutable current-rule truth", () => {
    const route = read("src/routes/rules/changes.tsx");
    const policy = read("src/lib/v3-rulebook-history.ts");

    expect(route).toContain(
      "resolveRulebookHistoryRuleTarget(isCurrentRelease, change.rule_id)",
    );
    expect(route).toContain("currentRuleTarget ? (");
    expect(route).toContain("Historical snapshot");
    expect(policy).toContain("if (!isCurrentRelease) return null;");
    expect(policy).toContain('to: "/rules/$ruleId"');
  });

  it("preserves the existing publication-safe history authority", () => {
    const route = read("src/routes/rules/changes.tsx");
    const governance = read("src/lib/rules-governance.ts");
    const combined = `${route}\n${governance}`;

    expect(route).toContain("useRulebookReleaseHistory()");
    expect(governance).toContain('rpc("public_rulebook_release_history")');
    expect(route).not.toContain(".from(");
    expect(route).not.toContain("createClient(");
    expect(combined).not.toContain("service_role");
  });
});
