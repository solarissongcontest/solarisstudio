import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync("src/components/v3/V3CountriesDiscoveryScreen.tsx", "utf8");

describe("V3 Country discovery recovery", () => {
  it("offers an explicit manual retry when the primary country projection fails", () => {
    expect(screen).toContain("if (countriesQuery.isError)");
    expect(screen).toContain('title="Country directory unavailable"');
    expect(screen).toContain("onClick={() => void countriesQuery.refetch()}");
    expect(screen).toContain("disabled={countriesQuery.isFetching}");
    expect(screen).toContain('"Retrying…" : "Retry countries"');
    expect(screen).toContain("Retry without changing your filters.");
  });

  it("does not mislabel an unavailable current edition as an empty contest", () => {
    expect(screen).toContain("editionContextLoading = editionsQuery.isLoading && !editionsQuery.data");
    expect(screen).toContain('"CURRENT EDITION · LOADING"');
    expect(screen).toContain("editionsQuery.isError ?");
    expect(screen).toContain("Current-edition context could not be refreshed.");
    expect(screen).toContain("onClick={() => void editionsQuery.refetch()}");
    expect(screen).toContain("disabled={editionsQuery.isFetching}");
    expect(screen).toContain("All published countries remain available.");
  });

  it("distinguishes unpublished countries, empty current lineups and filtering without fake counts", () => {
    expect(screen).toContain("const noPublishedCountries = countriesQuery.data?.length === 0");
    expect(screen).toContain('"No countries published yet"');
    expect(screen).toContain('"No published participants yet"');
    expect(screen).toContain('"No matching countries"');
    expect(screen).toContain("selectedParticipatingOnly && collectionCount === 0");
    expect(screen).toContain("action={noPublishedCountries ? undefined : (");
    expect(screen).toContain("Clear filters");
    expect(screen).not.toContain("countriesQuery.data?.length || 67");
  });

  it("keeps optional lineup errors separate from an unavailable country directory", () => {
    expect(screen).toContain("if (participatingOnly && participantsQuery.isError) setParticipatingOnly(false)");
    expect(screen).toContain("const selectedParticipatingOnly = effectiveParticipatingScope(participatingOnly, currentLineupReady)");
    expect(screen).toContain("onClick={() => void participantsQuery.refetch()}");
    expect(screen).toContain("disabled={participantsQuery.isFetching}");
    expect(screen).toContain('participantsQuery.isFetching ? "Retrying…" : "Retry lineup"');
    expect(screen).not.toContain("countriesQuery.isError || editionsQuery.isError");
  });
});
