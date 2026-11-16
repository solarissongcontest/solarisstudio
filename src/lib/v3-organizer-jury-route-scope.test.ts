import { describe, expect, it } from "vitest";
import { juryEditionSlugFromPath } from "./v3-organizer-jury-route-scope";

describe("Organizer Jury route edition isolation", () => {
  it("accepts the exact edition URL", () => {
    expect(juryEditionSlugFromPath("/admin/jury/ssc22")).toBe("ssc22");
  });
  it("preserves edition identity on nested Jury pages", () => {
    expect(juryEditionSlugFromPath("/admin/jury/ssc22/ballots/review")).toBe("ssc22");
  });
  it("does not substitute a nested resource ID as edition", () => {
    expect(juryEditionSlugFromPath("/admin/jury/ssc21/ballots/ssc22")).toBe("ssc21");
  });
  it("fails closed for missing, unrelated, or malformed paths", () => {
    for (const path of ["/admin/jury", "/admin/televote/ssc22", "/admin/jury/%ZZ", "/admin/jury/ssc%2F22"]) {
      expect(juryEditionSlugFromPath(path)).toBeNull();
    }
  });
});
