import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("V3 long-tail visual cutover", () => {
  it("lets the outer V3 shell exclusively own physical bottom navigation clearance", () => {
    const adapter = source("src/components/v3/V3LegacyRouteShell.tsx");
    expect(adapter).toContain("padding-bottom: var(--v3-page-end-space, 28px) !important");
    expect(adapter).toContain(".solaris-app-tabbar");
    expect(adapter).toContain("display: none !important");
  });

  it("translates remaining AppShell routes away from the V2 dashboard surface language", () => {
    const adapter = source("src/components/v3/V3LegacyRouteShell.tsx");
    expect(adapter).toContain(".page-header h1");
    expect(adapter).toContain(".data-panel");
    expect(adapter).toContain("border-radius: 0 !important");
    expect(adapter).toContain("background: transparent !important");
    expect(adapter).toContain(".solaris-app-entity-sidebar");
    expect(adapter).toContain("display: none !important");
  });

  it("recomposes delegation identity, history and cross-links as flat entity content", () => {
    const country = source("src/components/v3/V3DelegationScreen.tsx");
    expect(country).toContain('data-v3-delegation-header=""');
    expect(country).toContain('data-v3-delegation-history=""');
    expect(country).not.toContain("V3ScreenHeader");
    expect(country).not.toContain("V3Surface");
    expect(country).not.toContain("V3ActionCard");
  });

  it("renders ordinary Shows discovery as flat lists while keeping filters as controls", () => {
    const shows = source("src/components/v3/V3ShowsDiscoveryScreen.tsx");
    expect(shows).toContain('data-v3-shows-directory=""');
    expect(shows).toContain('data-v3-shows-filters=""');
    expect(shows).toContain("divide-y divide-border/60 border-y");
    expect(shows).not.toContain("rounded-2xl border p-4");
    expect(shows).not.toContain("rounded-2xl border border-border bg-surface");
  });

  it("keeps Show detail canonical reads while its V2 panels are flattened by the adapter", () => {
    const show = source("src/routes/shows/$showId.tsx");
    expect(show).toContain("resolveShowPublication");
    expect(show).toContain("resolveV3ResultsSpoilerProtection");
    expect(show).toContain("ScoreboardStage");
    expect(show).toContain("ResponsiveTabs");
  });

  it("renders Stories as an editorial chronology instead of a generic card grid", () => {
    const stories = source("src/components/v3/V3StoriesIndexScreen.tsx");
    expect(stories).toContain('data-v3-stories-header=""');
    expect(stories).toContain('data-v3-stories-on-this-day=""');
    expect(stories).toContain('data-v3-stories-edition-list=""');
    expect(stories).toContain("divide-y divide-white/[0.065] border-y");
    expect(stories).not.toContain("V3ScreenHeader");
    expect(stories).not.toContain("V3ActionCard");
  });

  it("keeps Story detail editorial by flattening timeline and related-story content", () => {
    const story = source("src/components/v3/V3StoryDetailScreen.tsx");
    expect(story).toContain('data-v3-story-detail-header=""');
    expect(story).toContain('data-v3-story-timeline=""');
    expect(story).toContain('data-v3-related-stories=""');
    expect(story).not.toContain("V3ScreenHeader");
    expect(story).not.toContain("V3ActionCard");
  });

  it("gives Archive a native V3 history hierarchy without changing archive destinations", () => {
    const archive = source("src/routes/archive/index.tsx");
    expect(archive).toContain("<V3AppShell");
    expect(archive).toContain('data-v3-archive-header=""');
    expect(archive).toContain('data-v3-archive-list=""');
    expect(archive).toContain("ARCHIVE_DESTINATIONS.map");
    expect(archive).toContain("divide-y divide-white/[0.065] border-y");
  });

  it("renders Notifications as an inbox and settings list instead of nested surfaces", () => {
    const notifications = source("src/components/v3/V3NotificationsScreen.tsx");
    expect(notifications).toContain('data-v3-notifications-header=""');
    expect(notifications).toContain('data-v3-notification-list=""');
    expect(notifications).not.toContain("V3ScreenHeader");
    expect(notifications).not.toContain("V3ActionCard");
    expect(notifications).not.toContain("V3Surface");
  });

  it("renders Records as a flat statistical archive while retaining spoiler protection", () => {
    const records = source("src/components/v3/V3RecordsScreen.tsx");
    expect(records).toContain('data-v3-records-header=""');
    expect(records).toContain('data-v3-records-list=""');
    expect(records).toContain('data-v3-record-row=""');
    expect(records).toContain('data-v3-records-spoilers="protected"');
    expect(records).not.toContain("V3ScreenHeader");
  });
});
