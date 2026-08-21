import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const authPage = source("src/routes/auth/index.tsx");
const resetPage = source("src/routes/auth/reset.tsx");
const authClient = source("src/lib/country-auth.ts");
const authFunction = source("supabase/functions/country-auth/index.ts");
const migration = source("supabase/migrations/20260820144500_country_account_username_auth.sql");

describe("country account username authentication", () => {
  it("requires the Instagram username, display name and password while keeping email optional", () => {
    expect(authPage).toContain("Instagram username");
    expect(authPage).toContain("Name or nickname");
    expect(authPage).toContain("Recovery email");
    expect(authPage).toContain("(optional)");
    expect(authPage).not.toContain("Continue with Google");
  });

  it("keeps organizer email login while resolving country usernames privately", () => {
    expect(authPage).toContain("Instagram username or admin email");
    expect(authFunction).toContain('from("country_accounts")');
    expect(authFunction).toContain('eq("instagram_username", username)');
    expect(authFunction).toContain("getUserById(account.user_id)");
    expect(authClient).toContain('action: "signin"');
  });

  it("stores the Solaris username on the country account and enforces uniqueness", () => {
    expect(migration).toContain("add column if not exists instagram_username text");
    expect(migration).toContain("add column if not exists display_name text");
    expect(migration).toContain("country_accounts_instagram_username_lower_uidx");
    expect(migration).toContain("instagram_username, display_name");
  });

  it("supports recovery only when a real recovery email exists and protects the replacement password", () => {
    expect(authFunction).toContain("@country.solaris.invalid");
    expect(authFunction).toContain("resetPasswordForEmail");
    expect(authPage).toContain("Forgot password?");
    expect(authClient).toContain('action: "set-password"');
    expect(resetPage).toContain("setSolarisPassword(password)");
    expect(resetPage).not.toContain("updateUser({ password })");
  });
});
