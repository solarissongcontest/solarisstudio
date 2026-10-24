import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/v3-s11-storage-byte-recovery-rehearsal.yml"),
  "utf8",
);

describe("System V3 S11 Storage recovery workflow contract", () => {
  it("runs the real byte-loss rehearsal on an exact clean PR head", () => {
    expect(workflow).toContain("Checkout exact source");
    expect(workflow).toContain("github.event.pull_request.head.sha || github.sha");
    expect(workflow).toContain("git rev-parse HEAD");
    expect(workflow).toContain("git status --porcelain --untracked-files=all");
    expect(workflow).toContain("bash .github/scripts/v3-s11-storage-byte-recovery-rehearsal.sh");
    expect(workflow).toContain("V3_STORAGE_RECOVERY_EVIDENCE_SHA: ${{ steps.source.outputs.sha }}");
  });

  it("starts and stops only isolated local Supabase with the repository-pinned CLI", () => {
    expect(workflow).toContain("supabase/setup-cli@v1");
    expect(workflow).toContain("version: 2.113.0");
    expect(workflow).toContain("supabase start");
    expect(workflow).toContain("supabase stop --no-backup || true");
    expect(workflow).not.toContain("SUPABASE_ACCESS_TOKEN");
    expect(workflow).not.toContain("SUPABASE_DB_PASSWORD");
    expect(workflow).not.toContain("project-ref");
    expect(workflow).not.toContain("supabase link");
  });

  it("retains runtime proof without inflating it into provider or release certification", () => {
    expect(workflow).toContain("storageApiDeleteVerified");
    expect(workflow).toContain("sameBucketIdRestored");
    expect(workflow).toContain("sameObjectKeysRestored");
    expect(workflow).toContain("byteHashesVerified");
    expect(workflow).toContain("privatePolicyVerified");
    expect(workflow).toContain('evidence["issuesFound"] == []');
    expect(workflow).toContain('evidence["achieved"]["providerRpoClaim"] is False');
    expect(workflow).toContain('evidence["achieved"]["providerRtoClaim"] is False');
    expect(workflow).toContain('evidence["certificationClaim"] is False');
    expect(workflow).toContain('evidence["qaReviewRequired"] is True');
  });

  it("retains exact-head evidence as a bounded artifact", () => {
    expect(workflow).toContain("v3-s11-storage-byte-recovery-evidence");
    expect(workflow).toContain("/tmp/v3-s11-storage-byte-recovery.json");
    expect(workflow).toContain("retention-days: 14");
    expect(workflow).toContain("if-no-files-found: error");
  });
});
