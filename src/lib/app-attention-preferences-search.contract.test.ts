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

  it("presents installed search as an isolated full-screen surface and preserves recent queries", () => {
    const palette = source("src/components/public/PublicCommandPalette.tsx");
    const appStyles = source("src/styles/app-shell.css");
    const globalStyles = source("src/styles.css");
    expect(palette).toContain("readAppSearchState");
    expect(palette).toContain("rememberAppSearchQuery");
    expect(palette).toContain("solaris-app-search-dialog");
    expect(palette).toContain("shouldFilter={false}");
    expect(palette).not.toContain("<Command shouldFilter={false}>");
    expect(palette).toContain("className=\"text-base\"");
    expect(palette).toContain("Recent searches");
    expect(appStyles).toContain('[role="dialog"].solaris-app-search-dialog[data-state="open"]');
    expect(appStyles).toContain("width: var(--solaris-visual-viewport-width, 100vw) !important");
    expect(appStyles).toContain("left: var(--solaris-visual-viewport-offset-left, 0px) !important");
    expect(appStyles).toContain("font-size: 1rem !important");
    expect(appStyles).toContain("border-radius: 0 !important");
    expect(globalStyles).toContain('[role="dialog"][data-state="open"]:not(.solaris-app-search-dialog)');
    expect(appStyles).toContain(".solaris-app-search-list");
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
