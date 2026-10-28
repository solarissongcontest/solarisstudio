import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const cutover = source(
  "supabase/migrations/20261027214500_v3_media_immutable_publication_cutover.sql",
);

describe("V3 verified media publication immutability", () => {
  it.each([
    "country media bucket owner delete",
    "country fonts owner delete",
    "organizers delete edition artwork",
  ])("revokes final-bucket browser delete authority: %s", (policy) => {
    expect(cutover).toContain(`drop policy if exists "${policy}" on storage.objects`);
  });

  it("retains reference unbinding outside Storage mutation authority", () => {
    const background = source("src/lib/country-background.ts");
    expect(background).not.toContain('.from("country-media").remove');
    expect(background).not.toContain("removeCountryBackground");
  });

  it("documents replacement as a new immutable publication rather than in-place byte mutation", () => {
    expect(cutover).toContain("Canonical final objects are generated at unguessable/versioned paths");
    expect(cutover).toContain("Replacement creates another verified object");
    expect(cutover).toContain("physical retirement requires an explicit governed media lifecycle operation");
  });
});
