import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("Pre-Beta public UX completion contract", () => {
  const appShell = source("src/components/AppShell.tsx");
  const mobileNav = source("src/components/public/PublicMobileSectionNav.tsx");
  const footer = source("src/components/public/PublicFooter.tsx");
  const guide = source("src/routes/guide/index.tsx");
  const breadcrumbs = source("src/lib/public-breadcrumbs.ts");
  const confirmation = source("src/components/ConfirmationForm.tsx");
  const rules = source("src/components/rules/RulesExperience.tsx");
  const integrity = source("src/components/integrity/TrustIntegrityHub.tsx");
  const mySolarisContext = source("src/components/mysolaris/MySolarisContext.tsx");
  const priorities = source("src/lib/my-solaris-priorities.ts");
  const palette = source("src/components/public/PublicCommandPalette.tsx");
  const edition = source("src/routes/editions/$slug.tsx");

  it("mounts real mobile local-section navigation with a full-directory escape hatch", () => {
    expect(appShell).toContain("PublicMobileSectionNav");
    expect(appShell).toContain("<PublicMobileSectionNav pathname={pathname} />");
    expect(mobileNav).toContain('aria-expanded={open}');
    expect(mobileNav).toContain('to="/site-directory"');
    expect(mobileNav).toContain("All Solaris pages");
    expect(mobileNav).toContain('area === "explore"');
    expect(mobileNav).toContain('area === "participate"');
    expect(mobileNav).toContain('area === "results"');
    expect(mobileNav).toContain('area === "help"');
  });

  it("makes All Solaris pages reachable from search/help/footer surfaces", () => {
    expect(palette).toContain('label: "All Solaris pages"');
    expect(guide).toContain('to="/site-directory"');
    expect(guide).toContain('title="All Solaris pages"');
    expect(footer).toContain('to="/site-directory"');
    expect(footer).toContain("All Solaris pages");
  });

  it("builds dynamic detail breadcrumbs for countries, wiki, editions, stories and shows", () => {
    for (const routePattern of [
      '^\\/countries\\/([^/]+)\\/?$',
      '^\\/wiki\\/([^/]+)\\/?$',
      '^\\/editions\\/([^/]+)\\/?$',
      '^\\/stories\\/([^/]+)\\/?$',
      '^\\/shows\\/([^/]+)\\/?$',
    ]) {
      expect(breadcrumbs).toContain(routePattern);
    }
    expect(breadcrumbs).toContain("context.countries?.find");
    expect(breadcrumbs).toContain("context.editions?.find");
    expect(breadcrumbs).toContain("context.shows?.find");
    expect(breadcrumbs).toContain("to: `/editions/${edition.slug}`");
  });

  it("puts eligibility help directly inside confirmation before submission", () => {
    expect(confirmation).toContain("Unsure whether your song is eligible?");
    expect(confirmation).toContain("Check song eligibility →");
    expect(confirmation).toContain("Still unsure? Ask before submitting →");
    expect(confirmation).toContain('to="/integrity/preclearance"');
    expect((confirmation.match(/<EntryEligibilityHelp \/>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("exposes the planned Rules and Integrity information hierarchy", () => {
    for (const label of ["Browse chapters", "Rule clarifications", "Rule changes"]) {
      expect(rules).toContain(label);
    }
    for (const label of ["Follow a case", "How reporting works", "Privacy"]) {
      expect(integrity).toContain(label);
    }
  });

  it("uses one explicit MySolaris priority model and sorter", () => {
    for (const field of ["priority:", "deadline:", "severity:", "actionRequired:"]) {
      expect(priorities).toContain(field);
      expect(mySolarisContext).toContain(field);
    }
    expect(mySolarisContext).toContain("sortMySolarisPriorities(items)");
    expect(priorities).toContain("priorityBucket");
  });

  it("searches entries, scorecharts and records as first-class result groups", () => {
    expect(palette).toContain("searchableEntries");
    expect(palette).toContain('group: "Entries"');
    expect(palette).toContain("scorechartShows");
    expect(palette).toContain('group: "Scorecharts"');
    expect(palette).toContain("buildCanonicalFanRecords");
    expect(palette).toContain('group: "Records"');
  });

  it("keeps edition continuation links for shows, entries, results and stories", () => {
    for (const target of ["#edition-shows", "#edition-entries", "#edition-results", "#edition-stories"]) {
      expect(edition).toContain(`href: "${target}"`);
    }
    for (const label of ["Shows", "Entries", "Results", "Stories"]) {
      expect(edition).toContain(`label: "${label}"`);
    }
  });
});
