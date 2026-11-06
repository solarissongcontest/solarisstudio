import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { latestConfirmationResponsesByCountry } from "./confirmation-overview-current-response";

const response = (
  id: string,
  country: string,
  submitted_at: string,
  participating: boolean,
) => ({ id, country, submitted_at, participating });

describe("Organizer delegation overview current-response projection", () => {
  it("counts a country once and honors its newest withdrawal", () => {
    const early = response("old", "Oland", "2026-10-15T10:00:00Z", true);
    const withdrawn = response("new", "OLAND", "2026-11-01T10:00:00Z", false);
    const another = response("third", "Aotea", "2026-10-30T10:00:00Z", true);
    expect(latestConfirmationResponsesByCountry([early, another, withdrawn])).toEqual([
      another, withdrawn,
    ]);
  });

  it("does not let a later update be displaced by response order", () => {
    const late = response("late", "Oland", "2026-11-02T10:00:00Z", true);
    const early = response("early", "Oland", "2026-11-01T10:00:00Z", false);
    expect(latestConfirmationResponsesByCountry([late, early])).toEqual([late]);
    expect(latestConfirmationResponsesByCountry([early, late])).toEqual([late]);
  });

  it("allows an empty real queue but fails closed for ambiguous evidence", () => {
    expect(latestConfirmationResponsesByCountry([])).toEqual([]);
    expect(latestConfirmationResponsesByCountry([
      response("one", "Oland", "2026-11-02T10:00:00Z", true),
      response("two", "Oland", "2026-11-02T10:00:00Z", false),
    ])).toBeNull();
    expect(latestConfirmationResponsesByCountry([response("bad", "Oland", "not-a-date", true)])).toBeNull();
    expect(latestConfirmationResponsesByCountry([response("bad", "  ", "2026-11-02T10:00:00Z", true)])).toBeNull();
    // The RPC boundary is JSON: malformed private projections must not throw
    // during render or accidentally become a "no work"/ready assertion.
    expect(latestConfirmationResponsesByCountry([{
      id: "broken", country: null, submitted_at: "2026-11-02T10:00:00Z",
    } as unknown as ReturnType<typeof response>])).toBeNull();
  });

  it("keeps the overview's current status separate from the full historical queue", () => {
    const route = readFileSync("src/routes/confirmations/admin/index.tsx", "utf8");
    expect(route).toContain("latestConfirmationResponsesByCountry(activeResponses)");
    expect(route).toContain("for (const response of currentCountryResponses ?? [])");
    expect(route).toContain('currentCountryResponses === null ? (');
    expect(route).not.toContain("activeResponses.forEach((response)");
  });
});
