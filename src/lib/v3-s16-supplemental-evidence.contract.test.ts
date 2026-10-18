import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/v3-s16-supplemental-evidence.yml",
  "utf8",
);
const builder = readFileSync("scripts/build-v3-s16-supplemental-evidence.ts", "utf8");

describe("S16 supplemental exact-candidate evidence", () => {
  it("separates the frozen code candidate from the reviewable evidence commit", () => {
    expect(workflow).toContain("candidate_sha:");
    expect(workflow).toContain("evidence_commit_sha:");
    expect(workflow).toContain("V3_S16_EVIDENCE_SOURCE_SHA");
    expect(workflow).toContain("git worktree add --detach");
    expect(workflow).toContain("v3-s16-evidence-input");
  });

  it("normalizes candidate identity before checkout and artifact naming", () => {
    expect(workflow).toContain("id: identity");
    expect(workflow).toContain('echo "candidate=$candidate" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain("ref: ${{ steps.identity.outputs.candidate }}");
    expect(workflow).toContain(
      "name: v3-s16-supplemental-${{ steps.identity.outputs.candidate }}",
    );
    expect(workflow).not.toContain("name: v3-s16-supplemental-${{ inputs.candidate_sha }}");
  });

  it("targets only a frozen candidate that still equals current main", () => {
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("git rev-parse origin/main");
    expect(workflow).toContain("Supplemental evidence may target only frozen current main");
  });

  it("whitelists exactly seven reviewable JSON input files", () => {
    for (const filename of [
      "security-advisor-snapshot.json",
      "security-advisor-dispositions.json",
      "s16-public-acceptance.json",
      "s16-organizer-acceptance.json",
      "s16-navigation-acceptance.json",
      "s16-accessibility.json",
      "s16-responsive-behavior.json",
    ]) {
      expect(workflow).toContain(filename);
    }
    expect(workflow).toContain("must contain exactly the seven approved JSON files");
  });

  it("never executes code from the evidence commit", () => {
    expect(workflow).toContain("Materialize separate reviewable evidence commit");
    expect(workflow).toContain("Install candidate dependencies");
    expect(workflow).toContain("No code from that commit is executed");
    expect(workflow).not.toContain("cd $RUNNER_TEMP/v3-s16-evidence-source && bun");
  });

  it("requires release-ready security classification and candidate-owned surface validation", () => {
    expect(workflow).toContain(
      "build-v3-security-advisor-classification.ts --require-release-ready",
    );
    expect(workflow).toContain("build-v3-s16-supplemental-evidence.ts");
    expect(builder).toContain("validateV3S16SurfaceEvidence");
    expect(builder).toContain("V3_S16_EVIDENCE_SOURCE_SHA");
    expect(builder).toContain("candidate ${candidateSha} does not match checked-out SHA");
  });

  it("records candidate and evidence commit provenance in the output bundle", () => {
    expect(builder).toContain('"supplemental-provenance.json"');
    expect(builder).toContain("candidateSha");
    expect(builder).toContain("evidenceSourceSha");
    expect(workflow).toContain("v3-s16-supplemental-${{ steps.identity.outputs.candidate }}");
  });

  it("never contacts or mutates hosted Supabase", () => {
    expect(workflow).not.toContain("supabase.co");
    expect(workflow).not.toContain("supabase db push");
    expect(builder).not.toContain("supabase.co");
  });
});
