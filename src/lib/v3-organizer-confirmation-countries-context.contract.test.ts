import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const route = readFileSync("src/routes/confirmations/admin/countries.tsx", "utf8");

describe("V3 Organizer responses-by-country edition boundary", () => {
  it("does not substitute the active or first Confirmation edition", () => {
    expect(route).toContain('editionRows.find((item) => item.id === organizerEditionId)?.id ?? ""');
    expect(route).not.toContain('item.status === "active"');
    expect(route).not.toContain("editionRows[0]");
    expect(route).toContain('<option value="">Select edition…</option>');
  });

  it("keeps displayed response state inside the selected edition", () => {
    expect(route).toContain('editionId ? rows.filter((row) => row.editions?.id === editionId) : []');
    expect(route).toContain("data-v3-organizer-confirmation-countries");
    expect(route).toContain("will not merge responses across editions");
  });
});
