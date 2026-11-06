import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import {
  clearPrivateAccountQueries,
  createAccountCacheIsolationHandler,
  isPrivateAccountQuery,
} from "./account-cache-isolation";

const privateFanKeys = [
  ["fan-follows", "actor-A"],
  ["fan-event-reads", "actor-A"],
  ["notification-preferences", "actor-A"],
  ["fan-profile", "actor-A"],
  ["my-prediction", "round-1", "actor-A"],
  ["prediction-history", "actor-A"],
  ["fan-taste-ballots", "actor-A"],
  // Both the legacy and actor-qualified Fantasy key layouts must be evicted.
  ["fantasy-my-team", "game-1"],
  ["fantasy-my-team-entries", "team-1"],
  ["fantasy-my-team", "game-1", "actor-A"],
  ["fantasy-my-team-entries", "actor-A", "team-1"],
  ["v3-follow-entity-details", "actor-A", "countries"],
] as const;

const publicKeys = [
  ["countries"],
  ["content-events"],
  ["prediction-rounds"],
  ["prediction-consensus", "round-1"],
  ["fantasy-games"],
  ["fantasy-leaderboard", "game-1"],
  ["fantasy-standings", "game-1"],
  ["fan-public-profile", "actor-A"],
  // Exact roots must not accidentally match similarly named public queries.
  ["fantasy-my-team-public-summary", "game-1"],
] as const;

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe("V3 private fan/Fantasy cache account isolation", () => {
  it("classifies private fan query families without evicting public projections", () => {
    for (const key of privateFanKeys) {
      expect(isPrivateAccountQuery(key)).toBe(true);
    }
    for (const key of publicKeys) {
      expect(isPrivateAccountQuery(key)).toBe(false);
    }
  });

  it("evicts private data before publishing B's session after A signs in", () => {
    const client = makeClient();
    const seenPrivateAtPublish: unknown[] = [];
    const unsubscribe = client.getQueryCache().subscribe(() => {
      if (client.getQueryData<{ id: string }>(["fan-session"])?.id === "actor-B") {
        seenPrivateAtPublish.push(client.getQueryData(["fan-follows", "actor-A"]));
      }
    });
    const handleSession = createAccountCacheIsolationHandler(client, () => {});
    handleSession({ id: "actor-A" });

    for (const key of privateFanKeys) client.setQueryData([...key], "actor A private");
    for (const key of publicKeys) client.setQueryData([...key], "public value");

    handleSession({ id: "actor-B" });
    for (const key of privateFanKeys) expect(client.getQueryData([...key])).toBeUndefined();
    for (const key of publicKeys) expect(client.getQueryData([...key])).toBe("public value");
    expect(client.getQueryData(["fan-session"])).toEqual({ id: "actor-B" });
    expect(seenPrivateAtPublish.every((value) => value === undefined)).toBe(true);

    unsubscribe();
    client.clear();
  });

  it("evicts newly cached private data on sign-out and repeated account switches", () => {
    const client = makeClient();
    let resets = 0;
    const handleSession = createAccountCacheIsolationHandler(client, () => { resets += 1; });
    handleSession({ id: "actor-A" });
    client.setQueryData(["fan-profile", "actor-A"], { name: "A" });

    handleSession({ id: "actor-B" });
    expect(client.getQueryData(["fan-profile", "actor-A"])).toBeUndefined();
    client.setQueryData(["my-prediction", "round-2", "actor-B"], "B secret");

    handleSession(null);
    expect(client.getQueryData(["my-prediction", "round-2", "actor-B"])).toBeUndefined();
    expect(client.getQueryData(["fan-session"])).toBeNull();

    handleSession({ id: "actor-A" });
    expect(client.getQueryData(["fan-profile", "actor-A"])).toBeUndefined();
    expect(resets).toBe(4);
    client.clear();
  });

  it("cancels and removes A's in-flight fan read so it cannot rehydrate after B arrives", async () => {
    const client = makeClient();
    const handleSession = createAccountCacheIsolationHandler(client, () => {});
    handleSession({ id: "actor-A" });

    let resolveLate: (value: string) => void = () => undefined;
    const pending = client.fetchQuery({
      queryKey: ["fan-follows", "actor-A"],
      queryFn: () => new Promise<string>((resolve) => { resolveLate = resolve; }),
    }).catch(() => undefined);

    handleSession({ id: "actor-B" });
    client.setQueryData(["fan-follows", "actor-B"], "B's follows");
    resolveLate("A's late private response");
    await pending;

    expect(client.getQueryData(["fan-follows", "actor-A"])).toBeUndefined();
    expect(client.getQueryData(["fan-follows", "actor-B"])).toBe("B's follows");
    client.clear();
  });

  it("uses the same canonical cleanup helper rather than a second fan-only logout path", () => {
    const client = makeClient();
    for (const key of privateFanKeys) client.setQueryData([...key], true);
    client.setQueryData(["prediction-rounds"], ["published"]);
    clearPrivateAccountQueries(client);
    for (const key of privateFanKeys) expect(client.getQueryData([...key])).toBeUndefined();
    expect(client.getQueryData(["prediction-rounds"])).toEqual(["published"]);
    client.clear();
  });
});
