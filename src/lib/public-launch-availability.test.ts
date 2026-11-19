import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { clearPrivateAccountQueries } from "./account-cache-isolation";
import { evaluateFeatureFlag } from "./feature-flags";
import { PUBLIC_LAUNCH_ROUTES, LIMITED_PUBLIC_LAUNCH, limitedPublicLaunchAllows, publicLaunchAllows, standardPublicLaunchAllows } from "./public-launch-availability";
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
    for (const path of core) expect(standardPublicLaunchAllows(path)).toBe(true);
  });
  it("fails closed for every deferred family and nested/notification link", () => {
    // A legacy Confirmation alias must not appear available while its
    // redirect destination is deliberately held behind soft-launch gating.
    expect(standardPublicLaunchAllows("/confirmations")).toBe(true);
    expect(standardPublicLaunchAllows("/confirmations/next-in-line")).toBe(false);
    expect(standardPublicLaunchAllows("/confirmations/next-in-line?notice=1")).toBe(false);
    for (const { path } of PUBLIC_LAUNCH_ROUTES) {
      expect(standardPublicLaunchAllows(path)).toBe(false);
      expect(standardPublicLaunchAllows(`${path}/detail?notice=1#section`)).toBe(false);
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
      expect(standardPublicLaunchAllows("/fantasy", { fantasy_ssc: evaluated })).toBe(expected);
    }
  });
  it("does not reuse an edition-only opt-in as a global discovery grant", () => {
    const rule = { enabled: true, editionIds: ["approved-edition"] };
    for (const editionId of [null, "another-edition"]) {
      expect(standardPublicLaunchAllows("/fantasy", { fantasy_ssc: evaluateFeatureFlag(rule, { userId: "tester", editionId }) })).toBe(false);
    }
    expect(standardPublicLaunchAllows("/fantasy", { fantasy_ssc: evaluateFeatureFlag(rule, { userId: "tester", editionId: "approved-edition" }) })).toBe(true);
  });
  it("reacts to a revoked/disabled decision without treating existence or truthy strings as approval", () => {
    expect(standardPublicLaunchAllows("/world/organizations", { terra_world_public: true })).toBe(true);
    for (const decision of [false, undefined, null, "true", 1]) {
      expect(standardPublicLaunchAllows("/world", { terra_world_public: decision as boolean })).toBe(false);
    }
    expect(standardPublicLaunchAllows("/analysis", { fantasy_ssc: true, terra_world_public: true })).toBe(
      false,
    );
  });
  it("does not open similarly named protected routes or hide unrelated published routes", () => {
    expect(standardPublicLaunchAllows("/worldbuilding-rules")).toBe(true);
    expect(standardPublicLaunchAllows("/%77orld/organizations")).toBe(false);
    expect(standardPublicLaunchAllows("/WORLD/organizations")).toBe(false);
    expect(standardPublicLaunchAllows("/broadcast-intelligence")).toBe(false);
    expect(standardPublicLaunchAllows("/world%2forganizations")).toBe(false);
    for (const bad of [
      "//evil.example/fantasy",
      "/%2577orld",
      "/%xx",
      "https://evil.example",
      "/\\world",
    ]) {
      expect(standardPublicLaunchAllows(bad)).toBe(false);
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
        standardPublicLaunchAllows(item.href, flags),
      );
      const directory = siteDirectoryDestinations().filter((item) =>
        standardPublicLaunchAllows(item.to, flags),
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

describe("restricted public release", () => {
  it("keeps the restricted surface turned on", () => {
    expect(LIMITED_PUBLIC_LAUNCH).toBe(true);
  });
  it.each([
    "/", "/participate", "/participate/", "/confirmations", "/confirmations/edit/token",
    "/confirmations/recover", "/jury-voting", "/televoting", "/televoting/how-to-vote",
    "/auth", "/auth/reset", "/rules", "/rules/chapters/1", "/rules/v4-2-preview",
    "/my-solaris/entry", "/my-solaris/tasks", "/my-solaris/notices", "/my-solaris/voting",
  ])("allows required surfaces: %s", (path) => {
    expect(limitedPublicLaunchAllows(path)).toBe(true);
    expect(publicLaunchAllows(path)).toBe(true);
  });
  it.each([
    "/explore", "/countries", "/editions", "/results", "/me", "/my-solaris",
    "/my-solaris/account", "/admin", "/settings", "/guide", "/site-directory",
    "/notifications", "/world", "/fantasy", "/prediction-league",
    "/tools", "/shows", "/archive", "/televoting/results",
    "/televoting/admin", "/confirmations/admin", "/confirmations/next-in-line",
    "/next-in-line", "/rules-archive",
  ])("hides other public pages even with optional flags: %s", (path) => {
    expect(publicLaunchAllows(path, {
      fantasy_ssc: true, prediction_league: true,
      country_voting_dna: true, terra_world_public: true,
    })).toBe(false);
  });
  it.each([
    "//evil.example/participate", "/%2fparticipate", "/%xx", "/\\participate",
    "https://evil.example/rules", "/%2572ules", "/rules%2f..%2fresults",
  ])("rejects ambiguous href: %s", (path) => {
    expect(publicLaunchAllows(path)).toBe(false);
  });
  it("excludes unapproved nested participation features", () => {
    expect(publicLaunchAllows("/confirmations/next-in-line?notice=1")).toBe(false);
    expect(publicLaunchAllows("/rules?edition=current")).toBe(true);
  });
});
