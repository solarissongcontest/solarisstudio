import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 attention, preferences and search", () => {
  it("derives navigation badges from authoritative task and unread-event sources", () => {
    const attention = source("src/lib/app-attention.ts");
    const shell = source("src/components/AppShell.tsx");
    expect(attention).toContain("tasksFromHodWorkspace");
    expect(attention).toContain("participationTaskCounts");
    expect(attention).toContain('event.importance === "important"');
    expect(attention).toContain("setSolarisAppBadge(osBadge)");
    expect(shell).toContain("participateBadge={attention.participateBadge}");
    expect(shell).toContain("meBadge={attention.meBadge}");
  });

  it("uses server notification preferences as the signed-in spoiler source of truth", () => {
    const experience = source("src/lib/app-experience.ts");
    const sync = source("src/components/app/AppExperiencePreferenceSync.tsx");
    const root = source("src/routes/__root.tsx");
    expect(experience).toContain("APP_EXPERIENCE_USER_CHANGE_EVENT");
    expect(experience).toContain("syncAppExperiencePreferencesFromServer");
    expect(sync).toContain("preferences.data.spoiler_free");
    expect(sync).toContain("useSaveNotificationPreferences");
    expect(root).toContain("<AppExperiencePreferenceSync />");
  });

  it("preserves mobile search origin and query across result navigation", () => {
    const searchState = source("src/lib/app-search-state.ts");
    const palette = source("src/components/public/PublicCommandPalette.tsx");
    const toolbar = source("src/components/app/AppToolbar.tsx");
    expect(searchState).toContain("rememberAppSearchReturn");
    expect(searchState).toContain("readPendingSearchRestore");
    expect(searchState).toContain("rememberRecentSearch");
    expect(palette).toContain("readPendingSearchRestore(pathname)");
    expect(palette).toContain("rememberAppSearchReturn(originPath, normalized, result.href)");
    expect(toolbar).toContain("backLabel = searchReturn");
    expect(toolbar).toContain('"Search"');
  });

  it("renders installed search as a dedicated mobile app surface", () => {
    const palette = source("src/components/public/PublicCommandPalette.tsx");
    const command = source("src/components/ui/command.tsx");
    const styles = source("src/styles/app-shell.css");
    expect(command).toContain("contentClassName");
    expect(palette).toContain("solaris-app-search-dialog");
    expect(palette).toContain("solaris-app-search-titlebar");
    expect(palette).toContain('heading="Recent searches"');
    expect(styles).toContain("html[data-solaris-app] .solaris-app-search-dialog");
    expect(styles).toContain("--solaris-visual-viewport-height");
  });

  it("announces attention counts on the tab accessible name", () => {
    const tabs = source("src/components/app/AppTabBar.tsx");
    expect(tabs).toContain("need attention");
    expect(tabs).toContain('aria-hidden="true"');
  });
});
