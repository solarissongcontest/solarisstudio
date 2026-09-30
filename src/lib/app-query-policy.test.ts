import { describe, expect, it } from "vitest";

import {
  SOLARIS_QUERY_POLICY,
  freshnessLevelsForResume,
  solarisQueryPolicy,
} from "@/lib/app-query-policy";

describe("Solaris adaptive query freshness", () => {
  it("keeps live data much fresher than warm and cold data", () => {
    expect(SOLARIS_QUERY_POLICY.live.staleTime).toBeLessThan(
      SOLARIS_QUERY_POLICY.warm.staleTime,
    );
    expect(SOLARIS_QUERY_POLICY.warm.staleTime).toBeLessThan(
      SOLARIS_QUERY_POLICY.cold.staleTime,
    );
    expect(solarisQueryPolicy("live").refetchOnWindowFocus).toBe(true);
    expect(solarisQueryPolicy("cold").refetchOnReconnect).toBe(false);
  });

  it("refreshes only the classes that could have gone stale while backgrounded", () => {
    expect(freshnessLevelsForResume(5_000)).toEqual([]);
    expect(freshnessLevelsForResume(20_000)).toEqual(["live"]);
    expect(freshnessLevelsForResume(3 * 60_000)).toEqual(["live", "warm"]);
    expect(freshnessLevelsForResume(31 * 60_000)).toEqual([
      "live",
      "warm",
      "cold",
    ]);
  });

  it("tags policies so the lifecycle coordinator can target query classes", () => {
    expect(solarisQueryPolicy("live").meta.solarisFreshness).toBe("live");
    expect(solarisQueryPolicy("warm").meta.solarisFreshness).toBe("warm");
    expect(solarisQueryPolicy("cold").meta.solarisFreshness).toBe("cold");
  });
});
