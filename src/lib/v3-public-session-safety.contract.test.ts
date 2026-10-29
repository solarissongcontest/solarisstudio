import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const account = readFileSync("src/lib/account-session.ts", "utf8");
const sections = readFileSync("src/components/v3/V3AccountSections.tsx", "utf8");
const sessions = readFileSync("src/components/v3/V3AccountSessionsPanel.tsx", "utf8");

describe("V3 public account/session safety", () => {
  it("keeps global sign-out server-authoritative", () => {
    expect(account).toContain('supabase.auth.signOut({ scope: "global" })');
    expect(account).toContain("runSolarisAuthMutation");
    expect(account).toContain("publishSolarisSignOutBoundary");
    expect(sections).toContain("signOutSolarisAccount");
  });

  it("fails closed when active sessions cannot be verified", () => {
    expect(sessions).toContain('data-v3-account-sessions-state="error"');
    expect(sessions).toContain("No device list is shown when the server-authoritative projection cannot be verified.");
    expect(sessions).toContain("sessionsQuery.refetch()");
  });

  it("reconciles uncertain revocation instead of assuming success", () => {
    expect(sessions).toContain("reconcileAttempt");
    expect(sessions).toContain("stillActive === false");
    expect(sessions).toContain("Solaris could not confirm that this session was revoked");
  });
});
