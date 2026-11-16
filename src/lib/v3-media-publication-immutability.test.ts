import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const cutover = source(
  "docs/v3/recovery-candidates/media-storage-policy-owner-cutover.sql",
);

describe("V3 verified media publication immutability", () => {
  it.each([
    "country media bucket owner delete",
    "country fonts owner delete",
    "organizers delete edition artwork",
  ])("revokes final-bucket browser delete authority: %s", (policy) => {
    expect(cutover).toContain(`drop policy "${policy}" on storage.objects`);
  });

  it("retains reference unbinding outside Storage mutation authority", () => {
    const background = source("src/lib/country-background.ts");
    expect(background).not.toContain('.from("country-media").remove');
    expect(background).not.toContain("removeCountryBackground");
  });

  it("documents replacement as a new immutable publication rather than in-place byte mutation", () => {
    expect(cutover).toContain("actual Storage table owner");
    expect(cutover).toContain("Unrelated Storage policy or RLS changed");
    expect(cutover).toContain("No production authorization");
    expect(source("src/lib/country-account.ts")).toContain("removes country/profile references");
  });
});
