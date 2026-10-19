import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/v3-s16-core-evidence-attestation.yml", "utf8");

describe("S16 canonical Quality workflow attestation", () => {
  it("attests only the actual canonical Quality workflow", () => {
    expect(workflow).toContain("workflow_run:");
    expect(workflow).toContain("- Quality");
    expect(workflow).not.toContain("- Rules + Integrity migration rehearsal");
    expect(workflow).toContain("types:\n      - completed");
  });

  it("binds every artifact to the exact source workflow head SHA", () => {
    expect(workflow).toContain("github.event.workflow_run.head_sha");
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("candidateSha");
    expect(workflow).toContain("SOURCE_RUN_ID");
    expect(workflow).toContain("SOURCE_RUN_ATTEMPT");
  });

  it("only attests runs originating from this repository", () => {
    expect(workflow).toContain(
      "github.event.workflow_run.head_repository.full_name == github.repository",
    );
  });

  it("derives pass state only from the canonical Quality workflow conclusion", () => {
    expect(workflow).toContain('SOURCE_WORKFLOW" != "Quality"');
    expect(workflow).toContain('passed = conclusion == "success"');
    expect(workflow).toContain('"workflow": "Quality"');
    expect(workflow).toContain('"conclusion": conclusion');
  });

  it("produces only the canonical CI and production-isolation category files", () => {
    expect(workflow).toContain('"s16-canonical-ci.json"');
    expect(workflow).toContain('"s16-production-isolation.json"');
    expect(workflow).not.toContain('"s16-migration-rehearsal.json"');
  });

  it("does not execute the attested branch or access hosted Supabase", () => {
    expect(workflow).not.toContain("bun run");
    expect(workflow).not.toContain("supabase start");
    expect(workflow).not.toContain("supabase.co");
  });
});
