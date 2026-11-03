import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveTelevotingAvailability } from "./v3-televote-availability";

describe("public Televote backend readiness", () => {
  it("never opens the booth while readiness is being checked", () => {
    expect(resolveTelevotingAvailability(undefined, true, false)).toBe("checking");
    expect(resolveTelevotingAvailability({ votingReady: true }, true, false)).toBe("checking");
  });

  it("only opens the booth after an affirmative check", () => {
    expect(resolveTelevotingAvailability({ votingReady: true }, false, false)).toBe("ready");
    expect(resolveTelevotingAvailability({ votingReady: false }, false, false)).toBe("unavailable");
    expect(resolveTelevotingAvailability(undefined, false, false)).toBe("error");
  });

  it("fails closed on a status error, including with stale ready data", () => {
    expect(resolveTelevotingAvailability({ votingReady: true }, false, true)).toBe("error");
    expect(resolveTelevotingAvailability(undefined, false, true)).toBe("error");
  });
});

describe("public Televote route lifecycle wiring", () => {
  const route = readFileSync(
    new URL("../routes/televoting/index.tsx", import.meta.url),
    "utf8",
  );

  it("keys the stateful booth to its round to prevent ballot or receipt carry-over", () => {
    expect(route).toMatch(/<TelevotingBoothWithReceipt\s+key=\{data\.round\.id\}/);
  });

  it("checks readiness only for an open round and refreshes after failure", () => {
    expect(route).toContain('queryKey: ["merged-televoting-server-status", data?.round.id]');
    expect(route).toContain("enabled: Boolean(data)");
    expect(route).toContain("refetchInterval: (query) => query.state.data?.votingReady ? false : 60_000");
    expect(route).toContain("refetch: refetchStatus");
    expect(route).toContain("resolveTelevotingAvailability(serverStatus, statusPending, statusError)");
  });

  it("invalidates readiness when a round changes over realtime", () => {
    expect(route).toContain('queryClient.invalidateQueries({ queryKey: ["merged-televoting-server-status"] })');
  });
});
