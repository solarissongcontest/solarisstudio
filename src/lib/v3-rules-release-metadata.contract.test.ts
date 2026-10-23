import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Public V3 Rules release metadata", () => {
  it("binds the landing page to the canonical published release metadata", () => {
    const route = read("src/routes/rules/index.tsx");
    const home = read("src/components/rules/RulesHomeV5.tsx");

    expect(route).toContain("usePublishedRulebook()");
    expect(route).toContain("version={published.version}");
    expect(route).toContain(
      "effectiveFrom={published.data?.effective_from ?? null}",
    );

    expect(home).toContain('data-v3-rulebook-release-meta=""');
    expect(home).toContain("Current version · v{version}");
    expect(home).toContain("Effective {effectiveDate}");
    expect(home).toContain('to="/rules/changes"');
    expect(home).toContain("Previous versions");
  });

  it("formats effective dates deterministically in canonical Solaris time", () => {
    const home = read("src/components/rules/RulesHomeV5.tsx");

    expect(home).toContain('import { SOLARIS_TIME_ZONE } from "@/lib/public-time"');
    expect(home).toContain('new Intl.DateTimeFormat("en-GB"');
    expect(home).toContain("timeZone: SOLARIS_TIME_ZONE");
    expect(home).not.toContain("Intl.DateTimeFormat(undefined");
    expect(home).not.toContain("toLocaleDateString(");
    expect(home).not.toContain("toLocaleString(");
  });

  it("fails soft when a release has no valid effective date", () => {
    const home = read("src/components/rules/RulesHomeV5.tsx");

    expect(home).toContain("if (!value) return null;");
    expect(home).toContain("if (Number.isNaN(date.getTime())) return null;");
    expect(home).toContain("{effectiveDate ? <span>Effective {effectiveDate}</span> : null}");
  });

  it("does not create a second Rules data authority", () => {
    const home = read("src/components/rules/RulesHomeV5.tsx");
    const route = read("src/routes/rules/index.tsx");
    const combined = `${home}\n${route}`;

    expect(combined).not.toContain(".from(");
    expect(combined).not.toContain(".rpc(");
    expect(combined).not.toContain("createClient(");
    expect(combined).not.toContain("Date.now()");
  });
});
