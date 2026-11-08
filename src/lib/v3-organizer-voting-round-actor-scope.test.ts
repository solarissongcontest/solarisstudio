import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { votingRoundActorScopeKey } from "./v3-organizer-voting-round-actor-scope";

const route = readFileSync("src/routes/televoting/admin/rounds/$id.tsx", "utf8");

describe("Organizer voting-round actor and edition isolation", () => {
  it("partitions private round scope by actor, edition, and round", () => {
    const first = votingRoundActorScopeKey("actor-a", "edition-one", "round-one");
    expect(first).not.toEqual(votingRoundActorScopeKey("actor-b", "edition-one", "round-one"));
    expect(first).not.toEqual(votingRoundActorScopeKey("actor-a", "edition-two", "round-one"));
    expect(first).not.toEqual(votingRoundActorScopeKey("actor-a", "edition-one", "round-two"));
    expect(first).toEqual(votingRoundActorScopeKey("actor-a", "edition-one", "round-one"));
    expect(votingRoundActorScopeKey("", null, "")).toEqual([
      "v3-organizer-voting-round-scope",
      "signed-out",
      "unscoped",
      "missing-round",
    ]);
  });

  it("requires a signed-in actor and exact edition before requesting a private round read", () => {
    expect(route).toContain('const actorId = useAuthenticatedUser().id;');
    expect(route).toContain("votingRoundActorScopeKey(actorId, editionId, roundId)");
    expect(route).toContain("enabled: Boolean(actorId && editionId && roundId)");
    expect(route).toContain('getRoundsPage({ data: { editionId } })');
    expect(route).toContain("scopeEdition.solaris_id === editionId");
    expect(route).toContain("scopeEdition?.rounds.some((round) => round.id === roundId)");
  });

  it("does not render child controls from old data while authorization is pending, refreshing or failed", () => {
    expect(route).toContain("staleTime: 0");
    expect(route).toContain("gcTime: 0");
    expect(route).toContain('refetchOnMount: "always"');
    expect(route).toContain("retry: false");
    expect(route).toContain("if (scopeQuery.isPending || scopeQuery.isFetching)");
    expect(route).toContain("if (scopeQuery.error || !scopeQuery.isSuccess)");
    const checking = route.indexOf("if (scopeQuery.isPending || scopeQuery.isFetching)");
    const failed = route.indexOf("if (scopeQuery.error || !scopeQuery.isSuccess)");
    const outlet = route.indexOf("return <Outlet />;");
    expect(checking).toBeGreaterThan(0);
    expect(failed).toBeGreaterThan(checking);
    expect(outlet).toBeGreaterThan(failed);
  });
});
