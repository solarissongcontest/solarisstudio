import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editions = readFileSync("src/routes/editions/index.tsx", "utf8");
const styles = readFileSync("src/styles/v3-editions-editorial.css", "utf8");

describe("Editions web chronology", () => {
  it("uses the actual published editions and official result gates", () => {
    expect(editions).toContain("(edition) => edition.published");
    expect(editions).toContain("isShowPublic(show)");
    expect(editions).toContain("resolveShowPublication(grandFinal)");
    expect(editions).toContain("grandFinal && publication?.results");
    expect(editions).not.toContain("Date.now()");
    // Keep the newer bounded first-place projection; the donor used all Results.
    expect(editions).toContain("usePublicFinalWinners(publishedFinalShowIds)");
    expect(editions).toContain("resultsQuery.isRefetchError");
    expect(editions).toContain("winnerResultsFresh");
    expect(editions).not.toContain("useAllResults(");
  });

  it("makes current edition distinct from the chronological web archive", () => {
    expect(editions).toContain('data-directory-experience={presentation}');
    expect(editions).toContain('<LatestEdition card={visibleLatest} />');
    expect(editions).toContain('className="v3-directory-desktop-grid v3-editions-timeline"');
    expect(editions).toContain('<li key={card.edition.id} className="v3-editions-timeline-item">');
    expect(editions).toContain("b.edition_number ?? -1");
  });

  it("retains actual edition detail deep links and accurate optional years", () => {
    expect(editions).toContain('to="/editions/$slug"');
    expect(editions).toContain('params={{ slug: card.edition.slug }}');
    expect(editions).toContain("card.edition.year != null");
    expect(editions).toContain("<WinnerLine winner={card.winner}");
    expect(editions).toContain("hasPublishedFinalResults={card.hasPublishedFinalResults}");
    expect(editions).toContain("readState={card.winnerReadState}");
  });

  it("does not change installed-PWA archive presentation", () => {
    expect(editions).toContain("<AppGroupedList>");
    expect(editions).toContain("<ArchiveEdition key={card.edition.id} card={card} appMode />");
    expect(styles).toContain('html:not([data-solaris-app]) .v3-editions-directory');
  });
});
