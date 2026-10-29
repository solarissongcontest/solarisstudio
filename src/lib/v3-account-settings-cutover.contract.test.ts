import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SOLARIS_FEATURE_RULES,
  SOLARIS_FEATURE_FLAGS,
} from "./feature-flags";
import { STUDIO2_PRODUCT_SURFACES } from "./studio2-product-surfaces";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const migration = () =>
  read("supabase/migrations/20261013020000_v3_account_settings_rollout_flag.sql");
const previousMigration = () =>
  read("supabase/migrations/20261013010000_v3_scoreboard_rollout_flag.sql");
const probe = () => read("src/integrations/v3/rollout-probe.server.ts");
const shell = () => read("src/components/v3/V3AccountSettingsRouteShell.tsx");
const accountSession = () => read("src/lib/account-session.ts");
const accountRoute = () => read("src/routes/_authenticated/my-solaris/account.tsx");
const settingsRoute = () => read("src/routes/settings.tsx");
const notificationsPanel = () =>
  read("src/components/mysolaris/MySolarisNotificationsPanel.tsx");

function constrainedFlagKeys(source: string) {
  const constraint = source.match(
    /add constraint studio2_feature_flags_key_check check\s*\(\s*key in \(([\s\S]*?)\)\s*\)/,
  );
  if (!constraint) return [];
  return [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("V3 Account + Settings cutover", () => {
  it("registers one shared account/settings slice and keeps it disabled by default", () => {
    expect(SOLARIS_FEATURE_FLAGS).toContain("solaris_app_v3_account_settings");
    expect(DEFAULT_SOLARIS_FEATURE_RULES.solaris_app_v3_account_settings).toEqual({
      enabled: false,
    });
    expect(STUDIO2_PRODUCT_SURFACES.solaris_app_v3_account_settings.dependsOn).toEqual([
      "solaris_app_v3",
    ]);

    const sql = migration();
    expect(sql).toContain("'solaris_app_v3_account_settings'");
    expect(sql).toContain("on conflict (key) do nothing");
    expect(sql.slice(sql.indexOf("values ("))).toContain("false,");
  });

  it("extends the persisted flag vocabulary without deleting an existing key", () => {
    const before = constrainedFlagKeys(previousMigration());
    const after = constrainedFlagKeys(migration());

    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((key) => !after.includes(key))).toEqual([]);
    expect(after).toContain("solaris_app_v3_confirmation");
    expect(after).toContain("solaris_app_v3_scoreboard");
    expect(after).toContain("solaris_app_v3_account_settings");
    expect(new Set(after).size).toBe(after.length);
  });

  it("evaluates account/settings rollout on the server and fails closed", () => {
    const source = probe();

    expect(source).toContain('p_key: "solaris_app_v3_account_settings"');
    expect(source).toContain("accountSettingsEnabled: false");
    expect(source).toContain(
      "enabled && !accountSettingsFlag.error && accountSettingsFlag.data === true",
    );
  });

  it("shares one reversible route shell across account and settings", () => {
    const source = shell();

    expect(source).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(source).toContain("!rollout.data || rollout.data.accountSettingsEnabled !== true");
    expect(source).toContain("rollout.isLoading && !rollout.data");
    expect(source).not.toContain("rollout.isError ||");
    expect(source).toContain("<AppShell>");
    expect(source).toContain("<V3AppShell");
    expect(source).toContain('to="/my-solaris/account"');
    expect(source).toContain('to="/settings"');
    expect(source).toContain('data-v3-account-settings-route=""');
  });

  it("preserves the MySolaris provider when V3 bypasses the legacy workspace shell", () => {
    const source = shell();

    expect(source).toContain('import { MySolarisProvider } from "@/components/mysolaris/MySolarisContext"');
    expect(source).toContain("const selectedContent = v3Children ?? children");
    expect(source).toContain('section === "account" ? <MySolarisProvider>{selectedContent}</MySolarisProvider> : selectedContent');
    expect(source).toContain("{routeContent}");
  });

  it("keeps canonical account, security, notification and device engines downstream", () => {
    const account = accountRoute();
    const settings = settingsRoute();

    expect(account).toContain("<V3AccountSettingsRouteShell");
    expect(account).toContain("<MySolarisAccountPanel");
    expect(account).toContain("<MySolarisPasswordPanel");
    expect(account).toContain("useMySolaris");

    expect(settings).toContain("<V3AccountSettingsRouteShell");
    expect(settings).toContain("useAppExperiencePreferences");
    expect(settings).toContain("<MySolarisNotificationsPanel");
    expect(settings).toContain("clearSolarisRuntimeCaches");
    expect(settings).toContain("estimateSolarisStorage");
  });

  it("uses one cached account session instead of route-specific auth observers", () => {
    const settings = settingsRoute();
    const notifications = notificationsPanel();
    const routeShell = shell();

    expect(settings).toContain("useFanSession");
    expect(notifications).toContain("useFanSession");
    expect(routeShell).toContain("useFanSession");
    expect(settings).not.toContain("supabase.auth.getUser");
    expect(settings).not.toContain("supabase.auth.onAuthStateChange");
    expect(notifications).not.toContain("supabase.auth.getUser");
    expect(notifications).not.toContain('queryKey: ["mysolaris-notification-user"]');
  });

  it("keeps sign out canonical, globally authoritative and hidden for anonymous settings", () => {
    const source = shell();
    const session = accountSession();

    expect(source).toContain("signOutSolarisAccount");
    expect(source).toContain("{session.data ? (");
    expect(source).toContain('aria-label="Sign out"');
    expect(source).toContain('window.location.href = "/"');
    expect(source).not.toContain("integrations/supabase");
    expect(source).not.toContain("supabase.auth.signOut");
    expect(session).toContain('supabase.auth.signOut({ scope: "global" })');
    expect(session).toContain("runSolarisAuthMutation(transition");
    expect(session).toContain("publishSolarisSignOutBoundary()");
  });

  it("does not expose a browser-controlled rollout escape hatch", () => {
    const combined = [
      migration(),
      probe(),
      shell(),
      accountRoute(),
      settingsRoute(),
      notificationsPanel(),
    ].join("\n");

    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_ACCOUNT_SETTINGS");
    expect(combined).not.toContain("localStorage.getItem(\"solaris_app_v3_account_settings\"");
    expect(combined).not.toContain("sessionStorage.getItem(\"solaris_app_v3_account_settings\"");
  });
});
