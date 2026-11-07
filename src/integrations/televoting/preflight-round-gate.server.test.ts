import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({
  queriedTables: [] as string[],
  rounds: [] as Array<{ id: string; edition_id: string; name: string; status: string }>,
  roundError: null as { message: string } | null,
  loadCanonical: vi.fn(),
  loadSettings: vi.fn(),
  limit: vi.fn(),
}));

// No network or hosted Supabase client is instantiated by this test.
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    schema: () => ({
      from: (table: string) => {
        fixture.queriedTables.push(table);
        if (table !== "rounds") {
          throw new Error("Historical voting queries must not run before round validation");
        }
        return {
          select: () => ({
            order: async () => ({ data: fixture.rounds, error: fixture.roundError }),
          }),
        };
      },
    }),
  },
}));

vi.mock("@/integrations/televoting/canonical-context.server", () => ({
  canonicalEditionForRound: vi.fn(),
  loadCanonicalVotingContextServer: fixture.loadCanonical,
}));

vi.mock("@/integrations/televoting/friend-voting-settings.server", () => ({
  loadFriendVotingSettingsServer: fixture.loadSettings,
}));

vi.mock("@/integrations/televoting/network.server", () => ({
  getTelevotingNetworkSignals: () => ({ ipHash: "isolated-ci-fixture" }),
}));

vi.mock("@/integrations/televoting/rate-limit.server", () => ({
  enforceTelevotingRateLimit: fixture.limit,
}));

import { runVoteIntegrityPreflightServer } from "./preflight.server";

const validInput = {
  roundId: "round-1",
  username: "testvoter",
  countryCode: "OL",
  entries: [],
};

beforeEach(() => {
  fixture.queriedTables.length = 0;
  fixture.rounds = [];
  fixture.roundError = null;
  fixture.loadCanonical.mockReset();
  fixture.loadSettings.mockReset();
  fixture.limit.mockReset();
});

describe("S8 Televote preflight round gate", () => {
  it("rejects incomplete ballot identities without Supabase reads", async () => {
    await expect(
      runVoteIntegrityPreflightServer({ ...validInput, roundId: "" }),
    ).rejects.toThrow("Ballot identity is incomplete");
    expect(fixture.queriedTables).toEqual([]);
    expect(fixture.loadCanonical).not.toHaveBeenCalled();
    expect(fixture.loadSettings).not.toHaveBeenCalled();
  });

  it("rejects unknown rounds before loading any private voting history", async () => {
    await expect(runVoteIntegrityPreflightServer(validInput)).rejects.toThrow(
      "Voting round not found",
    );
    expect(fixture.queriedTables).toEqual(["rounds"]);
    expect(fixture.loadCanonical).not.toHaveBeenCalled();
    expect(fixture.loadSettings).not.toHaveBeenCalled();
  });

  it("rejects closed rounds before loading canonical HOD history", async () => {
    fixture.rounds = [
      { id: "round-1", edition_id: "edition-1", name: "Grand Final", status: "closed" },
    ];
    await expect(runVoteIntegrityPreflightServer(validInput)).rejects.toThrow(
      "Voting round is not open",
    );
    expect(fixture.queriedTables).toEqual(["rounds"]);
    expect(fixture.loadCanonical).not.toHaveBeenCalled();
    expect(fixture.loadSettings).not.toHaveBeenCalled();
  });

  it("fails closed on the round-query error without continuing to the expensive reads", async () => {
    fixture.roundError = { message: "Local round lookup unavailable" };
    await expect(runVoteIntegrityPreflightServer(validInput)).rejects.toThrow(
      "Local round lookup unavailable",
    );
    expect(fixture.queriedTables).toEqual(["rounds"]);
    expect(fixture.loadCanonical).not.toHaveBeenCalled();
    expect(fixture.loadSettings).not.toHaveBeenCalled();
  });

  it("enters the historical analysis only after verifying an open round", async () => {
    fixture.rounds = [
      { id: "round-1", edition_id: "edition-1", name: "Grand Final", status: "open" },
    ];
    await expect(runVoteIntegrityPreflightServer(validInput)).rejects.toThrow(
      "Historical voting queries must not run before round validation",
    );
    expect(fixture.queriedTables).toEqual(["rounds", "vote_submissions"]);
    expect(fixture.loadCanonical).toHaveBeenCalledTimes(1);
    expect(fixture.loadSettings).toHaveBeenCalledTimes(1);
  });
});
