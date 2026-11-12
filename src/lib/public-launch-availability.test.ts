import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { clearPrivateAccountQueries } from "./account-cache-isolation";
import { evaluateFeatureFlag } from "./feature-flags";
import { PUBLIC_LAUNCH_ROUTES, publicLaunchAllows } from "./public-launch-availability";
import { navigationSearchResults } from "./public-search";
import { siteDirectoryDestinations } from "./v3-site-directory";

const core = [
  "/",
  "/explore",
  "/participate",
  "/results",
  "/me",
  "/my-solaris/account",
  "/auth",
  "/confirmations",
  "/jury-voting",
  "/televoting",
  "/rules",
  "/editions/published",
  "/shows/published",
  "/countries/fi",
];

describe("Public soft-launch presentation policy", () => {
  it("preserves primary destinations and canonical contest services with no optional rollout", () => {
    for (const path of core) expect(publicLaunchAllows(path)).toBe(true);
  });
  it("fails closed for every deferred family and nested/notification link", () => {
    for (const { path } of PUBLIC_LAUNCH_ROUTES) {
      expect(publicLaunchAllows(path)).toBe(false);
      expect(publicLaunchAllows(`${path}/detail?notice=1#section`)).toBe(false);
    }
  });
  it("uses the existing evaluated server flag for PUBLIC and TESTING eligibility", () => {
    const publicRule = { enabled: true };
    const testing = { enabled: true, userIds: ["tester"] };
    for (const [userId, rule, expected] of [
      [null, publicRule, true],
      ["tester", testing, true],
      ["ordinary", testing, false],
      [null, testing, false],
    ] as const) {
      const evaluated = evaluateFeatureFlag(rule, { userId });
      expect(publicLaunchAllows("/fantasy", { fantasy_ssc: evaluated })).toBe(expected);
    }
  });
  it("reacts to a revoked/disabled decision without treating existence or truthy strings as approval", () => {
    expect(publicLaunchAllows("/world/organizations", { terra_world_public: true })).toBe(true);
    for (const decision of [false, undefined, null, "true", 1]) {
      expect(publicLaunchAllows("/world", { terra_world_public: decision as boolean })).toBe(false);
    }
    expect(publicLaunchAllows("/analysis", { fantasy_ssc: true, terra_world_public: true })).toBe(
      false,
    );
  });
  it("does not open similarly named protected routes or hide unrelated published routes", () => {
    expect(publicLaunchAllows("/worldbuilding-rules")).toBe(true);
    expect(publicLaunchAllows("/%77orld/organizations")).toBe(false);
    expect(publicLaunchAllows("/world%2forganizations")).toBe(false);
    for (const bad of [
      "//evil.example/fantasy",
      "/%2577orld",
      "/%xx",
      "https://evil.example",
      "/\\world",
    ]) {
      expect(publicLaunchAllows(bad)).toBe(false);
    }
  });
  it("applies one decision consistently to Search and the site/Explore directory", () => {
    for (const flags of [
      {},
      {
        fantasy_ssc: true,
        prediction_league: true,
        country_voting_dna: true,
        terra_world_public: true,
      },
    ]) {
      const search = navigationSearchResults("").filter((item) =>
        publicLaunchAllows(item.href, flags),
      );
      const directory = siteDirectoryDestinations().filter((item) =>
        publicLaunchAllows(item.to, flags),
      );
      expect(search.map((item) => item.href).sort()).toEqual(
        directory.map((item) => item.to).sort(),
      );
      expect(search.some((item) => item.href === "/fantasy")).toBe(flags.fantasy_ssc === true);
    }
  });
  it("evicts decisions at the existing private account boundary, including delayed results", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["studio2-public-launch", "A", 1], { fantasy_ssc: true });
    client.setQueryData(["countries"], ["published"]);
    let finish!: (value: unknown) => void;
    const pending = client
      .fetchQuery({
        queryKey: ["studio2-public-launch", "A", 2],
        queryFn: () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      })
      .catch(() => undefined);
    clearPrivateAccountQueries(client);
    client.setQueryData(["studio2-public-launch", "B", 3], { fantasy_ssc: false });
    finish({ fantasy_ssc: true });
    await pending;
    expect(client.getQueryData(["studio2-public-launch", "A", 1])).toBeUndefined();
    expect(client.getQueryData(["studio2-public-launch", "A", 2])).toBeUndefined();
    expect(client.getQueryData(["studio2-public-launch", "B", 3])).toEqual({ fantasy_ssc: false });
    expect(client.getQueryData(["countries"])).toEqual(["published"]);
    client.clear();
  });
});
