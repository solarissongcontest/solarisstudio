import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const rootRoute = () => read("src/routes/rules/index.tsx");
const home = () => read("src/components/rules/RulesHomeV5.tsx");
const detailRoute = () => read("src/routes/rules/$ruleId.tsx");
const searchRoute = () => read("src/routes/rules/search.tsx");
const historyRoute = () => read("src/routes/rules/changes.tsx");
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

  it("keeps search and previous-version browsing inside the same reversible V3 Rules surface", () => {
    const search = searchRoute();
    const history = historyRoute();

    expect(search).toContain("<V3RulesRouteGate");
    expect(search).toContain('data-v3-rules-search=""');
    expect(search).toContain('to="/rules/$ruleId"');
    expect(history).toContain("<V3RulesRouteGate");
    expect(history).toContain('data-v3-rulebook-history=""');
    expect(history).toContain("release.effective_from ?? release.published_at");
    expect(history).toContain("history.isLoading");
    expect(history).toContain("history.isError");
  });

  it("does not create a second client-side rule authority", () => {
    const combined = [rootRoute(), home(), detailRoute(), searchRoute(), historyRoute()].join("\n");

    expect(combined).not.toContain("public_current_rulebook_release");
    expect(combined).not.toContain("public_rulebook_release_history");
    expect(combined).not.toContain("SSC_RULEBOOK =");
    expect(combined).not.toContain("studio2_");
  });
});
