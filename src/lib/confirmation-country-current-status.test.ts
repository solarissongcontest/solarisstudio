import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { currentParticipatingCountryResponse } from "./confirmation-country-current-status";

describe("Organizer country participation derives from the newest response", () => {
  const earlierYes = { id: "earlier", participating: true, submitted_at: "2026-10-15T09:00:00Z" };
  const laterNo = { id: "later", participating: false, submitted_at: "2026-11-02T09:00:00Z" };
  const laterYes = { id: "later-yes", participating: true, submitted_at: "2026-11-02T09:00:00Z" };

  it("does not resurrect an older participation when a later response declines", () => {
    expect(currentParticipatingCountryResponse([laterNo, earlierYes])).toBeNull();
  });

  it("retains a newer participating response and its identity", () => {
    expect(currentParticipatingCountryResponse([laterYes, earlierYes])).toBe(laterYes);
  });

  it("returns no participant for empty or entirely nonparticipating history", () => {
    expect(currentParticipatingCountryResponse([])).toBeNull();
    expect(currentParticipatingCountryResponse([laterNo])).toBeNull();
  });

  it("keeps the current-state card and current-participation exports aligned", () => {
    const route = readFileSync("src/routes/confirmations/admin/countries.tsx", "utf8");
    expect(route).toContain("list.sort((a, b) => new Date(b.submitted_at).getTime()");
    expect(route).toContain("const current = currentParticipatingCountryResponse(list);");
    expect(route).toContain("return current ? { country, submission: current, status: countryStatus(current) } : null;");
    expect(route).toContain("const status = countryStatus(latest);");
    expect(route).toContain("participatingStatuses.map((item) => item.country)");
    expect(route).not.toContain("list.find((row) => row.participating)");
    expect(route).not.toContain("countryStatus(latestParticipating)");
  });
});
