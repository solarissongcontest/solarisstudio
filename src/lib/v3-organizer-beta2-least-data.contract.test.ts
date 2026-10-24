import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/_authenticated/admin/beta2-feedback.tsx", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260820162000_close_beta1_open_beta2.sql",
  "utf8",
);

describe("V3 Organizer Beta 2 least-data boundary", () => {
  it("selects only fields the dashboard renders or uses for its metrics", () => {
    expect(route).toContain(
      '"id,tester_name,device,browser,familiarity,answers,bug_reports,created_at"',
    );
    expect(route).toContain(".select(BETA2_DASHBOARD_COLUMNS)");
    expect(route).not.toContain('.select("*")');
  });

  it("does not transfer legacy telemetry that the dashboard does not consume", () => {
    for (const column of ["screenshot_paths", "user_agent", "form_version"]) {
      expect(migration).toContain(column);
      expect(route).not.toContain(`,${column}`);
      expect(route).not.toContain(`${column},`);
    }
  });

  it("preserves the complete response population because release percentages depend on it", () => {
    expect(route).toContain('.order("created_at", { ascending: false })');
    expect(route).not.toContain(".range(");
    expect(route).not.toContain(".limit(");
    expect(route).toContain("percent(submissions");
    expect(route).toContain("countLabel(submissions");
  });

  it("retains the separate count-only Beta 1 comparison read and private crawler metadata", () => {
    expect(route).toContain('.select("id", { count: "exact", head: true })');
    expect(route).toContain('{ name: "robots", content: "noindex, nofollow" }');
    expect(route).not.toContain(".insert(");
    expect(route).not.toContain(".update(");
    expect(route).not.toContain(".delete(");
  });
});
