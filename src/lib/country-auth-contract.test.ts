import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const authPage = source("src/routes/auth/index.tsx");
const resetPage = source("src/routes/auth/reset.tsx");
const authClient = source("src/lib/country-auth.ts");
const authFunction = source("supabase/functions/country-auth/index.ts");
const mySolarisAccount = source("src/components/MySolarisAccountPanel.tsx");
const migration = source("supabase/migrations/20260820144500_country_account_username_auth.sql");
const rateLimitMigration = source(
  "supabase/migrations/20261004224000_country_auth_rate_limits.sql",
);

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

  it("creates authoritative country ownership before returning a new signup session", () => {
    expect(authFunction).toContain('service.from("country_accounts").insert({');
    expect(authFunction).toContain("user_id: created.user.id");
    expect(authFunction).toContain("country_id: countryId");
    expect(authFunction).toContain("instagram_username: instagramUsername");
    expect(authFunction).toContain("display_name: displayName");
    expect(authFunction).toContain("service.auth.admin.deleteUser(created.user.id)");
    expect(authFunction).toContain('ownershipError.code === "23505"');
  });

  it("rate limits anonymous signup, signin and recovery without storing raw identifiers", () => {
    expect(rateLimitMigration).toContain("private.country_auth_rate_limits");
    expect(rateLimitMigration).toContain("country_auth_consume_rate_limit");
    expect(rateLimitMigration).toContain("revoke all on private.country_auth_rate_limits");
    expect(authFunction).toContain("async function consumeAnonymousRateLimit(");
    expect(authFunction).toContain("`${scope}:address`");
    expect(authFunction).toContain("`${scope}:target`");
    expect(authFunction).toContain('consumeAnonymousRateLimit(\n        service,\n        "signup"');
    expect(authFunction).toContain('consumeAnonymousRateLimit(\n        service,\n        "signin"');
    expect(authFunction).toContain('consumeAnonymousRateLimit(\n        service,\n        "recover"');
    expect(authFunction).toContain("sha256Hex(`${scope}|${rawKey}`)");
    expect(authFunction).not.toContain('console.log("[country-auth]');
  });

  it("supports recovery only when a real recovery email exists and protects the replacement password", () => {
    expect(authFunction).toContain("@country.solaris.invalid");
    expect(authFunction).toContain("resetPasswordForEmail");
    expect(authPage).toContain("Forgot password?");
    expect(authClient).toContain('action: "set-password"');
    expect(resetPage).toContain("setSolarisPassword(password)");
    expect(resetPage).not.toContain("updateUser({ password })");
  });

  it("lets a signed-in country account add or change its recovery email from MySolaris", () => {
    expect(authClient).toContain('action: "profile"');
    expect(authClient).toContain('action: "set-email"');
    expect(authFunction).toContain('action === "profile"');
    expect(authFunction).toContain('action === "set-email"');
    expect(authFunction).toContain("email_confirm: true");
    expect(authFunction).toContain("has_recovery_email: true");
    expect(mySolarisAccount).toContain("Add a recovery email");
    expect(mySolarisAccount).toContain("Change email");
    expect(mySolarisAccount).toContain("does not show it on your public country or Wiki pages");
  });
});
