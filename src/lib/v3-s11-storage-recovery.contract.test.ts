import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const rehearsal = source(".github/scripts/v3-s11-storage-byte-recovery-rehearsal.sh");
const runbook = source("docs/runbooks/storage-restore.md");

describe("System V3 S11 Storage byte recovery contract", () => {
  it("hard-refuses non-loopback Supabase API and database endpoints", () => {
    expect(rehearsal).toContain("supabase status -o env");
    expect(rehearsal).toContain("Refusing hosted Supabase Storage recovery rehearsal");
    expect(rehearsal).toContain("Refusing non-local database during Storage recovery rehearsal");
    expect(rehearsal).toContain("ipaddress.ip_address(host).is_loopback");
    expect(rehearsal).toContain('host == "localhost"');
    expect(rehearsal).not.toContain("supabase.co");
  });

  it("recovers actual bytes and deletes through the current Storage batch API", () => {
    expect(rehearsal).toContain("/storage/v1/bucket");
    expect(rehearsal).toContain("/storage/v1/object/$BUCKET/$key");
    expect(rehearsal).toContain("/storage/v1/object/authenticated/$BUCKET/$key");
    expect(rehearsal).toContain("--data-binary \"@$file\"");
    expect(rehearsal).toContain("delete_objects");
    expect(rehearsal).toContain('request_json DELETE "$API_URL/storage/v1/object/$BUCKET"');
    expect(rehearsal).toContain('json.dumps({"prefixes": sys.argv[1:]})');
    expect(rehearsal).not.toMatch(/DELETE\s+"\$API_URL\/storage\/v1\/object\/\$BUCKET\/\$key"/);
    expect(rehearsal).not.toMatch(/delete\s+from\s+storage\.objects/i);
    expect(runbook).toContain("batch object endpoint with a `prefixes` payload");
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

  it("retains exact-SHA evidence and proves the Storage API delete path", () => {
    expect(rehearsal).toContain("V3_STORAGE_RECOVERY_EVIDENCE_SHA");
    expect(rehearsal).toContain("V3_STORAGE_RECOVERY_EVIDENCE_OPERATOR");
    expect(rehearsal).toContain("git rev-parse HEAD");
    expect(rehearsal).toContain("git status --porcelain --untracked-files=all");
    expect(rehearsal.match(/verify_evidence_checkout/g)?.length).toBeGreaterThanOrEqual(3);
    expect(rehearsal).toContain('"storageApiDeleteVerified": True');
    expect(rehearsal).toContain('"providerRpoClaim": False');
    expect(rehearsal).toContain('"providerRtoClaim": False');
    expect(rehearsal).toContain('"certificationClaim": False');
    expect(rehearsal).toContain('"qaReviewRequired": True');
  });

  it("keeps hosted provider recovery and combined full-service recovery open", () => {
    expect(runbook).toContain("isolated local Supabase Storage byte-recovery drill");
    expect(runbook).toContain("not proof that hosted Supabase Storage recovery is certified");
    expect(runbook).toContain("real hosted backup/export source");
    expect(runbook).toContain("combined database + Storage + deployment full-service recovery drill");
    expect(runbook).toContain("Database metadata restoration alone must never be counted as Storage recovery evidence");
  });
});
