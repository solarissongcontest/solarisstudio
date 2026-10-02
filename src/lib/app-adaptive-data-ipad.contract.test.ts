import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 adaptive data and iPad workspace", () => {
  it("uses warm defaults while allowing live and cold overrides", () => {
    const router = source("src/router.tsx");
    const data = source("src/lib/data.ts");
    const archive = source("src/lib/data-live.ts");

    expect(router).toContain('solarisQueryPolicy("warm")');
    expect(data).toContain('solarisQueryPolicy("live")');
    expect(data).toContain('solarisQueryPolicy("cold")');
    expect(archive).toContain('solarisQueryPolicy("cold")');
  });

  it("refreshes stale query classes on app resume without blanket refetching", () => {
    const coordinator = source("src/components/app/AppDataFreshnessCoordinator.tsx");
    const root = source("src/routes/__root.tsx");

    expect(coordinator).toContain("APP_RESUME_EVENT");
    expect(coordinator).toContain("freshnessLevelsForResume");
    expect(coordinator).toContain("query.meta?.solarisFreshness");
    expect(coordinator).toContain('refetchType: "active"');
    expect(root).toContain("<AppDataFreshnessCoordinator />");
  });

  it("adds a reusable entity list/detail sidebar only for installed app mode", () => {
    const sidebar = source("src/components/app/AppEntitySidebar.tsx");
    const styles = source("src/styles/app-shell.css");

    expect(sidebar).toContain("if (!isAppMode || !items.length) return null");
    expect(sidebar).toContain('preload="intent"');
    expect(styles).toContain("App Experience v3: iPad list/detail entity workspaces");
    expect(styles).toContain("@media (display-mode: standalone) and (min-width: 900px), (display-mode: window-controls-overlay) and (min-width: 900px)");
    expect(styles).toContain(".solaris-app-entity-workspace");
    expect(styles).toContain(".solaris-app-entity-sidebar");
  });

  it("uses already-loaded country and show collections for iPad list/detail navigation", () => {
    const country = source("src/routes/countries/$code.tsx");
    const show = source("src/routes/shows/$showId.tsx");

    expect(country).toContain("<AppEntitySidebar");
    expect(country).toContain("items={countrySidebarItems}");
    expect(country).toContain("(countries ?? []).map");
    expect(show).toContain("<AppEntitySidebar");
    expect(show).toContain("items={showSidebarItems}");
    expect(show).toContain("(allShows ?? [])");
    expect(show).toContain("item.edition_id === show.edition_id");
  });
});
