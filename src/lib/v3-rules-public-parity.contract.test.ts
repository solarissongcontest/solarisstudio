import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const rootRoute = () => read("src/routes/rules/index.tsx");
const home = () => read("src/components/rules/RulesHomeV5.tsx");
const detailRoute = () => read("src/routes/rules/$ruleId.tsx");
const searchRoute = () => read("src/routes/rules/search.tsx");
const historyRoute = () => read("src/routes/rules/changes.tsx");
const chaptersRoute = () => read("src/routes/rules/chapters/index.tsx");
const chapterRoute = () => read("src/routes/rules/chapters/$chapter.tsx");
const participatingRoute = () => read("src/routes/rules/participating.tsx");
const answersRoute = () => read("src/routes/rules/answers.tsx");
const checkerRoute = () => read("src/routes/rules/check.tsx");
const interpretationsRoute = () => read("src/routes/rules/interpretations.tsx");
const appliedRoute = () => read("src/routes/rules/applied.tsx");
const governance = () => read("src/lib/rules-governance.ts");

describe("V3 Public Rules parity", () => {
  it("surfaces canonical current-version and effective-date metadata with history access", () => {
    const route = rootRoute();
    const screen = home();

    expect(route).toContain("effectiveFrom={published.data?.effective_from ?? null}");
    expect(screen).toContain('data-v3-rulebook-release-meta=""');
    expect(screen).toContain("Current version · v{version}");
    expect(screen).toContain("Effective {effectiveDate}");
    expect(screen).toContain('to="/rules/changes"');
    expect(screen).toContain("Previous versions");

    expect(governance()).toContain('rpc("public_current_rulebook_release")');
    expect(governance()).toContain('rpc("public_rulebook_release_history")');
  });

  it("keeps canonical rule deep links and missing-rule recovery inside the reversible V3 Rules gate", () => {
    const route = detailRoute();

    expect(route).toContain("<V3RulesRouteGate");
    expect(route).toContain('data-v3-rule-detail=""');
    expect(route).toContain('data-v3-rule-not-found=""');
    expect(route).toContain("legacy={<AppShell>{content}</AppShell>}");
    expect(route).toContain('to="/rules"');
  });

  it("keeps search, table of contents and previous-version browsing inside the V3 Rules surface", () => {
    const search = searchRoute();
    const history = historyRoute();
    const chapters = chaptersRoute();
    const chapter = chapterRoute();

    expect(search).toContain("<V3RulesRouteGate");
    expect(search).toContain('data-v3-rules-search=""');
    expect(search).toContain('to="/rules/$ruleId"');
    expect(history).toContain("<V3RulesRouteGate");
    expect(history).toContain('data-v3-rulebook-history=""');
    expect(history).toContain("release.effective_from ?? release.published_at");
    expect(history).toContain("history.isLoading");
    expect(history).toContain("history.isError");
    expect(chapters).toContain("<V3RulesRouteGate");
    expect(chapters).toContain('data-v3-rulebook-toc=""');
    expect(chapter).toContain("<V3RulesRouteGate");
    expect(chapter).toContain('data-v3-rulebook-chapter=""');
  });

  it("keeps contextual participant guidance, quick answers, checker and interpretations inside Rules", () => {
    const participating = participatingRoute();
    const answers = answersRoute();
    const checker = checkerRoute();
    const interpretations = interpretationsRoute();
    const applied = appliedRoute();

    for (const source of [participating, answers, checker, interpretations, applied]) {
      expect(source).toContain("<V3RulesRouteGate");
      expect(source).toContain("legacy={<AppShell>{content}</AppShell>}");
    }
    expect(participating).toContain('data-v3-rules-participating=""');
    expect(answers).toContain('data-v3-rule-quick-answers=""');
    expect(checker).toContain('data-v3-rule-checker=""');
    expect(interpretations).toContain('data-v3-rule-interpretations=""');
  });

  it("does not create a second client-side rule authority", () => {
    const combined = [
      rootRoute(),
      home(),
      detailRoute(),
      searchRoute(),
      historyRoute(),
      chaptersRoute(),
      chapterRoute(),
      participatingRoute(),
      answersRoute(),
      checkerRoute(),
      interpretationsRoute(),
      appliedRoute(),
    ].join("\n");

    expect(combined).not.toContain("public_current_rulebook_release");
    expect(combined).not.toContain("public_rulebook_release_history");
    expect(combined).not.toContain("SSC_RULEBOOK =");
    expect(combined).not.toContain("studio2_");
  });
});
