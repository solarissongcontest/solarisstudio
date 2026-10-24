import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const rehearsal = source(".github/scripts/v3-s11-storage-byte-recovery-rehearsal.sh");
const runbook = source("docs/runbooks/storage-restore.md");

describe("System V3 S11 Storage byte recovery contract", () => {
  it("hard-refuses hosted Supabase and uses only the local Supabase environment", () => {
    expect(rehearsal).toContain("supabase status -o env");
    expect(rehearsal).toContain("Refusing hosted Supabase Storage recovery rehearsal");
    expect(rehearsal).toContain("Refusing non-local database during Storage recovery rehearsal");
    expect(rehearsal).toContain("http://127.0.0.1:*");
    expect(rehearsal).toContain("http://localhost:*");
    expect(rehearsal).not.toContain("supabase.co");
  });

  it("recovers actual object bytes through the Storage API rather than mutating storage metadata directly", () => {
    expect(rehearsal).toContain("/storage/v1/bucket");
    expect(rehearsal).toContain("/storage/v1/object/$BUCKET/$key");
    expect(rehearsal).toContain("/storage/v1/object/authenticated/$BUCKET/$key");
    expect(rehearsal).toContain("--data-binary \"@$file\"");
    expect(rehearsal).toContain("delete_object");
    expect(rehearsal).not.toMatch(/delete\s+from\s+storage\.objects/i);
    expect(runbook).toContain("Object deletion intentionally goes through the Storage API");
  });

  it("preserves byte identity, canonical keys, MIME metadata and private policy", () => {
    expect(rehearsal).toContain("sha256_file");
    expect(rehearsal).toContain("source-manifest.tsv");
    expect(rehearsal).toContain("restored-manifest.tsv");
    expect(rehearsal).toContain("cmp -s \"$MANIFEST_LINES\" \"$RESTORED_MANIFEST_LINES\"");
    expect(rehearsal).toContain("metadata->>'mimetype'");
    expect(rehearsal).toContain("select public::text from storage.buckets");
    expect(rehearsal).toContain("anonymous caller unexpectedly read restored private object");
  });

  it("retains exact-SHA component evidence without claiming hosted-provider recovery", () => {
    expect(rehearsal).toContain("V3_STORAGE_RECOVERY_EVIDENCE_SHA");
    expect(rehearsal).toContain("V3_STORAGE_RECOVERY_EVIDENCE_OPERATOR");
    expect(rehearsal).toContain("git rev-parse HEAD");
    expect(rehearsal).toContain("git status --porcelain --untracked-files=all");
    expect(rehearsal.match(/verify_evidence_checkout/g)?.length).toBeGreaterThanOrEqual(3);
    expect(rehearsal).toContain('"providerRpoClaim": False');
    expect(rehearsal).toContain('"providerRtoClaim": False');
    expect(rehearsal).toContain('"certificationClaim": False');
    expect(rehearsal).toContain('"qaReviewRequired": True');
  });

  it("keeps hosted provider recovery and the combined full-service drill explicitly open", () => {
    expect(runbook).toContain("isolated local Supabase Storage byte-recovery drill");
    expect(runbook).toContain("not proof that hosted Supabase Storage recovery is certified");
    expect(runbook).toContain("real hosted backup/export source");
    expect(runbook).toContain("combined database + Storage + deployment full-service recovery drill");
    expect(runbook).toContain("Database metadata restoration alone must never be counted as Storage recovery evidence");
  });
});
