import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 Account security current-main extraction", () => {
  const route = () => read("src/routes/_authenticated/my-solaris/account.tsx");
  const shell = () => read("src/components/v3/V3AccountSettingsRouteShell.tsx");
  const sections = () => read("src/components/v3/V3AccountSections.tsx");
  const sessions = () => read("src/components/v3/V3AccountSessionsPanel.tsx");
  const sessionExit = () => read("src/lib/account-session.ts");
  const cacheIsolation = () => read("src/lib/account-cache-isolation.ts");

  it("keeps the native Account cutover reversible while preserving the current MySolaris context boundary", () => {
    expect(route()).toContain("v3Children={<V3AccountSections />}");
    expect(route()).toContain("<LegacyAccountContent />");
    expect(shell()).toContain("v3Children?: ReactNode");
    expect(shell()).toContain("const selectedContent = v3Children ?? children");
    expect(shell()).toContain("<MySolarisProvider>{selectedContent}</MySolarisProvider>");
    expect(shell()).toContain("rollout.data?.accountSettingsEnabled !== true");
  });

  it("signs out only the current device instead of relying on Supabase global sign-out defaults", () => {
    expect(sessionExit()).toContain('supabase.auth.signOut({ scope: "local" })');
    expect(sessionExit()).not.toContain("supabase.auth.signOut();");
    expect(sections()).toContain("Sign out this device");
    expect(sections()).toContain("Other active Solaris sessions remain available until you revoke them above.");
  });

  it("isolates V3 account state across authenticated viewer changes", () => {
    expect(cacheIsolation()).toContain("v3-account-");
    expect(cacheIsolation()).toContain("clearPrivateAccountQueries(client)");
    expect(sections()).toContain('const viewerKey = workspace.user?.id ?? "signed-out"');
    expect(sections()).toContain("key={`security:${viewerKey}`}");
    expect(sections()).toContain("key={`sessions:${viewerKey}`}");
  });

  it("renders session evidence with deterministic Solaris-time formatting", () => {
    expect(sessions()).toContain("formatEventDateTime(date, { locale: \"en-GB\" })");
    expect(sessions()).not.toContain("Intl.DateTimeFormat(undefined");
    expect(sessions()).toContain("dateTime={event.occurredAt ?? undefined}");
  });

  it("keeps fan identity under its one canonical Me owner instead of duplicating a second editor in Account", () => {
    expect(sections()).toContain('to="/my-solaris/profile"');
    expect(sections()).toContain("Manage public fan identity");
    expect(sections()).not.toContain("useFanProfile");
    expect(sections()).not.toContain("useSaveFanProfile");
    expect(sections()).not.toContain("V3AccountPrivacyPanel");
  });

  it("keeps the authenticated Account route private from indexing", () => {
    expect(route()).toContain('content: "noindex, nofollow"');
  });
});
