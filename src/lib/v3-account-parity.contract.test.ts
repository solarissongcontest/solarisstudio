import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const route = () => read("src/routes/_authenticated/my-solaris/account.tsx");
const sections = () => read("src/components/v3/V3AccountSections.tsx");
const privacy = () => read("src/components/v3/V3AccountPrivacyPanel.tsx");
const session = () => read("src/lib/account-session.ts");
const predictionData = () => read("src/lib/prediction-data.ts");

describe("V3 P42 Account parity", () => {
  it("implements the canonical P42 information architecture inside the installed-app account route", () => {
    const code = sections();
    for (const title of [
      "Security",
      "Devices & sessions",
      "Privacy",
      "Access",
      "Account actions",
    ]) {
      expect(code).toContain(`title="${title}"`);
    }
    expect(route()).toContain("<V3AccountSections />");
  });

  it("keeps current logout server-authoritative instead of treating local cleanup as revocation", () => {
    expect(sections()).toContain("await signOutSolarisAccount()");
    expect(session()).toContain("supabase.auth.signOut()");
    expect(sections()).toContain("This screen will not pretend the session was revoked.");
    expect(sections()).not.toContain("localStorage");
    expect(sections()).not.toContain("sessionStorage");
  });

  it("fails devices and sessions closed until the authenticated server projection exists", () => {
    const code = sections();
    expect(code).toContain('data-v3-account-sessions-state="unavailable"');
    expect(code).toContain("Solaris will not invent a browser-only device list");
    expect(code).not.toContain("navigator.userAgent");
    expect(code).not.toContain("document.cookie");
  });

  it("reuses the canonical private fan-profile mutation for privacy settings", () => {
    const code = privacy();
    expect(code).toContain("useFanProfile(session.data?.id)");
    expect(code).toContain("useSaveFanProfile(session.data?.id)");
    expect(code).toContain('"private", "unlisted", "public"');
    expect(code).toContain("leaderboard_opt_in: leaderboardOptIn");
    expect(predictionData()).toContain('.from("fan_profiles")');
    expect(predictionData()).toContain(".upsert(");
    expect(code).not.toContain("localStorage");
  });

  it("keeps privacy failure explicit and does not apply optimistic success", () => {
    const code = privacy();
    expect(code).toContain('state="unavailable"');
    expect(code).toContain("no visibility setting is being guessed locally");
    expect(code).toContain("No optimistic success is applied");
  });

  it("derives delegation access from the existing MySolaris permission context", () => {
    const code = sections();
    expect(code).toContain("workspace.permissions.countryStatus");
    expect(code).toContain("server-authoritative delegation access");
    expect(code).not.toContain("supabase");
  });
});
