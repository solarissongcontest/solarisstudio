import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const maintenancePortal = source("src/lib/maintenance-hod-portal.ts");
const maintenanceAccess = source("src/lib/maintenance.ts");
const maintenanceAccessTest = source("src/lib/maintenance-hod-access.test.ts");
const normalLogin = source("src/routes/auth/index.tsx");
const resetRoute = source("src/routes/auth/reset.tsx");
const authClient = source("src/lib/country-auth.ts");
const authFunction = source("supabase/functions/country-auth/index.ts");

const noRecoveryMessage =
  "This country account does not have a recovery email. Contact an organizer to regain access.";
const genericRecoveryMessage =
  "If that account has a recovery email, a password reset link has been sent.";
const productionOrigin = "https://studio.solaris-song-contest.workers.dev";

describe("password recovery regression contract", () => {
  it("keeps maintenance recovery feedback aligned with the normal login screen", () => {
    for (const ui of [maintenancePortal, normalLogin]) {
      expect(ui).toContain("recoveryAvailable");
      expect(ui).toContain(noRecoveryMessage);
      expect(ui).toContain(genericRecoveryMessage);
    }

    expect(maintenancePortal).toContain("result.data?.recoveryAvailable === false");
    expect(maintenancePortal).toContain("browserErrorMessage(error)");
  });

  it("does not reveal whether an unknown account exists", () => {
    expect(authFunction).toContain("if (!resolved.email)");
    expect(authFunction).toContain("return json({ ok: true, recoveryAvailable: true });");
    expect(normalLogin).toContain(genericRecoveryMessage);
    expect(maintenancePortal).toContain(genericRecoveryMessage);
  });

  it("refuses recovery for internal country-only email identities", () => {
    expect(authFunction).toContain('const internalEmailSuffix = "@country.solaris.invalid"');
    expect(authFunction).toContain("noRecovery: email.endsWith(internalEmailSuffix)");
    expect(authFunction).toContain("if (resolved.noRecovery)");
    expect(authFunction).toContain("return json({ ok: true, recoveryAvailable: false });");
  });

  it("pins hosted recovery to the canonical Solaris reset route while preserving loopback development", () => {
    expect(authFunction).toContain(`const productionSiteOrigin = "${productionOrigin}"`);
    expect(authFunction).toContain("const fallback = `${productionSiteOrigin}/auth/reset`");
    expect(authFunction).toContain('["localhost", "127.0.0.1", "[::1]"]');
    expect(authFunction).toContain("parsed.origin === productionSiteOrigin || localDevelopmentOrigin");
    expect(authFunction).toContain("return fallback;");
    expect(authFunction).toContain("resetPasswordForEmail");
    expect(authFunction).toContain("{ redirectTo }");
  });

  it("keeps the reset route available during maintenance without opening unrelated routes", () => {
    expect(maintenanceAccess).toContain('pathname === "/auth/reset"');
    expect(maintenanceAccessTest).toContain('"/auth/reset"');
    expect(maintenanceAccessTest).toContain('"/participate"');
    expect(maintenanceAccessTest).toContain("keeps unrelated route maintenance-blocked");
  });

  it("handles recovery-session creation, invalid/expired links and canonical password submission", () => {
    expect(resetRoute).toContain('event === "PASSWORD_RECOVERY"');
    expect(resetRoute).toContain("supabase.auth.getSession()");
    expect(resetRoute).toContain("setSolarisPassword(password)");
    expect(resetRoute).toContain("supabase.auth.getUser()");
    expect(resetRoute).toContain("password-recovery link");
    expect(resetRoute).toContain("expired, request a new one from the sign-in page.");
    expect(authClient).toContain('action: "set-password"');
    expect(authFunction).toContain('action === "set-password"');
  });

  it("retains the same canonical country-auth sign-in path after a password is changed", () => {
    expect(authClient).toContain("export async function signInSolarisAccount");
    expect(authClient).toContain("invokeCountryAuth");
    expect(authFunction).toContain('action === "signin"');
    expect(authFunction).toContain("signInWithPassword");
    expect(authFunction).toContain("accessToken: data.session.access_token");
    expect(authFunction).toContain("refreshToken: data.session.refresh_token");
  });
});