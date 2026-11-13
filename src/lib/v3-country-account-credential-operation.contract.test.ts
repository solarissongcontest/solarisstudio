import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261019235700_v3_country_account_credential_operation.sql",
  "utf8",
);
const edge = readFileSync("supabase/functions/admin-country-password/index.ts", "utf8");
const client = readFileSync("src/lib/country-auth.ts", "utf8");
const panel = readFileSync("src/components/admin/AdminCountryPasswordPanel.tsx", "utf8");

describe("V3 country-account credential replacement", () => {
  it("is an actor-bound R3 operation with fresh-auth and exact target/version checks", () => {
    expect(migration).toContain("v_actor uuid := auth.uid()");
    expect(migration).toContain("studio2_access_allowed('delegation.manage', null, true)");
    expect(migration).toContain("private.studio2_require_fresh_auth(300)");
    expect(migration).toContain("'account.country_credential.replace'");
    expect(migration).toContain("'R3'");
    expect(migration).toContain("v_account.country_id is distinct from p_expected_country_id");
    expect(migration).toContain("v_account.updated_at is distinct from p_expected_account_updated_at");
    expect(migration).toContain("request_fingerprint");
    expect(migration).toContain("IDEMPOTENCY_CONFLICT");
  });

  it("keeps replacement secret material out of PostgreSQL and audit/event payloads", () => {
    expect(migration).not.toMatch(/p_password|new_password|replacement_password/i);
    expect(migration).toContain("p_credential_proof text");
    expect(edge).toContain("hmacSha256Hex");
    expect(edge).toContain("serviceRoleKey");
    expect(edge).toContain("credentialProof");
    expect(edge).not.toContain("console.log(password");
    expect(edge).not.toContain("console.error(password");
    expect(migration).toContain("'credentialChanged', true");
  });

  it("splits user-authorized claim from service-only Auth mutation and finalization", () => {
    const beginIndex = edge.indexOf('"v3_begin_country_account_credential_replacement"');
    const authMutationIndex = edge.indexOf("service.auth.admin.updateUserById");
    const finalizeIndex = edge.indexOf('"v3_finalize_country_account_credential_replacement"');

    expect(beginIndex).toBeGreaterThanOrEqual(0);
    expect(authMutationIndex).toBeGreaterThan(beginIndex);
    expect(finalizeIndex).toBeGreaterThan(authMutationIndex);
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
  });

  it("makes the session consequence and immutable evidence explicit", () => {
    expect(migration).toContain("'sessionPolicy', 'revoke_all'");
    expect(migration).toContain("delete from auth.sessions");
    expect(migration).toContain("'country_account_credential_replaced'");
    expect(migration).toContain("insert into public.admin_audit_log");
    expect(migration).toContain("private.v3_emit_domain_event");
    expect(migration).toContain("'account.country_credential_replaced'");
    expect(migration).toContain("status = 'succeeded'");
    expect(migration).toContain("completed_at = now()");
  });

  it("preserves one operation identity across uncertain browser retries without storing the replacement secret", () => {
    expect(client).toContain("CREDENTIAL_OPERATION_MAX_AGE_MS");
    expect(client).toContain("window.sessionStorage");
    expect(client).toContain("operationId: crypto.randomUUID()");
    expect(client).toContain("idempotencyKey: randomHex(32)");
    expect(client).toContain("expectedCountryId: operation.countryId");
    expect(client).toContain("expectedAccountUpdatedAt: operation.accountUpdatedAt");
    expect(client).not.toContain("password: operation.password");
    expect(panel).toContain("adminSetSolarisPassword(review.userId, review.password)");
  });

  it("keeps dependency uncertainty fail-closed instead of fabricating success", () => {
    expect(edge).toContain("Retry the same reviewed operation");
    expect(edge).toContain("outcome could not be confirmed");
    expect(edge).toContain("Retry the exact reviewed operation to reconcile it");
    expect(edge).toContain("operationId: canonicalOperationId");
  });
});
