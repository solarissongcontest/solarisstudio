import { describe, expect, it } from "vitest";
import { LIMITED_PUBLIC_LAUNCH, limitedPublicLaunchAllows, publicLaunchAllows } from "./public-launch-availability";

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
