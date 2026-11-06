import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const palette = readFileSync(
  resolve(process.cwd(), "src/components/public/PublicCommandPalette.tsx"),
  "utf8",
);
const web = palette.slice(
  palette.indexOf("function WebPublicPaletteDialog"),
  palette.indexOf("function WebSearchArchiveResults"),
);

describe("V3 web Search canonical discovery shortcuts", () => {
  it("chooses the canonical published current edition instead of guessing lifecycle status", () => {
    expect(web).toContain("resolveCurrentPublicEdition(editions)");
    expect(web).not.toContain('"complete", "completed", "finished"');
    expect(web).toContain('id: "action:current-edition"');
    expect(web).toContain('href: `/editions/${currentEdition.slug}`');
  });

  it("does not expose personal delegation actions before account eligibility resolves", () => {
    expect(web).toContain("canSuggestDelegationSearchActions(access)");
    expect(web).toContain("...(canOpenDelegation");
    expect(web).toContain('id: "action:confirmation"');
    expect(web).toContain("const myCountry = canOpenDelegation");
    expect(web).toContain("countries.find((country) => country.id === access!.countryId)");
  });

  it("offers an accessible reset that restores focus and avoids archive-wide reads", () => {
    expect(web).toContain('aria-label="Clear search"');
    expect(web).toContain('ref={webSearchInputRef}');
    expect(web).toContain('webSearchInputRef.current?.focus()');
    expect(web).toContain('setQuery("")');
    expect(web).toContain('normalized.length >= 2 ? (');
    expect(web).toContain('Type one more character to search published Solaris content.');
  });

  it("retains public results, comparison, directory and recent navigation for everyone", () => {
    expect(web).toContain('id: "action:latest-results"');
    expect(web).toContain('id: "action:compare"');
    expect(web).toContain('id: "action:site-directory"');
    expect(web).toContain("usePublicationSafeRecents()");
    expect(web).toContain("renderSearchGroups(idleGroups, openIdleResult)");
  });
});
