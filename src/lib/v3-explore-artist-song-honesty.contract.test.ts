import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../components/v3/V3ExploreScreen.tsx", import.meta.url),
  "utf8",
);

describe("V3 Explore Artist/Song identity honesty", () => {
  it("describes current music discovery as published Entry context, not first-class entity identity", () => {
    expect(screen).toContain(
      '"songs-and-artists": "Published song and artist labels in their Entry and Edition context"',
    );
    expect(screen).toContain("Find any public edition, country, entry, show or story");
    expect(screen).not.toContain("The songs and artists in the public Solaris catalogue");
  });

  it("does not advertise standalone Artist or Song routes before System identity exists", () => {
    expect(screen).not.toMatch(/\/artists\//);
    expect(screen).not.toMatch(/\/songs\//);
  });
});