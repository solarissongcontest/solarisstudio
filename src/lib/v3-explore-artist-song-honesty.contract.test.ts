import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../components/v3/V3ExploreScreen.tsx", import.meta.url),
  "utf8",
);

describe("V3 Explore Artist/Song identity honesty", () => {
  it("describes staged first-class music identity without inventing Entry-based entity links", () => {
    expect(screen).toContain(
      '"songs-and-artists": "Publication-safe music discovery with durable Song and Artist identities"',
    );
    expect(screen).toContain("published entries, shows and stories");
    expect(screen).not.toContain("The songs and artists in the public Solaris catalogue");
  });

  it("does not invent direct Song or Artist identity routes in the Explore root", () => {
    expect(screen).not.toMatch(/\/artists\//);
    expect(screen).not.toMatch(/\/songs\//);
  });
});
