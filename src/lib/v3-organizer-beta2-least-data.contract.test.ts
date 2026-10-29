import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/beta2-feedback.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260820162000_close_beta1_open_beta2.sql",
  "utf8",
);

const dashboardFields = [
  "id",
  "tester_name",
  "device",
  "browser",
  "familiarity",
  "answers",
  "bug_reports",
  "created_at",
] as const;

describe("V3 Organizer Beta 2 least-data feedback read", () => {
  it("selects only the fields the Organizer dashboard renders", () => {
    const match = route.match(
      /\.from\("beta2_test_submissions" as never\)\s*\.select\("([^"]+)"\)/,
    );

    expect(match?.[1]?.split(",")).toEqual(dashboardFields);
    expect(route).not.toContain('.select("*")');
  });

  it("does not download unused screenshot, user-agent, or form-version data", () => {
    expect(migration).toContain("screenshot_paths text[]");
    expect(migration).toContain("user_agent text");
    expect(migration).toContain("form_version integer");

    const projection = dashboardFields.join(",");
    expect(projection).not.toContain("screenshot_paths");
    expect(projection).not.toContain("user_agent");
    expect(projection).not.toContain("form_version");
  });

  it("preserves the complete response population used by release-target math", () => {
    expect(route).toContain('.order("created_at", { ascending: false })');
    expect(route).not.toContain(".limit(");
    expect(route).not.toContain(".range(");
    expect(route).toContain("percent(submissions");
    expect(route).toContain("countLabel(submissions");
    expect(route).toContain("averageNumber(submissions");
    expect(route).toContain("averagePercent(submissions");
  });

  it("keeps the historical Beta 1 comparison count head-only", () => {
    expect(route).toContain(
      'supabase.from("beta_test_submissions" as never).select("id", { count: "exact", head: true })',
    );
  });

  it("remains a private, read-only Organizer surface", () => {
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".delete(");
  });
});
