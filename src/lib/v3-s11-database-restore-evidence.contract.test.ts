import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const rehearsal = source(".github/scripts/v3-s11-database-restore-rehearsal.sh");
const runbook = source("docs/runbooks/database-restore.md");

describe("System V3 S11 retained database restore evidence contract", () => {
  it("keeps evidence generation attached to the real isolated dump/restore rehearsal", () => {
    expect(rehearsal).toContain("pg_dump");
    expect(rehearsal).toContain("pg_restore");
    expect(rehearsal).toContain("refusing non-local database restore rehearsal");
    expect(rehearsal).toContain("V3_RECOVERY_EVIDENCE_OUTPUT");
    expect(rehearsal).toContain("database_restore_rehearsal");
    expect(rehearsal).toContain("isolated_local_supabase");
    expect(rehearsal).not.toContain("supabase.co");
  });

  it("binds retained evidence to an exact clean checked-out commit before and after rehearsal", () => {
    expect(rehearsal).toContain("V3_RECOVERY_EVIDENCE_SHA");
    expect(rehearsal).toContain("git rev-parse HEAD");
    expect(rehearsal).toContain("git status --porcelain --untracked-files=all");
    expect(rehearsal).toContain("verify_evidence_checkout");
    expect(rehearsal.match(/verify_evidence_checkout/g)?.length).toBeGreaterThanOrEqual(3);
    expect(rehearsal).toContain("recovery evidence SHA does not match checked-out HEAD");
    expect(rehearsal).toContain("recovery evidence requires a clean worktree");
  });

  it("retains migration, operator, snapshot, timing and canonical fingerprint identity", () => {
    expect(rehearsal).toContain("V3_RECOVERY_EVIDENCE_OPERATOR");
    expect(rehearsal).toContain("REHEARSAL_ID");
    expect(rehearsal).toContain("SOURCE_MIGRATION_HEAD");
    expect(rehearsal).toContain("RESTORE_MIGRATION_HEAD");
    expect(rehearsal).toContain("migration head differs after restore");
    expect(rehearsal).toContain("hashlib.sha256");
    expect(rehearsal).toContain("SNAPSHOT_BYTES");
    expect(rehearsal).toContain("REHEARSAL_RTO_MS");
    expect(rehearsal).toContain("criticalRelationFingerprints");
    expect(rehearsal).toContain("foreignKeyValidationState");
    expect(rehearsal).toContain("issuesFound");
    expect(rehearsal).toContain("followUpActions");
  });

  it("does not promote local exercise timing into hosted provider claims or certification", () => {
    expect(rehearsal).toContain('"providerRpoClaim": False');
    expect(rehearsal).toContain('"providerRtoClaim": False');
    expect(rehearsal).toContain('"certificationClaim": False');
    expect(rehearsal).toContain('"qaReviewRequired": True');
    expect(runbook).toContain("not hosted-provider promises");
    expect(runbook).toContain("Storage byte recovery");
    expect(runbook).toContain("deployment rollback");
    expect(runbook).toContain("full-service recovery");
  });

  it("documents exact-SHA evidence mode without weakening production restore safety", () => {
    expect(runbook).toContain("Exact-SHA evidence mode");
    expect(runbook).toContain("Never rehearse a destructive restore against production");
    expect(runbook).toContain("local/loopback `DB_URL`");
    expect(runbook).toContain("V3_RECOVERY_EVIDENCE_OPERATOR");
    expect(runbook).toContain("migration head");
    expect(runbook).toContain("providerRpoClaim: false");
    expect(runbook).toContain("qaReviewRequired: true");
    expect(runbook).toContain("bash .github/scripts/v3-s11-database-restore-rehearsal.sh");
  });
});
