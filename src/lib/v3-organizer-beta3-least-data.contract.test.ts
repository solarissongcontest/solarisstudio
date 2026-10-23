import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/beta3-feedback.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260919112558_beta3_navigation_feedback.sql",
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

describe("V3 Organizer Beta 3 least-data feedback read", () => {
  it("selects only the fields the Organizer dashboard renders", () => {
    const match = route.match(
      /\.from\("beta3_test_submissions" as never\)\s*\.select\("([^"]+)"\)/,
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

  it("preserves the complete response population used by release-gate math", () => {
    expect(route).toContain('.order("created_at", { ascending: false })');
    expect(route).not.toContain(".limit(");
    expect(route).not.toContain(".range(");
    expect(route).toContain("submissions.length >= BETA3_RELEASE_GATES.minimumResponses");
    expect(route).toContain("const mobileSuccess = overallTaskSuccess(mobile)");
    expect(route).toContain("loadBeta3FirstClickEvidence(90)");
  });
});