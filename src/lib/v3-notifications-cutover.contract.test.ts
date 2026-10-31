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
  read("supabase/migrations/20261013120000_v3_notifications_rollout_flag.sql");
const previousMigration = () =>
  read("supabase/migrations/20261013110000_v3_explore_rollout_flag.sql");
const probe = () => read("src/integrations/v3/rollout-probe.server.ts");
const shell = () => read("src/components/v3/V3AppShell.tsx");
const route = () => read("src/routes/_authenticated/notifications.tsx");
const screen = () => read("src/components/v3/V3NotificationsScreen.tsx");
const push = () => read("src/lib/app-notifications.ts");

function constrainedFlagKeys(source: string) {
  const constraint = source.match(
    /add constraint studio2_feature_flags_key_check check\s*\(\s*key in \(([\s\S]*?)\)\s*\)/,
  );
  if (!constraint) return [];
  return [...constraint[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

describe("V3 Notifications cutover", () => {
  it("registers an independent notifications slice disabled by default", () => {
    expect(SOLARIS_FEATURE_FLAGS).toContain("solaris_app_v3_notifications");
    expect(DEFAULT_SOLARIS_FEATURE_RULES.solaris_app_v3_notifications).toEqual({
      enabled: false,
    });
    expect(STUDIO2_PRODUCT_SURFACES.solaris_app_v3_notifications.dependsOn).toEqual([
      "solaris_app_v3",
      "solaris_app_v3_account_settings",
    ]);
    expect(STUDIO2_PRODUCT_SURFACES.solaris_app_v3_notifications.route).toBe(
      "/notifications",
    );

    const sql = migration();
    expect(sql).toContain("'solaris_app_v3_notifications'");
    expect(sql).toContain("on conflict (key) do nothing");
    expect(sql.slice(sql.indexOf("values ("))).toContain("false,");
  });

  it("extends the post-Explore persisted vocabulary without deleting an existing flag", () => {
    const before = constrainedFlagKeys(previousMigration());
    const after = constrainedFlagKeys(migration());

    expect(before.length).toBeGreaterThan(0);
    expect(before.filter((key) => !after.includes(key))).toEqual([]);
    expect(after).toContain("public_ia_v3");
    expect(after).toContain("solaris_app_v3_explore");
    expect(after).toContain("solaris_app_v3_notifications");
    expect(new Set(after).size).toBe(after.length);
  });

  it("evaluates notifications on the server and requires the account/settings foundation", () => {
    const source = probe();

    expect(source).toContain('p_key: "solaris_app_v3_notifications"');
    expect(source).toContain("notificationsEnabled: false");
    expect(source).toMatch(
      /accountSettingsEnabled\s*&&\s*!notificationsFlag\.error\s*&&\s*notificationsFlag\.data === true/,
    );
    expect(source).toContain("exploreEnabled");
  });

  it("keeps the new destination installed-app-only and fails closed to Settings", () => {
    const source = route();

    expect(source).toContain("useV3RolloutProbe(platformResolved && isAppMode)");
    expect(source).toContain("rollout.data?.notificationsEnabled !== true");
    expect(source).toContain('<Navigate to="/settings" replace />');
    expect(source).toContain('data-v3-notifications-route-boot=""');
    expect(source).toContain("<V3NotificationsRouteContent");
    expect(source).toContain('activeArea="me"');
  });

  it("waits for preference, push and inbox reads before making notification-state claims", () => {
    const source = route();

    expect(source).toContain("preferences.isLoading || push.isLoading || inbox.isLoading");
    expect(source).toContain('variant="notifications"');
    expect(source).toContain('label="Loading your notifications…"');
    expect(source.indexOf("preferences.isLoading || push.isLoading || inbox.isLoading")).toBeLessThan(
      source.indexOf("const preferenceRow = preferences.data"),
    );
  });

  it("uses canonical preference, push and recipient-inbox engines without cloning writes", () => {
    const source = route();

    expect(source).toContain("useNotificationPreferences(userId)");
    expect(source).toContain("getAppPushState");
    expect(source).toContain("loadStudio2RecipientNoticeInbox(editionId)");
    expect(source).toContain('queryKey: ["v3-notifications-inbox", userId');
    expect(source).not.toContain("useSaveNotificationPreferences");
    expect(source).not.toContain("enableAppPush");
    expect(source).not.toContain("disableAppPush");
    expect(source).not.toContain("acknowledgeStudio2InboxNotice");
    expect(source).not.toContain("markStudio2NoticeOpened");
    expect(source).not.toContain("refetchInterval");
  });

  it("keeps acknowledgement, required work and preference mutations on canonical destinations", () => {
    const source = screen();

    expect(source).toContain('to="/my-solaris/notices"');
    expect(source).toContain('to="/participate"');
    expect(source).toContain('to="/settings"');
    expect(source).toContain("Your required work is still available");
    expect(source).toContain('item.state === "acknowledgement_required"');
    expect(source).toContain(
      "If a notification is delayed or blocked, check Participate for current responsibilities and Notices for official messages.",
    );
  });

  it("adds the V3 shell bell only from server rollout identity while badge state remains display-only", () => {
    const source = shell();

    expect(source).toContain("rollout.data?.notificationsEnabled === true");
    expect(source).toContain("Boolean(rollout.data.userId)");
    expect(source).toContain('to={"/notifications" as any}');
    expect(source).toContain('data-v3-notifications-entry=""');
    expect(source).toContain("useAppAttentionSummary");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });

  it("preserves push degradation semantics: delivery can fail without hiding required work", () => {
    const source = push();

    expect(source).toContain("Push is delivery infrastructure, never canonical work state");
    expect(source).toContain("requiredWorkAvailable: true");
    expect(source).toContain("Tasks and Notices remain the authoritative in-app path");
  });

  it("does not expose a browser-controlled rollout escape hatch", () => {
    const combined = [migration(), probe(), shell(), route(), screen()].join("\n");

    expect(combined).not.toContain("VITE_SOLARIS_APP_V3_NOTIFICATIONS");
    expect(combined).not.toContain(
      'localStorage.getItem("solaris_app_v3_notifications"',
    );
    expect(combined).not.toContain(
      'sessionStorage.getItem("solaris_app_v3_notifications"',
    );
  });
});