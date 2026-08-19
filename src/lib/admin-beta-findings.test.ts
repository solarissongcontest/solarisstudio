import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("first admin beta findings", () => {
  it("keeps the edition picker searchable, scrollable and outside sticky header containing blocks", () => {
    const selectors = source("src/components/admin/AdminSelectors.tsx");
    const adminUi = source("src/components/admin/AdminUI.tsx");
    const adminCss = source("src/admin.css");

    expect(selectors).toContain("Search edition, number or host city");
    expect(selectors).toContain("filteredEditions");
    expect(adminUi).toContain("admin-sheet-body");
    expect(adminUi).toContain("createPortal");
    expect(adminUi).toContain('document.querySelector<HTMLElement>(".admin-control-room")');
    expect(adminCss).toContain(".admin-sheet-body");
    expect(adminCss).toContain("overflow-y: auto");
  });

  it("keeps low jury point rows reachable and supports intentional DNV", () => {
    const picker = source("src/components/CountryPicker.tsx");
    const fastEntry = source("src/components/studio/FastEntryImpl.tsx");
    const desktopCss = source("src/admin-desktop.css");
    const adminFrame = source("src/components/admin/AdminFrame.tsx");
    const juryRoute = source("src/routes/_authenticated/admin/jury/$slug.tsx");
    const readiness = source("src/lib/admin-readiness.ts");

    expect(picker).toContain("bottom-full mb-1");
    expect(fastEntry).toContain("md:grid-cols-2");
    expect(fastEntry).toContain("admin-jury-point-grid");
    expect(fastEntry).toContain("admin-jury-entry");
    expect(fastEntry).toContain("Mark did not vote");
    expect(adminFrame).toContain("admin-frame");
    expect(adminFrame).toContain("admin-mobile-nav");
    expect(adminFrame).toContain("admin-sidebar");
    expect(desktopCss).toContain("@media (min-width: 720px)");
    expect(desktopCss).toContain(".admin-mobile-nav");
    expect(desktopCss).toContain("display: none !important");
    expect(desktopCss).toContain(".admin-sidebar");
    expect(desktopCss).toContain("display: block");
    expect(juryRoute).toContain("jury_ballot_statuses");
    expect(juryRoute).toContain("didNotVoteVoterKeys");
    expect(readiness).toContain("did_not_vote");
    expect(readiness).toContain("jury status conflict");
  });

  it("keeps artwork controls explicit without fake contest scores", () => {
    const theme = source("src/routes/_authenticated/admin/edition-theme.$slug.tsx");

    expect(theme).toContain("Unsaved changes");
    expect(theme).toContain("What this page changes");
    expect(theme).toContain("Votes, points and results are never touched here");
    expect(theme).not.toContain("611");
    expect(theme).not.toContain("444");
    expect(theme).not.toContain("401");
  });

  it("adds historical identity context instead of guessing", () => {
    const hod = source("src/routes/_authenticated/admin/hod-history.tsx");
    const delegations = source("src/routes/confirmations/admin/countries.tsx");

    expect(hod).toContain("Country identity is not the same thing as HOD identity");
    expect(hod).toContain("current Solaris label");
    expect(delegations).toContain("computeCountryStats");
    expect(delegations).toContain("No exact canonical country-name match was found");
    expect(delegations).toContain("allTimePoints");
  });
});
