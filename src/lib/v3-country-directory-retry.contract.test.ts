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

  it("keeps optional lineup errors separate from an unavailable country directory", () => {
    expect(screen).toContain("if (participantsQuery.isError) setParticipatingOnly(false)");
    expect(screen).toContain("const selectedParticipatingOnly = effectiveParticipatingScope(participatingOnly, currentLineupReady)");
    expect(screen).toContain("onClick={() => void participantsQuery.refetch()}");
    expect(screen).not.toContain("countriesQuery.isError || editionsQuery.isError");
  });
});
