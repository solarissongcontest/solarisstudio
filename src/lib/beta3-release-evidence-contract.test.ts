import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Beta 3 release evidence contract", () => {
  const events = source("src/lib/public-ux-events.ts");
  const sections = source("src/features/beta-test/sections-beta3-navigation.ts");
  const dashboard = source("src/routes/_authenticated/admin/beta3-feedback.tsx");
  const metrics = source("src/lib/public-ux-metrics.ts");
  const migration = source(
    "supabase/migrations/20260919131748_beta3_first_click_evidence.sql",
  );

  it("gives every Beta 3 task attempt a unique run identifier", () => {
    expect(events).toContain("runId:");
    expect(events).toContain("task_run: task.runId");
    expect(events).toContain('"task_run"');
    expect(migration).toContain("'task_run'");
    expect(migration).toContain("public_ux_events_task_run_created_idx");
  });

  it("aggregates only organizer-visible, privacy-minimised first-click evidence", () => {
    expect(migration).toContain("admin_beta3_first_click_evidence");
    expect(migration).toContain("security invoker");
    expect(migration).toContain(
      "public.studio2_access_allowed('rollout.manage', null, false)",
    );
    expect(migration).toContain("revoke all on function");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).not.toContain("security definer");
    expect(migration).not.toContain("query_text");
    expect(migration).not.toContain("user_agent");
  });

  it("defines the concrete first-destination expectations for all 12 tasks", () => {
    expect(sections).toContain("BETA3_FIRST_CLICK_EXPECTATIONS");
    expect((sections.match(/"beta3-[^"]+": \[/g) ?? []).length).toBe(12);
  });

  it("uses observed first-click evidence for the rollout decision", () => {
    expect(metrics).toContain("loadBeta3FirstClickEvidence");
    expect(dashboard).toContain("evaluateBeta3FirstClickEvidence");
    expect(dashboard).toContain("Observed first-click success");
    expect(dashboard).toContain("Country entry lookup failures");
    expect(dashboard).toContain("Self-reported immediate finds");
    expect(dashboard).toContain("Supporting signal only");
  });

  it("requires a comparable sample before showing release-ready", () => {
    expect(sections).toContain("minimumResponses: 10");
    expect(dashboard).toContain(
      "submissions.length >= BETA3_RELEASE_GATES.minimumResponses",
    );
    expect(dashboard).toContain('label="Comparable sample"');
  });
});
