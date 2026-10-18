import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/_authenticated/my-solaris/account.tsx");
const shell = () => read("src/components/v3/V3AccountSettingsRouteShell.tsx");
const sections = () => read("src/components/v3/V3AccountSections.tsx");
const privacy = () => read("src/components/v3/V3AccountPrivacyPanel.tsx");
const sessions = () => read("src/components/v3/V3AccountSessionsPanel.tsx");
const sessionAuthority = () => read("src/lib/account-session.ts");

describe("V3 P42 Account parity boundary", () => {
  it("cuts only the enabled installed-app account surface to native V3 content", () => {
    expect(shell()).toContain("v3Children?: ReactNode");
    expect(shell()).toContain("v3Children ?? children");
    expect(route()).toContain("v3Children={<V3AccountSections />}");
    expect(route()).toContain("<LegacyAccountContent />");
    expect(shell()).toContain("rollout.data?.accountSettingsEnabled !== true");
  });

  it("implements the canonical account information architecture", () => {
    const code = sections();
    for (const title of ["Security", "Devices & sessions", "Privacy", "Access", "Account actions"]) {
      expect(code).toContain(`title="${title}"`);
    }
    expect(code).toContain("<V3AccountSessionsPanel />");
    expect(code).toContain("<V3AccountPrivacyPanel />");
    expect(code).toContain("<V3AccountSecurityPanel />");
  });

  it("keeps current-device logout authoritative, local-scoped and failure-visible", () => {
    expect(sections()).toContain("await signOutSolarisAccount()");
    expect(sessionAuthority()).toContain('supabase.auth.signOut({ scope: "local" })');
    expect(sessionAuthority()).not.toContain("supabase.auth.signOut();");
    expect(sections()).toContain("will not pretend the session was revoked");
  });

  it("fails the device list closed instead of deriving auth truth from the browser", () => {
    const code = sessions();
    expect(code).toContain('data-v3-account-sessions-state="unavailable"');
    expect(code).toContain('data-v3-account-sessions-state="error"');
    expect(code).toContain("server-authoritative projection");
    expect(code).not.toContain("navigator.userAgent");
    expect(code).not.toContain("localStorage");
    expect(code).not.toContain("sessionStorage");
  });

  it("keeps fan-profile privacy separate from delegation authority", () => {
    expect(privacy()).toContain("useFanProfile(session.data?.id)");
    expect(privacy()).toContain("useSaveFanProfile(session.data?.id)");
    expect(privacy()).toContain("It does not change your delegation, entries or official contest records");
    expect(sections()).toContain("workspace.permissions.countryStatus");
  });
});
