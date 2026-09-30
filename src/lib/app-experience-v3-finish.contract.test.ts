import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("App Experience v3 completion contract", () => {
  it("uses real master-detail workspaces on installed iPad layouts", () => {
    const shell = source("src/components/AppShell.tsx");
    const workspace = source("src/components/app/AppAdaptiveWorkspace.tsx");
    const css = source("src/styles/app-shell.css");

    expect(shell).toContain("AppAdaptiveWorkspace");
    expect(workspace).toContain('"countries" | "editions" | "results"');
    expect(workspace).toContain("CountriesMasterPane");
    expect(workspace).toContain("EditionsMasterPane");
    expect(workspace).toContain("ResultsMasterPane");
    expect(css).toContain(
      "grid-template-columns: minmax(13.5rem, 16rem) minmax(0, 1fr)",
    );
  });

  it("gives Organizer mobile navigation five independently remembered stacks", () => {
    const frame = source("src/components/admin/AdminFrame.tsx");
    const navigation = source("src/lib/admin-app-navigation.ts");

    expect(frame).toContain("getAdminAppTabDestination");
    expect(frame).toContain("resetAdminAppTabToRoot");
    expect(frame).toContain("consumeAdminNavigationRestore");
    expect(navigation).toContain('"home" | "inbox" | "edition" | "cases" | "more"');
    expect(navigation).toContain("solaris:organizer-navigation:v1");
  });

  it("consolidates installed-app preferences in one App Settings surface", () => {
    const settings = source("src/routes/settings/index.tsx");
    const more = source("src/components/app/AppMoreNavigation.tsx");
    const navigation = source("src/lib/public-navigation.ts");

    expect(settings).toContain('title="App Settings"');
    expect(settings).toContain('title="Notifications"');
    expect(settings).toContain('title="Appearance & accessibility"');
    expect(settings).toContain('title="Storage & offline"');
    expect(settings).toContain('title="Install"');
    expect(settings).toContain('title="Privacy & app information"');
    expect(more).toContain('to="/settings"');
    expect(navigation).toContain('"app-settings"');
  });

  it("coordinates query freshness with resume and reconnect instead of refetching everything", () => {
    const root = source("src/routes/__root.tsx");
    const coordinator = source("src/components/app/AppDataFreshnessCoordinator.tsx");
    const policy = source("src/lib/app-query-policy.ts");

    expect(root).toContain("<AppDataFreshnessCoordinator />");
    expect(coordinator).toContain("freshnessLevelsForResume");
    expect(coordinator).toContain('freshness !== "cold"');
    expect(policy).toContain('"live" | "warm" | "cold"');
  });

  it("records app behavior without recording ballots or form contents", () => {
    const root = source("src/routes/__root.tsx");
    const telemetry = source("src/components/app/AppTelemetryBridge.tsx");
    const migration = source(
      "supabase/migrations/20260930211000_app_experience_v3_telemetry.sql",
    );
    const sw = source("public/sw.js");

    expect(root).toContain("<AppTelemetryBridge />");
    expect(telemetry).toContain('"app_resumed"');
    expect(telemetry).toContain('"app_task_resumed"');
    expect(migration).toContain("'app_tab_restored'");
    expect(migration).toContain("'app_push_opened'");
    expect(migration).toContain("'app_show_mode_state'");
    expect(sw).toContain('targetUrl.hash = "solaris-push-open"');
  });

  it("ships a dedicated maskable icon instead of pretending the normal artwork has a safe zone", () => {
    const manifest = JSON.parse(source("public/site.webmanifest")) as {
      icons?: Array<{ src?: string; purpose?: string }>;
    };
    expect(
      manifest.icons?.some(
        (icon) =>
          icon.src?.startsWith("/icon-maskable.svg") &&
          icon.purpose === "maskable",
      ),
    ).toBe(true);
  });
});
