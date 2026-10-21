import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/v3-s16-exact-sha-certification.yml",
  "utf8",
);

const canonicalEvidenceFiles = [
  "s16-canonical-ci.json",
  "s16-migration-rehearsal.json",
  "s16-authorization-security.json",
  "s16-production-isolation.json",
  "s16-system-hardening.json",
  "s16-public-acceptance.json",
  "s16-organizer-acceptance.json",
  "s16-navigation-acceptance.json",
  "s16-accessibility.json",
  "s16-responsive-behavior.json",
  "s14-full-contest.json",
  "s15-zero-orphan.json",
] as const;

describe("S16 exact-SHA certification orchestration", () => {
  it("is manual, read-only and requires an exact candidate plus declared evidence runs", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("candidate_sha:");
    expect(workflow).toContain("source_run_ids:");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("actions: read");
    expect(workflow).not.toMatch(/contents:\s*write/);
    expect(workflow).not.toMatch(/actions:\s*write/);
  });

  it("refuses stale candidates instead of certifying a historical branch head", () => {
    expect(workflow).toContain("git fetch origin main --no-tags");
    expect(workflow).toContain("git rev-parse origin/main");
    expect(workflow).toContain("S16 release certification may only certify current main");
    expect(workflow).toContain('actual="$(git rev-parse HEAD');
  });

  it("accepts only successful same-repository Actions runs before downloading evidence", () => {
    expect(workflow).toContain('run_json="$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/$run_id")"');
    expect(workflow).toContain(".status //");
    expect(workflow).toContain('if [ "$status" != "completed" ]');
    expect(workflow).toContain('if [ "$conclusion" != "success" ]');
    expect(workflow).toContain('if [ "$head_repository" != "$GITHUB_REPOSITORY" ]');
    expect(workflow).toContain("run-metadata.ndjson");
    expect(workflow).toContain('gh run download "$run_id"');
    for (const filename of canonicalEvidenceFiles) {
      expect(workflow).toContain(filename);
    }
  });

  it("records immutable source-run metadata in the final evidence instead of IDs alone", () => {
    expect(workflow).toContain("'schemaVersion': 2");
    expect(workflow).toContain("'sourceRunIds': run_ids");
    expect(workflow).toContain("'sources': sources");
    expect(workflow).toContain("source run metadata is incomplete or does not match declared run IDs");
  });

  it("fails closed through 12-category assembly, certificate construction and final release revalidation", () => {
    expect(workflow).toContain("Assemble and semantically revalidate all 12 categories");
    expect(workflow).toContain("s16-system-hardening.json");
    expect(workflow).toContain("scripts/assemble-v3-s16-evidence.ts");
    expect(workflow).toContain("--require-complete");
    expect(workflow).toContain("scripts/build-v3-s16-certification.ts --require-certified");
    expect(workflow).toContain("scripts/check-v3-release-integrity.ts --certified");
    expect(workflow).not.toContain("|| true");
  });

  it("runs the production-isolation guard and only uploads the canonical assembled evidence", () => {
    expect(workflow).toContain("scripts/check-v3-production-isolation.ts");
    expect(workflow).toContain("path: v3-release-evidence/");
    expect(workflow).not.toContain("path: s16-source-runs/");
    expect(workflow).toContain("s16-certification-source-runs.json");
  });
});
