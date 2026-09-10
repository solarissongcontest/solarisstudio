import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

describe("Friend Voting database historical fast path", () => {
  it("routes country history through the database aggregation instead of rebuilding every observation in the Worker", () => {
    const functions = source("integrations/televoting/intelligence.functions.ts");
    const fastPath = source("integrations/televoting/historical-country-intelligence.server.ts");

    expect(functions).toContain("historical-country-intelligence.server");
    expect(functions).toContain('data.lens === "country"');
    expect(functions).toContain("getHistoricalCountryIntelligenceServer");
    expect(fastPath).toContain('"friend_voting_historical_country_payload"');
    expect(fastPath).toContain("p_limit: 250");
    expect(fastPath).toContain("CACHE_TTL_MS = 30_000");
  });

  it("authenticates before serving the shared short-lived cache", () => {
    const fastPath = source("integrations/televoting/historical-country-intelligence.server.ts");
    const auth = fastPath.indexOf("await requireMergedTelevotingAdminServer()");
    const cache = fastPath.indexOf("await cachedPayload(options)");

    expect(auth).toBeGreaterThan(-1);
    expect(cache).toBeGreaterThan(auth);
  });

  it("preserves full relationship counts even though the response only carries the top 250 relationships", () => {
    const functions = source("integrations/televoting/intelligence.functions.ts");

    expect(functions).toContain("function relationshipStats");
    expect(functions).toContain("result.stats?.relationships");
    expect(functions).toContain("allRelationships.slice(0, LIGHTWEIGHT_RELATIONSHIP_LIMIT)");
  });

  it("keeps Friend Voting failures structured without changing global error middleware", () => {
    const functions = source("integrations/televoting/intelligence.functions.ts");
    const start = source("start.ts");

    expect(functions).toContain("friendVotingServerError");
    expect(functions).toContain("statusCode: 500");
    expect(functions).toContain("historical country aggregation");
    expect(start).not.toContain("friendVotingServerError");
  });

  it("ships the production RPC as a locked-down migration", () => {
    const migration = source("../supabase/migrations/20260910201500_friend_voting_historical_country_fastpath.sql");

    expect(migration).toContain("friend_voting_historical_country_payload");
    expect(migration).toContain("security definer");
    expect(migration).toContain("has_role(auth.uid(), 'organizer'::public.app_role)");
    expect(migration).toContain("revoke all on function public.friend_voting_historical_country_payload");
    expect(migration).toContain("grant execute on function public.friend_voting_historical_country_payload");
  });
});
