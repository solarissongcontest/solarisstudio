import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("admin country password reset", () => {
  it("authenticates the caller but delegates sensitive authorization/freshness to the canonical R3 RPC", () => {
    const edge = source("../supabase/functions/admin-country-password/index.ts");
    expect(edge).toContain('req.headers.get("authorization")');
    expect(edge).toContain("publicAuth.auth.getUser(token)");
    expect(edge).toContain('"studio2_begin_country_account_credential_replace"');
    expect(edge).not.toContain('.from("studio2_role_assignments")');
    expect(edge).not.toContain('.from("user_roles")');
    expect(edge).not.toContain('.from("country_accounts")');
  });

  it("uses the same breached-password safety pattern as country signup", () => {
    const edge = source("../supabase/functions/admin-country-password/index.ts");
    expect(edge).toContain('crypto.subtle.digest("SHA-1"');
    expect(edge).toContain("hash.slice(0, 5)");
    expect(edge).toContain("api.pwnedpasswords.com/range");
    expect(edge).toContain('"Add-Padding": "true"');
  });

  it("never sends the raw password to the database operation boundary", () => {
    const edge = source("../supabase/functions/admin-country-password/index.ts");
    expect(edge).toContain("hmacSha256Hex");
    expect(edge).toContain("p_credential_fingerprint: credentialFingerprint");
    expect(edge).not.toContain("p_password: password");
    expect(edge).toContain("service.auth.admin.updateUserById(targetUserId, { password })");
  });

  it("finalizes receipts only through the trusted service-role path", () => {
    const edge = source("../supabase/functions/admin-country-password/index.ts");
    expect(edge).toContain('"studio2_finalize_country_account_credential_replace"');
    expect(edge).toContain("p_actor_id: callerData.user.id");
    expect(edge).toContain('p_outcome: "succeeded"');
    expect(edge).toContain("reconciliationRequired: true");
  });

  it("keeps the existing reviewed Organizer control wired to the sole Edge Function writer", () => {
    const client = source("lib/country-auth.ts");
    const page = source("routes/_authenticated/admin/country-accounts.tsx");
    const panel = source("components/admin/AdminCountryPasswordPanel.tsx");

    expect(client).toContain('invokeFunction<PasswordUpdatePayload>("admin-country-password"');
    expect(client).toContain('rpc("admin_country_accounts")');
    expect(client).toContain("pendingAdminCredentialOperations");
    expect(page).toContain("<AdminCountryPasswordPanel account={target} />");
    expect(panel).toContain("<AdminConfirmSheet");
    expect(panel).toContain("adminSetSolarisPassword(review.userId, review.password)");
    expect(panel).not.toContain("adminSetSolarisPassword(account.user_id, password)");
    expect(panel).toContain("The passwords do not match.");
  });
});
