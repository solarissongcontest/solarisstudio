import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Solaris visual-system completion contract", () => {
  const adminUi = source("src/components/admin/AdminUI.tsx");
  const adminCss = source("src/admin.css");
  const adminData = source("src/components/admin/AdminDataView.tsx");
  const publicData = source("src/components/public/PublicResponsiveDataView.tsx");
  const appShell = source("src/components/AppShell.tsx");

  it("keeps Organizer headings operational instead of ceremonial", () => {
    expect(adminUi).toContain("admin-workspace-header");
    expect(adminUi).toContain("tracking-[-.035em]");
    expect(adminCss).toContain(".admin-control-room .admin-page-title {");
    expect(adminCss).toContain("font-family: var(--admin-ui-font) !important");
    expect(adminCss).toContain("text-transform: none");
    expect(adminCss).not.toContain(".admin-control-room .admin-brand-title,\n.admin-control-room .admin-page-title");
  });

  it("provides shared desktop-table to mobile-record primitives", () => {
    for (const component of [adminData, publicData]) {
      expect(component).toContain('md:hidden');
      expect(component).toContain('md:block');
      expect(component).toContain('role="list"');
      expect(component).toContain('aria-label={ariaLabel}');
      expect(component).toContain('table-fixed');
    }
  });

  it("removes the known forced-width escape hatches from migrated data products", () => {
    const migrated = [
      ["Voting DNA", "src/routes/voting-dna/$code.tsx", "min-w-[520px]"],
      ["Prediction League", "src/routes/prediction-league/index.tsx", "min-w-[480px]"],
      ["Result Lab", "src/routes/result-lab/index.tsx", "min-w-[680px]"],
      ["Broadcast Intelligence", "src/routes/broadcast-intelligence/index.tsx", "min-w-[680px]"],
      ["Televote Backtest", "src/routes/televoting/admin/backtest.tsx", "min-w-[620px]"],
      ["Combined Results", "src/routes/televoting/admin/combined.tsx", "min-w-[680px]"],
      ["Country cockpit", "src/routes/_authenticated/admin/countries.tsx", "min-w-[980px]"],
      ["Voting Laboratory", "src/routes/_authenticated/admin/voting-lab.tsx", "min-w-[760px]"],
    ] as const;

    for (const [, path, legacyWidth] of migrated) {
      const route = source(path);
      expect(route).not.toContain(legacyWidth);
    }

    expect(source("src/routes/voting-dna/$code.tsx")).toContain("<PublicResponsiveDataView");
    expect(source("src/routes/prediction-league/index.tsx")).toContain("<PublicResponsiveDataView");
    expect(source("src/routes/result-lab/index.tsx")).toContain("<PublicResponsiveDataView");
    expect(source("src/routes/broadcast-intelligence/index.tsx")).toContain("<PublicResponsiveDataView");
    expect(source("src/routes/televoting/admin/backtest.tsx")).toContain("<AdminDataView");
    expect(source("src/routes/televoting/admin/combined.tsx")).toContain("<AdminDataView");
    expect(source("src/routes/_authenticated/admin/countries.tsx")).toContain("<AdminDataView");
    expect(source("src/routes/_authenticated/admin/voting-lab.tsx")).toContain("<AdminDataView");
  });

  it("keeps Pulse centred on catch-up while demoting specialist tools", () => {
    const pulse = source("src/routes/pulse/index.tsx");
    expect(pulse).toContain(">Important<");
    expect(pulse).toContain("Since your last visit");
    expect(pulse).toContain("More from Solaris");
    expect(pulse).toContain("Analysis, country stories, catch-up and preferences");
    expect(pulse).toContain('<details className="rounded-2xl');
    expect(pulse).not.toContain('overflow-x-auto pb-1');
  });

  it("keeps directories functional and participation edge states in their canonical shells", () => {
    const editions = source("src/routes/editions/index.tsx");
    const confirmationEdit = source("src/routes/confirmations/edit/$token.tsx");
    const jury = source("src/routes/jury-voting.tsx");

    expect(editions).not.toContain("BackgroundFlag");
    expect(editions).toContain(">Current<");
    expect(editions).toContain(">Archive<");

    expect(confirmationEdit).toContain("<ParticipationRouteChrome>");
    expect(confirmationEdit).toContain("<ParticipationServiceShell");
    expect(confirmationEdit).toContain('service="confirmations"');

    expect(jury).toContain("Voting integrity review");
    expect(jury).toContain("This is not a finding of misconduct.");
    expect(jury).not.toContain("YOUR JURY BALLOT WAS AUTOMATICALLY FLAGGED");
  });

  it("keeps high-priority Organizer local navigation mobile-native", () => {
    const hosts = source("src/routes/_authenticated/admin/hosts.tsx");
    const access = source("src/routes/_authenticated/admin/access-permissions.tsx");
    const rollout = source("src/routes/_authenticated/admin/feature-rollout.tsx");
    const analytics = source("src/routes/televoting/admin/analytics.tsx");

    expect(hosts).toContain("grid grid-cols-2 gap-2 sm:flex sm:flex-wrap");
    expect(access).toContain("grid grid-cols-2 gap-1 sm:flex sm:flex-wrap");
    expect(rollout).toContain("grid grid-cols-2 gap-1 sm:flex sm:flex-wrap");
    expect(analytics).toContain("grid grid-cols-2 gap-1");
  });

  it("keeps MySolaris and Country Hub on one workspace model with explicit edge states", () => {
    const countryHub = source("src/routes/_authenticated/country-hub/index.tsx");
    const countryReadiness = source("src/routes/_authenticated/country-hub/readiness.tsx");
    const tasks = source("src/components/mysolaris/modules/MySolarisTasksModule.tsx");
    const notices = source("src/components/mysolaris/modules/MySolarisNoticesModule.tsx");

    expect(countryHub).toContain("NAV_TARGETS.mySolarisCountry");
    expect(countryReadiness).toContain("NAV_TARGETS.mySolarisEntry");
    expect(countryReadiness).toContain('view: "readiness"');

    expect(tasks).toContain("Loading MySolaris tasks");
    expect(tasks).toContain("Country account suspended");
    expect(tasks).toContain("No country selected");
    expect(tasks).toContain("No Solaris edition is linked to this delegation yet");
    expect(tasks).toContain("Required notices");
    expect(tasks).toContain("Upcoming & deadlines");

    expect(notices).toContain("Loading notices");
    expect(notices).toContain("No delegation account");
    expect(notices).toContain("No notices in this view");
    expect(notices).toContain("Acknowledgement required");
  });

  it("has one public navigation universe", () => {
    expect(appShell).not.toContain("LegacyPublic");
    expect(appShell).not.toContain("publicIaV3Enabled");
    expect(appShell).not.toContain("resolvePublicIaV3Enabled");
    expect(appShell).toContain("<NewPublicDesktopNavigation");
    expect(appShell).toContain("<PublicDrawerNavigation");
    expect(appShell).toContain("<PublicSectionNav");
  });
});
