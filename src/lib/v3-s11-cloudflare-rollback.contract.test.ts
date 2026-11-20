import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const rehearsal = readFileSync(
  resolve(process.cwd(), ".github/scripts/v3-s11-cloudflare-rollback-rehearsal.sh"),
  "utf8",
);

describe("System V3 S11 Cloudflare deployment rollback rehearsal", () => {
  it("targets only an explicitly named isolated Worker and refuses production", () => {
    expect(rehearsal).toContain("PRODUCTION_WORKER_NAME='studio'");
    expect(rehearsal).toContain("SOLARIS_S11_ROLLBACK_WORKER");
    expect(rehearsal).toContain("Refusing production Cloudflare Worker");
    expect(rehearsal).toContain("solaris-s11-rollback-");
    expect(rehearsal).toContain("Worker name exceeds the 63-character safety bound");
    expect(rehearsal).not.toContain("rollback studio");
  });

  it("runs Wrangler from a temporary fixture and strips Solaris Supabase environment", () => {
    expect(rehearsal).toContain('TMP_DIR="$(mktemp -d)"');
    expect(rehearsal).toContain('cd "$TMP_DIR"');
    expect(rehearsal).toContain("-u SUPABASE_URL");
    expect(rehearsal).toContain("-u VITE_SUPABASE_URL");
    expect(rehearsal).toContain("-u E2E_SUPABASE_URL");
    expect(rehearsal).toContain("-u CONFIRMATIONS_SUPABASE_URL");
    expect(rehearsal).toContain("-u VITE_CONFIRMATIONS_SUPABASE_URL");
    expect(rehearsal).toContain("-u SUPABASE_SERVICE_ROLE_KEY");
    expect(rehearsal).toContain("fixture config unexpectedly contains a Solaris/data resource binding");
    expect(rehearsal).not.toContain("supabase.co");
  });

  it("pins the provider CLI and records runtime version metadata", () => {
    expect(rehearsal).toContain("WRANGLER_VERSION='4.141.0'");
    expect(rehearsal).toContain('"binding": "CF_VERSION_METADATA"');
    expect(rehearsal).toContain("metadata.id ?? null");
    expect(rehearsal).toContain("verify_wrangler_version");
    expect(rehearsal).not.toContain("wrangler@latest");
  });

  it("performs a real known-good → defective → rollback provider sequence", () => {
    const baseline = rehearsal.indexOf("Deploy an immutable known-good fixture version");
    const defective = rehearsal.indexOf("Upload and promote a deliberately defective fixture version");
    const rollback = rehearsal.indexOf("Execute the real Cloudflare rollback");
    expect(baseline).toBeGreaterThan(-1);
    expect(defective).toBeGreaterThan(baseline);
    expect(rollback).toBeGreaterThan(defective);

    expect(rehearsal).toContain("versions upload --config wrangler.jsonc");
    expect(rehearsal).toContain('versions deploy "${DEFECTIVE_VERSION_ID}@100%"');
    expect(rehearsal).toContain('rollback "$BASELINE_VERSION_ID"');
    expect(rehearsal).toContain("deployments list --config wrangler.jsonc");
    expect(rehearsal).toContain("verify_single_version_deployment");
  });

  it("observes the defective runtime before rollback and exact known-good convergence after", () => {
    expect(rehearsal).toContain("write_fixture 'defective' 503");
    expect(rehearsal).toContain(
      "wait_for_runtime 'defective' \"$DEFECTIVE_VERSION_ID\" 503 \"$DEFECTIVE_RUNTIME\"",
    );
    expect(rehearsal).toContain(
      "wait_for_runtime 'known-good' \"$BASELINE_VERSION_ID\" 200 \"$ROLLBACK_RUNTIME\"",
    );
    expect(rehearsal).toContain("Cloudflare rollback converged to exact known-good version");
  });

  it("retains exact-SHA evidence without claiming data or full-service recovery", () => {
    expect(rehearsal).toContain('COMMIT_SHA="$(git rev-parse HEAD)"');
    expect(rehearsal).toContain("dirty working tree");
    expect(rehearsal).toContain('"productionRpoClaim": False');
    expect(rehearsal).toContain('"productionRtoClaim": False');
    expect(rehearsal).toContain('"dataRollbackClaim": False');
    expect(rehearsal).toContain('"databaseRollbackAttempted": False');
    expect(rehearsal).toContain('"storageRollbackAttempted": False');
    expect(rehearsal).toContain('"certificationClaim": False');
    expect(rehearsal).toContain('"fullServiceRecoveryClaim": False');
    expect(rehearsal).toContain('"qaReviewRequired": True');
  });
});
