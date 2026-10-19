import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const RULES_CHILD_ROUTES = [
  "src/routes/rules/$ruleId.tsx",
  "src/routes/rules/answers.tsx",
  "src/routes/rules/search.tsx",
  "src/routes/rules/chapters/index.tsx",
  "src/routes/rules/chapters/$chapter.tsx",
  "src/routes/rules/participating.tsx",
  "src/routes/rules/check.tsx",
  "src/routes/rules/interpretations.tsx",
  "src/routes/rules/changes.tsx",
] as const;

describe("Public V3 Rules family cutover", () => {
  it("keeps every remaining public Rules child route inside the shared reversible Rules shell", () => {
    for (const path of RULES_CHILD_ROUTES) {
      const route = read(path);
      expect(route, path).toContain("RulesRouteShell");
      expect(route, path).not.toContain('import { AppShell } from "@/components/AppShell"');
      expect(route, path).not.toContain("<AppShell>");
    }
  });

  it("keeps the shell bridge on the established server-owned Rules rollout and legacy AppShell fallback", () => {
    const shell = read("src/components/rules/RulesRouteShell.tsx");
    const gate = read("src/components/v3/V3RulesRouteGate.tsx");

    expect(shell).toContain("V3RulesRouteGate");
    expect(shell).toContain("legacy={<AppShell>{children}</AppShell>}");
    expect(gate).toContain("useV3RolloutProbe");
    expect(gate).toContain("rollout.data?.rulesGuidanceEnabled !== true");
    expect(gate).toContain("return <>{legacy}</>");
  });

  it("preserves search query, quick-answer hash, chapter and direct-rule deep links", () => {
    const home = read("src/components/rules/RulesHomeV5.tsx");
    const search = read("src/routes/rules/search.tsx");
    const answers = read("src/routes/rules/answers.tsx");
    const chapters = read("src/routes/rules/chapters/index.tsx");
    const chapter = read("src/routes/rules/chapters/$chapter.tsx");

    expect(home).toContain('to: "/rules/search", search: { q }');
    expect(home).toContain('to="/rules/answers"');
    expect(home).toContain("hash={answer.id}");
    expect(search).toContain('validateSearch: (search: Record<string, unknown>)');
    expect(answers).toContain("id={answer.id}");
    expect(chapters).toContain('to="/rules/chapters/$chapter"');
    expect(chapter).toContain('to="/rules/$ruleId"');
  });

  it("preserves current/previous version history and effective-date anchors", () => {
    const changes = read("src/routes/rules/changes.tsx");

    expect(changes).toContain("useRulebookReleaseHistory");
    expect(changes).toContain("rulebookReleaseAnchor(release.version)");
    expect(changes).toContain("release.is_current");
    expect(changes).toContain("release.effective_from ?? release.published_at");
    expect(changes).toContain("release.base_version");
  });

  it("keeps Official Interpretations visibly distinct from rulebook versions", () => {
    const interpretations = read("src/routes/rules/interpretations.tsx");

    expect(interpretations).toContain("getPublicRuleInterpretations");
    expect(interpretations).toContain("They do not silently replace the official regulation or create a new rulebook version.");
    expect(interpretations).toContain('item.status === "superseded"');
    expect(interpretations).toContain("item.effective_from");
  });

  it("keeps the checker advisory and never upgrades client guidance into an official decision", () => {
    const checker = read("src/routes/rules/check.tsx");

    expect(checker).toContain("It is guidance, not an official TSBC eligibility decision.");
    expect(checker).toContain("Needs official review");
    expect(checker).toContain('to="/integrity/preclearance"');
    expect(checker).not.toContain(".insert(");
    expect(checker).not.toContain(".update(");
    expect(checker).not.toContain(".delete(");
  });
});
