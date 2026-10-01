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

  it("uses responsive data stories on the audited public data surfaces", () => {
    for (const path of [
      "src/routes/prediction-league/index.tsx",
      "src/routes/voting-dna/$code.tsx",
      "src/routes/result-lab/index.tsx",
      "src/routes/broadcast-intelligence/index.tsx",
    ]) {
      expect(source(path)).toContain("PublicResponsiveDataView");
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

  it("keeps the edition archive and Pulse hierarchy in the compact public system", () => {
    const editions = source("src/routes/editions/index.tsx");
    const pulse = source("src/routes/pulse/index.tsx");

    expect(editions).not.toContain("BackgroundFlag");
    expect(editions).toContain("overflow-hidden rounded-2xl");
    expect(pulse).toContain("Important");
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
