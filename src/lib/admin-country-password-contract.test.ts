import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("admin country password reset", () => {
  it("requires an authenticated organizer and only targets country accounts", () => {
    const edge = source("../supabase/functions/admin-country-password/index.ts");
    expect(edge).toContain('req.headers.get("authorization")');
    expect(edge).toContain('.from("user_roles")');
    expect(edge).toContain('.eq("role", "organizer")');
    expect(edge).toContain('return json({ error: "Organizer access is required." }, 403)');
    expect(edge).toContain('.from("country_accounts")');
    expect(edge).toContain('.eq("user_id", targetUserId)');
    expect(edge).toContain("service.auth.admin.updateUserById(targetUserId, { password })");
  });

  it("uses the same breached-password safety pattern as country signup", () => {
    const edge = source("../supabase/functions/admin-country-password/index.ts");
    expect(edge).toContain('crypto.subtle.digest("SHA-1"');
    expect(edge).toContain("hash.slice(0, 5)");
    expect(edge).toContain("api.pwnedpasswords.com/range");
    expect(edge).toContain('"Add-Padding": "true"');
  });

  it("exposes the organizer control inside Country accounts", () => {
    const client = source("lib/country-auth.ts");
    const page = source("routes/_authenticated/admin/country-accounts.tsx");
    const panel = source("components/admin/AdminCountryPasswordPanel.tsx");

    expect(client).toContain('invokeFunction<PasswordUpdatePayload>("admin-country-password"');
    expect(page).toContain("<AdminCountryPasswordPanel account={target} />");
    expect(panel).toContain("adminSetSolarisPassword(account.user_id, password)");
    expect(panel).toContain("The passwords do not match.");
  });
});
