import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 attention preferences and search", () => {
  it("feeds tab badges from one lightweight attention summary", () => {
    const shell = source("src/components/AppShell.tsx");
    const context = source("src/components/mysolaris/MySolarisContext.tsx");
    expect(shell).toContain("useAppAttentionSummary");
    expect(shell).toContain("participateBadge={attention.participate}");
    expect(shell).toContain("meBadge={attention.me}");
    expect(context).toContain("writeAppAttentionSummary");
    expect(context).toContain("osBadge: unreadNoticeCount");
  });

  it("uses one spoiler preference across Results Show Mode and notifications", () => {
    const experience = source("src/lib/app-experience.ts");
    const results = source("src/routes/results/index.tsx");
    const showMode = source("src/routes/show-mode/index.tsx");
    const notifications = source("src/components/mysolaris/MySolarisNotificationsPanel.tsx");
    expect(experience).toContain("syncAppExperiencePreferencesFromServer");
    expect(results).toContain("preferences.spoilerFree");
    expect(showMode).toContain("preferences.spoilerFree");
    expect(notifications).toContain("useAppExperiencePreferences");
    expect(notifications).toContain("syncAppExperiencePreferencesFromServer");
  });

  it("presents installed search full-screen and preserves recent queries", () => {
    const palette = source("src/components/public/PublicCommandPalette.tsx");
    const styles = source("src/styles/app-shell.css");
    expect(palette).toContain("readAppSearchState");
    expect(palette).toContain("rememberAppSearchQuery");
    expect(palette).toContain("solaris-app-search-dialog");
    expect(palette).toContain("Recent searches");
    expect(styles).toContain(".solaris-app-search-dialog");
    expect(styles).toContain(".solaris-app-search-list");
  });
  it("persists user spoiler changes without reflecting server hydration back as a user action", () => {
    const experience = source("src/lib/app-experience.ts");
    const sync = source("src/components/app/AppExperiencePreferenceSync.tsx");
    const root = source("src/routes/__root.tsx");
    expect(experience).toContain("APP_EXPERIENCE_USER_CHANGE_EVENT");
    expect(experience).toContain("persistAppExperiencePreferences(next, false)");
    expect(sync).toContain("useSaveNotificationPreferences");
    expect(sync).toContain("APP_EXPERIENCE_USER_CHANGE_EVENT");
    expect(root).toContain("<AppExperiencePreferenceSync />");
  });

  it("restores Search as the contextual back destination even across primary tabs", () => {
    const palette = source("src/components/public/PublicCommandPalette.tsx");
    const toolbar = source("src/components/app/AppToolbar.tsx");
    const searchState = source("src/lib/app-search-state.ts");
    expect(palette).toContain("rememberAppSearchReturn(originPath, normalized, result.href)");
    expect(palette).toContain("readPendingAppSearchRestore(pathname)");
    expect(toolbar).toContain("readAppSearchReturn(pathname)");
    expect(toolbar).toContain("const backLabel = searchReturn");
    expect(toolbar).toContain('? "Search"');
    expect(searchState).toContain("solaris:app-search-return:v1");
  });
});
