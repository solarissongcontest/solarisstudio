import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("final UI completion contracts", () => {
  it("keeps Organizer headers compact and operational", () => {
    const ui = source("src/components/admin/AdminUI.tsx");
    const css = source("src/admin.css");

    expect(ui).toContain("admin-workspace-header");
    expect(ui).toContain('text-[1.65rem]');
    expect(css).toContain(".admin-control-room .admin-page-title");
    expect(css).toContain("font-family: var(--admin-ui-font)");
    expect(css).not.toContain(".admin-control-room .admin-brand-title,\n.admin-control-room .admin-page-title");
  });

  it("keeps the retired public navigation out of the runtime shell", () => {
    const shell = source("src/components/AppShell.tsx");

    expect(shell).toContain("<NewPublicDesktopNavigation");
    expect(shell).toContain("<PublicDrawerNavigation");
    expect(shell).toContain("<PublicSectionNav");
    expect(shell).not.toContain("LegacyPublic");
    expect(shell).not.toContain("publicIaV3Enabled");
    expect(shell).not.toContain("resolvePublicIaV3Enabled");
  });

  it("uses shared responsive data stories on the audited public data surfaces", () => {
    expect(source("src/routes/prediction-league/index.tsx")).toContain("PublicResponsiveDataView");

    for (const path of [
      "src/routes/voting-dna/$code.tsx",
      "src/routes/result-lab/index.tsx",
      "src/routes/broadcast-intelligence/index.tsx",
    ]) {
      const page = source(path);
      expect(page).toContain("PublicDataStory");
      expect(page).toContain("<ResponsiveHistory");
      expect(page).toContain("<DataStoryPage");
    }
  });

  it("keeps Organizer V3 primitives explicit and adopted", () => {
    const primitives = source("src/components/admin/AdminWorkspacePrimitives.tsx");
    for (const name of [
      "WorkspaceHeader",
      "WorkspaceTabs",
      "MetricStrip",
      "ObjectPage",
      "WorkQueue",
      "InspectorSheet",
      "WorkspaceActionBar",
      "FilterBar",
      "FormSection",
      "DangerZone",
      "AuditTimeline",
      "CommandMenu",
    ]) {
      expect(primitives).toContain(name);
    }

    expect(source("src/routes/_authenticated/admin/access-permissions.tsx")).toContain("<WorkspaceTabs");
    expect(source("src/routes/_authenticated/admin/feature-rollout.tsx")).toContain("<WorkspaceTabs");
    expect(source("src/routes/_authenticated/admin/hosts.tsx")).toContain("<WorkspaceTabs");
    expect(source("src/routes/_authenticated/admin/eligibility.tsx")).toContain("<FilterBar");
    expect(source("src/routes/_authenticated/admin/results-reveal.tsx")).toContain("<ObjectPage");
    expect(source("src/routes/televoting/admin/combined.tsx")).toContain("<DangerZone");

    const design = source("src/routes/_authenticated/admin/design.$slug.tsx");
    expect(design).toContain("<WorkspaceHeader");
    expect(design).toContain("<WorkspaceActionBar");
    expect(design).not.toContain("overflow-x-auto");

    const editions = source("src/routes/_authenticated/admin/editions.tsx");
    expect(editions).toContain("<WorkspaceHeader");
    expect(editions).toContain("<MetricStrip");
    expect(editions).toContain("<WorkspaceActionBar");
    expect(editions).not.toContain("overflow-x-auto");

    const system = source("src/routes/_authenticated/admin/system.tsx");
    expect(system).toContain("<WorkspaceHeader");
    expect(system).toContain("<MetricStrip");
    expect(system).toContain("<WorkQueue");
    expect(system).toContain("<AuditTimeline");
    expect(system).toContain("<WorkspaceActionBar");

    const audit = source("src/routes/televoting/admin/audit-log.tsx");
    expect(audit).toContain("<ObjectPage");
    expect(audit).toContain("<FilterBar");
    expect(audit).toContain("<AuditTimeline");
  });

  it("centralizes app overlays and harmonizes secondary governance routes", () => {
    const runtime = source("src/components/app/AppRuntime.tsx");
    const manager = source("src/components/app/AppOverlayManager.tsx");
    expect(runtime).toContain("<AppOverlayManager");
    expect(manager).toContain("<AppOfflineBanner");
    expect(manager).toContain("<AppFirstRun");
    expect(manager).toContain("<AppUpdatePrompt");

    for (const path of [
      "src/routes/integrity/appeals.tsx",
      "src/routes/integrity/decisions.tsx",
      "src/routes/integrity/process.tsx",
      "src/routes/integrity/privacy.tsx",
      "src/routes/integrity/cases/$caseId.tsx",
      "src/routes/integrity/appeal.$caseId.tsx",
      "src/routes/integrity/recover.tsx",
      "src/routes/rules/changes.tsx",
      "src/routes/rules/interpretations.tsx",
    ]) {
      expect(source(path)).toContain("<GovernanceDepthLayout");
    }
  });

  it("uses responsive Organizer records instead of phone-wide audit tables", () => {
    for (const path of [
      "src/routes/televoting/admin/backtest.tsx",
      "src/routes/televoting/admin/combined.tsx",
      "src/routes/_authenticated/admin/jury-integrity.tsx",
      "src/routes/_authenticated/admin/results-reveal.tsx",
      "src/routes/_authenticated/admin/broadcast-rundown.tsx",
      "src/routes/_authenticated/admin/eligibility.tsx",
      "src/routes/_authenticated/admin/media-assets.tsx",
      "src/routes/_authenticated/admin/beta3-feedback.tsx",
    ]) {
      const page = source(path);
      expect(page).toContain("AdminDataView");
      expect(page).not.toMatch(/min-w-\[(?:[5-9]\d\d|\d{4,})px\]/);
    }
  });

  it("keeps the only remaining wide Host matrix desktop-only with a phone-native alternative", () => {
    const hosts = source("src/routes/_authenticated/admin/hosts.tsx");

    expect(hosts).toContain('className="space-y-3 lg:hidden"');
    expect(hosts).toContain('className="hidden overflow-x-auto lg:block"');
    expect(hosts).toContain('min-w-[820px]');
  });

  it("keeps participation edge states inside the shared participation shell", () => {
    const edit = source("src/routes/confirmations/edit/$token.tsx");
    const jury = source("src/routes/jury-voting.tsx");

    expect(edit).toContain("<ParticipationRouteChrome>");
    expect(edit).toContain("<ParticipationServiceShell");
    expect(edit).not.toContain("confirmations-backdrop");
    expect(jury).toContain("Solaris found an unusual pattern");
    expect(jury).not.toContain("Your jury ballot was automatically flagged");
  });

  it("keeps directory typography functional and ships installed iOS QA", () => {
    const shows = source("src/routes/shows/index.tsx");
    const playwright = source("playwright.config.ts");
    const installed = source("e2e/installed-app.e2e.ts");
    const workflow = source(".github/workflows/browser-audit.yml");

    expect(shows).not.toContain('"text-4xl sm:text-5xl"');
    expect(shows).not.toContain("font-display font-black leading-[0.96]");
    expect(playwright).toContain('"ios-pwa-portrait"');
    expect(playwright).toContain('"ios-pwa-landscape"');
    expect(installed).toContain('navigator, "standalone"');
    expect(installed).toContain("data-solaris-runtime");
    expect(workflow).toContain("chromium webkit");
  });

  it("keeps the edition archive and Pulse hierarchy in the compact public system", () => {
    const editions = source("src/routes/editions/index.tsx");
    const pulse = source("src/routes/pulse/index.tsx");

    expect(editions).not.toContain("BackgroundFlag");
    expect(editions).toContain("overflow-hidden rounded-2xl");
    expect(pulse).toContain("Important");
    expect(pulse).toContain("More updates");
    expect(pulse).toContain("More from Solaris");
    expect(pulse).not.toContain("Quick updates");
    expect(pulse).not.toContain('["music", "Music"]');
    expect(pulse).not.toContain('["announcements", "Announcements"]');
  });

  it("keeps legacy standalone Televoting headings out of migrated operator pages", () => {
    const entries = source("src/routes/televoting/admin/rounds/$id/entries.tsx");
    const combined = source("src/routes/televoting/admin/combined.tsx");

    expect(entries).toContain("<AdminPageHeader");
    expect(entries).not.toMatch(/font-display[^"\n]*uppercase/);
    expect(combined).toContain("<AdminPageHeader");
    expect(combined).not.toMatch(/font-display[^"\n]*uppercase/);
  });
});
