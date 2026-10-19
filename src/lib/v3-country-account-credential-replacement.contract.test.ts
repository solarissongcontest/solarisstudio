import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261019213000_v3_country_account_credential_replacement.sql"),
  "utf8",
);
const edge = readFileSync(
  resolve(process.cwd(), "supabase/functions/admin-country-password/index.ts"),
  "utf8",
);
const client = readFileSync(resolve(process.cwd(), "src/lib/country-auth.ts"), "utf8");

describe("V3 governed country-account credential replacement", () => {
  it("is registered as a semantic forward-only S13 migration", () => {
    expect(migration).toContain("public.v3_register_migration_contract(");
    expect(migration).toContain("'v3.o14.country-account-credential-replacement'");
    expect(migration).toContain("'forward_fix_only'");
  });

  it("requires canonical capability plus fresh authentication before a new R3 operation", () => {
    expect(migration).toContain("studio2_access_allowed('delegation.manage', null, true)");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(migration).toContain("'country_account.credential_replace'");
    expect(migration).toContain("'R3'");
    expect(migration.indexOf("studio2_access_allowed('delegation.manage', null, true)"))
      .toBeLessThan(migration.indexOf("private.studio2_require_fresh_auth(300)"));
  });

  it("binds the reviewed target to both country identity and account version", () => {
    expect(migration).toContain("account.user_id = p_target_user_id");
    expect(migration).toContain("account.country_id = p_country_id");
    expect(migration).toContain("v_account.updated_at is distinct from p_expected_updated_at");
    expect(migration).toContain("raise sqlstate 'PT409'");
    expect(migration).toContain("message = 'VERSION_CONFLICT'");
  });

  it("stores only S2 semantic request evidence and never the raw password", () => {
    expect(migration).toContain("'credentialFingerprint', v_fingerprint");
    expect(migration).toContain("private.studio2_request_fingerprint");
    expect(migration).not.toMatch(/p_password\b/);
    expect(migration).not.toContain("password text");
    expect(edge).toContain("hmacSha256Hex(");
    expect(edge).toContain("p_credential_fingerprint: credentialFingerprint");
    expect(edge).not.toContain("p_password: password");
  });

  it("allows exact successful lost-response replay without weakening fresh auth for new operations", () => {
    const replayIndex = migration.indexOf("if v_existing.status = 'succeeded'");
    const freshIndex = migration.indexOf("private.studio2_require_fresh_auth(300)");
    expect(replayIndex).toBeGreaterThan(-1);
    expect(freshIndex).toBeGreaterThan(replayIndex);
    expect(migration).toContain("v_existing.request_fingerprint is distinct from v_request_fingerprint");
    expect(edge).toContain("reconciliationRequired: true");
  });

  it("keeps transient password-safety dependency outages retryable under the same operation", () => {
    expect(edge).toContain('stage: "password_safety_dependency"');
    expect(edge).toContain('if (safetyFailure.stage === "password_policy")');
    expect(edge).toContain('reconciliationRequired: safetyFailure.stage === "password_safety_dependency"');
    expect(edge).not.toContain('p_failure_stage: "password_safety_dependency"');
  });

  it("prevents browsers from forging successful credential receipts", () => {
    expect(migration).toContain("public.studio2_finalize_country_account_credential_replace");
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(edge).toContain('p_outcome: "succeeded"');
    expect(edge).toContain("p_actor_id: callerData.user.id");
  });

  it("defines the session consequence explicitly and audits success/failure without credential material", () => {
    expect(migration).toContain("'preserve_existing_sessions'");
    expect(migration).toContain("'sessionsRevoked', false");
    expect(migration).toContain("'country_account_credential_replaced'");
    expect(migration).toContain("'country_account_credential_replace_failed'");
    expect(migration).toContain("'passwordPersisted', false");
  });

  it("keeps a stable browser operation identity across an uncertain retry of the legacy reviewed UI", () => {
    expect(client).toContain("pendingAdminCredentialOperations");
    expect(client).toContain("browserRetryFingerprint");
    expect(client).toContain("operationId: crypto.randomUUID()");
    expect(client).toContain("idempotencyKey: crypto.randomUUID()");
    expect(client).toContain("if (pending?.retryFingerprint === retryFingerprint)");
    expect(client).toContain("pendingAdminCredentialOperations.delete(legacyUserId)");
  });
});
