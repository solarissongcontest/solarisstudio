import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editions = readFileSync("src/routes/editions/index.tsx", "utf8");
const reader = readFileSync("src/lib/public-final-winners.ts", "utf8");

describe("Explore Editions winner egress and public release gates", () => {
  it("reads only first places in an allowlisted published grand-final collection", () => {
    expect(editions).toContain("item.published");
    expect(editions).toContain("isShowPublic(show)");
    expect(editions).toContain('show.kind === "grand-final" || show.kind === "final"');
    expect(editions).toContain("resolveShowPublication(show).results");
    expect(editions).toContain("usePublicFinalWinners(publishedFinalShowIds)");
    expect(reader).toContain('queryKey: ["published-edition-final-winners", showIds]');
    expect(reader).toContain('enabled: showIds.length > 0');
    expect(reader).toContain('.select("show_id,country_id,contest_entity_id,final_rank,total_points")');
    expect(reader).toContain('.in("show_id", showIds)');
    expect(reader).toContain('.eq("final_rank", 1)');
    expect(reader).toContain(".limit(500)");
    expect(reader).not.toContain('select("*")');
    expect(editions).not.toContain("useAllResults");
    expect(editions).not.toContain("useAllJuryVotes");
  });

  it("does not block released edition browsing when optional winner details fail", () => {
    expect(editions).toContain("const archiveQueries = [editionsQuery, showsQuery, countriesQuery]");
    expect(editions).toContain('resultsQuery.isError ? "error"');
    expect(editions).toContain("resultsQuery.isSuccess && !resultsQuery.isFetching && !resultsQuery.isRefetchError");
    expect(editions).toContain("const results = winnerResultsFresh ? resultsQuery.data : undefined");
    expect(editions).toContain("resultsQuery.isError || resultsQuery.isRefetchError");
    expect(editions).toContain("publication?.results ? winnerReadState");
    expect(editions).toContain("Winner details temporarily unavailable");
    expect(editions).toContain("Checking published winner");
    expect(editions).toContain("Result not public yet");
    expect(editions).toContain("hasPublishedEditions={cards.length > 0}");
    expect(editions).toContain("No public editions yet");
    expect(editions).toContain("No matching editions");
    expect(editions).toContain("final_rank === 1");
  });

  it("does not create a second canonical results writer or touch hosted data in tests", () => {
    expect(reader).toContain("useQuery({");
    expect(reader).not.toContain(".insert(");
    expect(reader).not.toContain(".update(");
    expect(reader).not.toContain(".upsert(");
    expect(reader).not.toContain("service_role");
    expect(reader).not.toContain("supabase.co");
  });
});
