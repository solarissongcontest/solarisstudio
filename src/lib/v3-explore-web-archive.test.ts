import { describe, expect, it } from "vitest";
import { selectExploreWebArchiveHighlights } from "./v3-explore-web-archive";

type Fixture = { id: string; slug: string; status: string; edition_number: number; published: boolean };
const fixture = (id: string, number: number, status = "archived", published = true): Fixture => ({
  id, slug: id, status, edition_number: number, published,
});

describe("Explore web historical highlights", () => {
  it("bounds previews to four most recent terminal, published, approved editions", () => {
    const list = [
      fixture("current", 29, "active"), fixture("archive28", 28, "archived"),
      fixture("archive27", 27, "completed"), fixture("draft26", 26, "archived", false),
      fixture("archive25", 25), fixture("blocked24", 24), fixture("archive23", 23),
      fixture("archive22", 22), fixture("archive21", 21),
    ];
    expect(selectExploreWebArchiveHighlights(list, "current", href => href !== "/editions/blocked24").map(x=>x.id))
      .toEqual(["archive28", "archive27", "archive25", "archive23"]);
  });
  it("fails closed on missing public release authorization and does not mutate input", () => {
    const source = [fixture("a", 1), fixture("b", 2, "jury_voting"), fixture("c", 3)];
    const snapshot = JSON.stringify(source);
    expect(selectExploreWebArchiveHighlights(source, null, () => false)).toEqual([]);
    expect(selectExploreWebArchiveHighlights(source, null, () => true).map(x=>x.id)).toEqual(["c", "a"]);
    expect(JSON.stringify(source)).toEqual(snapshot);
  });
});
