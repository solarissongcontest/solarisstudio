import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  commit: vi.fn(),
  read: vi.fn(),
}));

vi.mock("@/integrations/televoting/conversion.server", () => ({
  CalculationCommitResponseError: class CalculationCommitResponseError extends Error {
    constructor(readonly attemptedVersion: number) {
      super("Calculation commit returned unexpected version");
    }
  },
  runMergedOfficialCalculationServer: mocked.commit,
  getMergedTelevoteConversionServer: mocked.read,
}));

import { CalculationCommitResponseError } from "@/integrations/televoting/conversion.server";
import { runMergedOfficialCalculationWithReadbackServer } from "@/integrations/televoting/conversion-readback.server";

function snapshot(version: number) {
  return {
    round: {
      calculation_version: version,
      results_status: "calculated",
      results_outdated: false,
      total_points_to_distribute: 20,
    },
    participants: ["AAA", "BBB"],
    stored: [
      { country_code: "AAA", calculation_version: version, final_points: 12 },
      { country_code: "BBB", calculation_version: version, final_points: 8 },
    ],
  };
}

beforeEach(() => {
  mocked.commit.mockReset();
  mocked.read.mockReset();
});

describe("committed calculation concurrency and uncertain response regression", () => {
  it("accepts the real successful RPC version when another organizer committed between reads", async () => {
    mocked.commit.mockResolvedValue({ version: 3, distributedTotal: 20, totalPoints: 20 });
    mocked.read.mockResolvedValue(snapshot(3));
    const result = await runMergedOfficialCalculationWithReadbackServer("round");
    expect(result.version).toBe(3);
    expect(result.reconciledAfterUncertainOutcome).toBe(false);
    expect(mocked.commit).toHaveBeenCalledOnce();
    expect(mocked.read).toHaveBeenCalledOnce();
  });

  it("recovers a malformed successful scalar response using this operation's attempted version", async () => {
    mocked.commit.mockRejectedValue(new CalculationCommitResponseError(4));
    mocked.read.mockResolvedValue(snapshot(4));
    const result = await runMergedOfficialCalculationWithReadbackServer("round");
    expect(result.version).toBe(4);
    expect(result.distributedTotal).toBe(20);
    expect(result.reconciledAfterUncertainOutcome).toBe(true);
  });

  it("does not mistake a later organizer's version for this operation's uncertain commit", async () => {
    mocked.commit.mockRejectedValue(new CalculationCommitResponseError(4));
    mocked.read.mockResolvedValue(snapshot(5));
    await expect(runMergedOfficialCalculationWithReadbackServer("round"))
      .rejects.toThrow("version 5; expected 4");
  });

  it("propagates optimistic-concurrency failure without pretending the operation committed", async () => {
    mocked.commit.mockRejectedValue(new Error("STALE_VERSION: expected version changed"));
    await expect(runMergedOfficialCalculationWithReadbackServer("round"))
      .rejects.toThrow("STALE_VERSION");
    expect(mocked.read).not.toHaveBeenCalled();
  });

  it("rejects a committed version whose stored rows belong to an older calculation", async () => {
    mocked.commit.mockResolvedValue({ version: 5, distributedTotal: 20, totalPoints: 20 });
    const state = snapshot(5);
    state.stored[1].calculation_version = 4;
    mocked.read.mockResolvedValue(state);
    await expect(runMergedOfficialCalculationWithReadbackServer("round"))
      .rejects.toThrow("rows from another version");
  });

  it("rejects missing or duplicated canonical participant identities", async () => {
    mocked.commit.mockResolvedValue({ version: 5, distributedTotal: 20, totalPoints: 20 });
    const state = snapshot(5);
    state.stored[1].country_code = "AAA";
    mocked.read.mockResolvedValue(state);
    await expect(runMergedOfficialCalculationWithReadbackServer("round"))
      .rejects.toThrow("do not match the round lineup");
  });
});
