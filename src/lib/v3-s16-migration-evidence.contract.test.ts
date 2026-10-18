import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/rules-integrity-migration-rehearsal.yml", "utf8");

describe("S16 migration rehearsal exact-SHA evidence", () => {
  it("requires an explicit exact current-main SHA for release-grade manual runs", () => {
    expect(workflow).toContain("candidate_sha:");
    expect(workflow).toContain("required: true");
    expect(workflow).toContain("Release-grade migration dispatch must target current main");
    expect(workflow).toContain("V3_MIGRATION_SOURCE_SHA");
  });

  it("checks out and verifies the exact source in both canonical rehearsal paths", () => {
    expect(workflow.match(/ref: \$\{\{ env\.V3_MIGRATION_SOURCE_SHA \}\}/g)?.length).toBeGreaterThanOrEqual(3);
    expect(workflow).toContain("Migration rehearsal checked out $actual, expected $expected");
    expect(workflow).toContain("Upgrade rehearsal source identity mismatch");
  });

  it("uses current main as the PR baseline but the final candidate first parent for release dispatch", () => {
    expect(workflow).toContain('baseline_sha="$(git rev-parse "${V3_MIGRATION_SOURCE_SHA}^1"');
    expect(workflow).toContain('baseline_sha="$(git rev-parse origin/main');
    expect(workflow).toContain("Upgrade rehearsal baseline cannot equal the candidate");
  });

  it("keeps both database paths isolated and local", () => {
    expect(workflow).toContain("supabase db reset --local --no-seed");
    expect(workflow).toContain("supabase migration up --local --include-all");
    expect(workflow).not.toContain("supabase db push");
    expect(workflow).not.toContain("supabase.co");
  });

  it("emits one exact-SHA migration artifact only after accounting for both paths", () => {
    expect(workflow).toContain("exact-sha-evidence:");
    expect(workflow).toContain("CLEAN_REPLAY_RESULT");
    expect(workflow).toContain("UPGRADE_RESULT");
    expect(workflow).toContain('passed = clean == "success" and upgrade == "success"');
    expect(workflow).toContain('"s16-migration-rehearsal.json"');
    expect(workflow).toContain('"baselineSha": baseline or None');
    expect(workflow).toContain("if-no-files-found: error");
  });

  it("fails the evidence job when either canonical migration path failed", () => {
    expect(workflow).toContain(
      "if: needs.clean-replay.result != 'success' || needs.upgrade-from-main.result != 'success'",
    );
  });
});
