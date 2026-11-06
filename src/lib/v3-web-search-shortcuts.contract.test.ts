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

  it("uses only published show, edition, result and participant sources for web discovery", () => {
    const archive = palette.slice(
      palette.indexOf("function WebSearchArchiveResults"),
      palette.indexOf("function renderSearchGroups"),
    );
    expect(archive).toContain("publicSearchPublicationScope(editions, shows)");
    expect(archive).toContain("publicSearchRowsForPublishedShows(results, publishedResultShowIds)");
    expect(archive).toContain("publicSearchRowsForPublishedShows(jury, detailedVotingShowIds)");
    expect(archive).toContain("usePublicSearchParticipants()");
    expect(archive).not.toContain("useAllParticipants()");
    expect(archive).toContain("publicEditionIds.has(participant.edition_id)");
    expect(archive).toContain("...publicEditions");
    expect(archive).toContain("...publicShows");
    expect(archive).toMatch(/href: country\s*\?\s*`\/countries\/\$\{country\.short_code\}`\s*:\s*edition\s*\?\s*`\/editions\/\$\{edition\.slug\}`/);
  });

  it("fails closed on unavailable archive data and distinguishes errors from empty matches", () => {
    const archive = palette.slice(
      palette.indexOf("function WebSearchArchiveResults"),
      palette.indexOf("function renderSearchGroups"),
    );
    for (const name of ["shows", "participants", "results", "jury"]) {
      expect(archive).toContain(`const ${name} = ${name}Query.isError ? []`);
      expect(archive).toContain(`if (${name}Query.isError) void ${name}Query.refetch()`);
    }
    expect(archive).toContain("hasArchiveError");
    expect(archive).toContain("storiesQuery.isError ? [] : storiesQuery.data ?? []");
    expect(archive).toContain("!isFetching && !hasArchiveError && !searchResults.length");
    expect(archive).toContain('role="alert"');
    expect(archive).toContain("Retry unavailable sources");
  });

  it("retains public results, comparison, directory and recent navigation for everyone", () => {
    expect(web).toContain('id: "action:latest-results"');
    expect(web).toContain('id: "action:compare"');
    expect(web).toContain('id: "action:site-directory"');
    expect(web).toContain("usePublicationSafeRecents()");
    expect(web).toContain("renderSearchGroups(idleGroups, openIdleResult)");
  });
});
