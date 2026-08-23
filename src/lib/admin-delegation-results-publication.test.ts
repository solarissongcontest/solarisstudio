import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("delegation contest-record result publication", () => {
  it("filters raw result rows through the show publication gate", () => {
    const countries = source("routes/confirmations/admin/countries.tsx");
    expect(countries).toContain('import { showPublishesResults } from "@/lib/publication"');
    expect(countries).toContain("const publishedResults = useMemo");
    expect(countries).toContain("showPublishesResults(showById.get(result.show_id ?? \"\"))");
    expect(countries).toContain("results: publishedResults");
  });

  it("does not render an edition result without a published result row", () => {
    const countries = source("routes/confirmations/admin/countries.tsx");
    expect(countries).toContain("const hasSelectedResult = Boolean(");
    expect(countries).toContain("selectedConfirmationEdition && hasSelectedResult");
    expect(countries).toContain("Results have not been published for this edition yet.");
  });
});
